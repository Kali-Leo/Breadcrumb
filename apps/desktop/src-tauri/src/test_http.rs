// Purpose: a release on this machine for the download tests — one thread, plain HTTP/1.1,
// serving whatever bodies a test hands it, counting every GET, and able to refuse a path with
// 403 exactly once. Shared by model_sources_tests.rs and anything else that needs a host
// that answers, so no test reaches the real internet by accident.
// Main exports: LocalRelease.

use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

pub struct LocalRelease {
    /// The directory URL, trailing slash included, to build a `Source` from.
    pub base: String,
    /// How many GETs have arrived, over every path.
    pub requests: Arc<AtomicUsize>,
}

impl LocalRelease {
    /// `files` are `(name, body)`; `refuse_once` names the file whose first request is answered
    /// 403 and whose second is served — the mirror's behaviour on 2026-09-15.
    pub fn serve(
        files: &'static [(&'static str, &'static [u8])],
        refuse_once: Option<&'static str>,
    ) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        std::thread::spawn(move || {
            let mut refused = false;
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(&stream);
                let mut line = String::new();
                reader.read_line(&mut line).ok();
                let mut header = String::new();
                while reader.read_line(&mut header).is_ok_and(|n| n > 2) {
                    header.clear();
                }
                let is_get = line.starts_with("GET ");
                let name = line
                    .split(' ')
                    .nth(1)
                    .unwrap_or("")
                    .rsplit('/')
                    .next()
                    .unwrap_or("");
                if is_get {
                    counter.fetch_add(1, Ordering::SeqCst);
                }
                let found = files
                    .iter()
                    .find(|(file, _)| *file == name)
                    .map(|(_, body)| *body);
                let (status, body): (&str, &[u8]) = match found {
                    Some(_) if is_get && refuse_once == Some(name) && !refused => {
                        refused = true;
                        ("403 Forbidden", b"")
                    }
                    Some(body) => ("200 OK", if is_get { body } else { b"" }),
                    None => ("404 Not Found", b""),
                };
                let mut out = &stream;
                let _ = write!(
                    out,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = out.write_all(body);
            }
        });
        Self {
            base: format!("http://127.0.0.1:{port}/r/"),
            requests,
        }
    }
}
