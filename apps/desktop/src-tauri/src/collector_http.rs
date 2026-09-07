// Purpose: the wire half of the browsing collector — parsing one HTTP/1.1 request and
// deciding what it is allowed to do. Kept apart from the socket and the disk (collector.rs)
// so every rule here is a plain function over plain values, and the tests that matter — a
// wrong Host, a wrong token, a pairing code used twice — need no listener at all.
//
// Two checks stand between a web page and this listener, and both are here.
//
// `Host`: a page cannot set that header, so requiring it to be exactly this listener's own
// address is what stops DNS rebinding — a name that resolves to 127.0.0.1 arrives carrying
// its own hostname and is refused before anything else is read.
//
// The token: the pairing code is exchanged once for a token, and only the token opens the
// event route. A page that guessed the port still has nothing to send with.
//
// There are deliberately no CORS headers anywhere in this file. A user script posts through
// its manager's own request API, which is not subject to CORS; an ordinary page therefore
// cannot read a single byte of what this answers, which is exactly the intent.

/// One parsed request. Header names are lowercased on the way in.
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }
}

/// What the caller should send back, plus anything the request handed us to keep.
pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub body: String,
    /// Non-empty only for an accepted event batch: the raw JSON values, to be spooled.
    pub events: Vec<serde_json::Value>,
}

impl Response {
    fn json(status: u16, body: &str) -> Self {
        Self { status, content_type: "application/json", body: body.into(), events: Vec::new() }
    }
}

/// The secrets one running collector holds. `pairing_code` is empty once it has been used —
/// a code is good for exactly one browser, and the app mints another when it needs one.
pub struct Secrets {
    pub pairing_code: String,
    pub tokens: Vec<String>,
}

/// Bodies above this are refused unread. A batch is a few hundred short titles.
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
/// Events per batch, matching the collector script's own splice size with room to spare.
pub const MAX_EVENTS_PER_BATCH: usize = 500;

/// The request line and headers, up to (not including) the blank line. None if it is not
/// HTTP/1.x at all.
pub fn parse_head(head: &str) -> Option<(String, String, Vec<(String, String)>)> {
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next()?.split(' ');
    let method = request_line.next()?.to_string();
    let path = request_line.next()?.to_string();
    if !request_line.next()?.starts_with("HTTP/1.") {
        return None;
    }
    let mut headers = Vec::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let (name, value) = line.split_once(':')?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    Some((method, path, headers))
}

/// Only this listener's own address, spelled either of the two ways a loopback URL can be.
/// A missing Host is refused too: HTTP/1.1 requires one, and the one client that matters
/// always sends it.
pub fn host_is_ours(host: Option<&str>, port: u16) -> bool {
    let Some(host) = host else {
        return false;
    };
    host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}")
}

fn string_field(body: &[u8], field: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    Some(value.get(field)?.as_str()?.to_string())
}

/// Constant-time-ish equality. The comparison is over 32 hex characters reachable only from
/// this machine, so the timing channel is theoretical; not leaking it costs one line.
fn secret_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() || left.is_empty() {
        return false;
    }
    left.bytes().zip(right.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

/// The whole routing table. `secrets` is taken mutably because a successful pairing consumes
/// the code and mints a token, and that has to be one atomic decision.
pub fn route(
    request: &HttpRequest,
    port: u16,
    secrets: &mut Secrets,
    new_token: impl FnOnce() -> String,
) -> Response {
    if !host_is_ours(request.header("host"), port) {
        return Response::json(403, r#"{"error":"host"}"#);
    }
    match (request.method.as_str(), request.path.as_str()) {
        ("POST", "/pair") => pair(request, secrets, new_token),
        ("POST", "/events") => events(request, secrets),
        ("GET", "/script/bilibili.user.js") => script(super::collector::BILIBILI_SCRIPT),
        ("GET", "/script/youtube.user.js") => script(super::collector::YOUTUBE_SCRIPT),
        _ => Response::json(404, r#"{"error":"unknown"}"#),
    }
}

fn pair(
    request: &HttpRequest,
    secrets: &mut Secrets,
    new_token: impl FnOnce() -> String,
) -> Response {
    let Some(code) = string_field(&request.body, "code") else {
        return Response::json(400, r#"{"error":"body"}"#);
    };
    if !secret_eq(&code, &secrets.pairing_code) {
        return Response::json(403, r#"{"error":"code"}"#);
    }
    // Used once and gone: a code left live would keep working for anything that ever saw it,
    // including a shoulder-surfed screenshot of the page that displayed it.
    secrets.pairing_code.clear();
    let token = new_token();
    secrets.tokens.push(token.clone());
    Response::json(200, &format!(r#"{{"token":"{token}"}}"#))
}

fn events(request: &HttpRequest, secrets: &Secrets) -> Response {
    let presented = request.header("x-breadcrumb-token").unwrap_or_default();
    if !secrets.tokens.iter().any(|token| secret_eq(presented, token)) {
        return Response::json(403, r#"{"error":"token"}"#);
    }
    let Ok(serde_json::Value::Array(events)) = serde_json::from_slice(&request.body) else {
        return Response::json(400, r#"{"error":"body"}"#);
    };
    if events.len() > MAX_EVENTS_PER_BATCH {
        return Response::json(413, r#"{"error":"batch"}"#);
    }
    let accepted = events.len();
    Response { status: 200, content_type: "application/json", body: format!(r#"{{"accepted":{accepted}}}"#), events }
}

fn script(text: &'static str) -> Response {
    Response {
        status: 200,
        content_type: "application/javascript; charset=utf-8",
        body: text.to_string(),
        events: Vec::new(),
    }
}

pub fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "Error",
    }
}
