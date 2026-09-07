// Purpose: the desktop end of the browsing collector. A listener bound to 127.0.0.1 that the
// learner's browser script posts what it watched to, the pairing secret that gates it, and
// the spool the frontend drains. The rules live next door in collector_http.rs; this file owns
// the socket, the disk and the Tauri commands.
//
// This replaces starting a separate program: there is no daemon, no Python and no second
// database. Events land in a small file this app owns and are classified and stored by the
// app itself, so the learner's browsing never leaves the machine or even the app.
//
// Why a spool file rather than handing events straight to the webview: the collector runs
// whenever the app does, while the page that classifies is only mounted when someone opens
// the discovery view. The file is what makes "the app was open, the page was not" lossless.

use crate::collector_http::{
    parse_head, reason, route, HttpRequest, Response, Secrets, MAX_BODY_BYTES,
};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;

pub const BILIBILI_SCRIPT: &str = include_str!("../../src/assets/userscripts/bilibili-feed-mode.user.js");
pub const YOUTUBE_SCRIPT: &str = include_str!("../../src/assets/userscripts/youtube-feed-mode.user.js");

/// A stalled connection must not hold the accept loop; the one real client answers in
/// milliseconds over loopback.
const IO_TIMEOUT: Duration = Duration::from_secs(5);
/// The spool is drained on every visit to the discovery page. This ceiling exists for the
/// machine that never visits it: at a few hundred bytes an event, it is a few megabytes.
const MAX_SPOOL_BYTES: u64 = 8 * 1024 * 1024;

struct Collector {
    port: u16,
    secrets: Mutex<Secrets>,
    spool: Mutex<std::path::PathBuf>,
}

static COLLECTOR: OnceLock<Collector> = OnceLock::new();

/// 128 bits of operating-system randomness as hex. Short enough to read aloud, long enough
/// that guessing it is not a strategy.
fn secret() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("the operating system should provide randomness");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorInfo {
    pub port: u16,
    /// The code the browser script exchanges for its own key. Empty once it has been used —
    /// the frontend asks for a fresh one when it wants to connect another browser.
    pub pairing_code: String,
    /// How many browsers have paired. The page says "connected", never a number of tokens.
    pub paired: usize,
}

/// Starts the listener once and reports where it is. Idempotent: every later call just
/// answers, so the page may call it on every mount.
#[tauri::command]
pub fn browsing_collector_info(app: tauri::AppHandle, mint_code: bool) -> Result<CollectorInfo, String> {
    let collector = start(&app)?;
    let mut secrets = collector.secrets.lock().map_err(|_| "collector state".to_string())?;
    if mint_code && secrets.pairing_code.is_empty() {
        secrets.pairing_code = secret();
    }
    Ok(CollectorInfo {
        port: collector.port,
        pairing_code: secrets.pairing_code.clone(),
        paired: secrets.tokens.len(),
    })
}

/// Everything the collector has taken in since the last call, and empties the spool. Each
/// line is one event exactly as the script sent it: it is parsed, checked and classified in
/// TypeScript, where the classifier lives.
#[tauri::command]
pub fn take_browsing_events(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let collector = start(&app)?;
    let spool = collector.spool.lock().map_err(|_| "collector spool".to_string())?;
    let Ok(text) = std::fs::read_to_string(&*spool) else {
        return Ok(Vec::new());
    };
    // Truncate only after a successful read: a failed read leaves the events where they are.
    let _ = std::fs::write(&*spool, "");
    Ok(text.lines().filter_map(|line| serde_json::from_str(line).ok()).collect())
}

fn start(app: &tauri::AppHandle) -> Result<&'static Collector, String> {
    if let Some(collector) = COLLECTOR.get() {
        return Ok(collector);
    }
    let directory = app.path().app_data_dir().map_err(|_| "no app data directory".to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    // Port zero: the operating system picks a free one. A fixed port is a rendezvous anything
    // else on the machine can squat on, and it survives a crash as a dead address.
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    // Where a curious learner can see for themselves what this opened. The secret is not in
    // it: a file readable by every program on the machine is not where a key belongs.
    let _ = std::fs::write(
        directory.join("browsing-collector.json"),
        format!("{{\n  \"port\": {port},\n  \"boundTo\": \"127.0.0.1\"\n}}\n"),
    );
    let collector = COLLECTOR.get_or_init(|| Collector {
        port,
        secrets: Mutex::new(Secrets { pairing_code: String::new(), tokens: Vec::new() }),
        spool: Mutex::new(directory.join("browsing-events.jsonl")),
    });
    // Two callers can reach the bind above at once; only one of them wins the init. The loser
    // holds a socket on a port nothing knows about and whose Host check would refuse every
    // request anyway, so it is dropped here rather than served.
    if collector.port != port {
        return Ok(collector);
    }
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let _ = serve(stream, collector);
        }
    });
    Ok(collector)
}

fn serve(mut stream: TcpStream, collector: &Collector) -> std::io::Result<()> {
    stream.set_read_timeout(Some(IO_TIMEOUT))?;
    stream.set_write_timeout(Some(IO_TIMEOUT))?;
    let response = match read_request(&mut stream) {
        Some(request) => handle(&request, collector),
        None => Response { status: 400, content_type: "application/json", body: r#"{"error":"request"}"#.into(), events: Vec::new() },
    };
    if !response.events.is_empty() {
        spool(collector, &response.events);
    }
    let body = response.body.as_bytes();
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        response.status,
        reason(response.status),
        response.content_type,
        body.len(),
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn handle(request: &HttpRequest, collector: &Collector) -> Response {
    let Ok(mut secrets) = collector.secrets.lock() else {
        return Response { status: 500, content_type: "application/json", body: r#"{"error":"state"}"#.into(), events: Vec::new() };
    };
    route(request, collector.port, &mut secrets, secret)
}

fn spool(collector: &Collector, events: &[serde_json::Value]) {
    let Ok(path) = collector.spool.lock() else {
        return;
    };
    if std::fs::metadata(&*path).map(|meta| meta.len()).unwrap_or(0) > MAX_SPOOL_BYTES {
        return;
    }
    let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&*path) else {
        return;
    };
    for event in events {
        let _ = writeln!(file, "{event}");
    }
}

fn read_request(stream: &mut TcpStream) -> Option<HttpRequest> {
    let mut reader = BufReader::new(stream);
    let mut head = String::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 || head.len() > 8192 {
            return None;
        }
        let blank = line == "\r\n" || line == "\n";
        head.push_str(&line);
        if blank {
            break;
        }
    }
    let (method, path, headers) = parse_head(head.trim_end_matches("\r\n"))?;
    let length: usize = headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0);
    if length > MAX_BODY_BYTES {
        return None;
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;
    Some(HttpRequest { method, path, headers, body })
}
