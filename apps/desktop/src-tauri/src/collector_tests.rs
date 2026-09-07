// Purpose: the checks that stand between a web page and the browsing collector. Each one is a
// door that has to stay shut: a request that names any host but this listener's own, an event
// batch with the wrong key or none, and a pairing code presented a second time.

use crate::collector_http::{host_is_ours, parse_head, route, HttpRequest, Secrets};

const PORT: u16 = 40404;

fn request(method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> HttpRequest {
    HttpRequest {
        method: method.into(),
        path: path.into(),
        headers: headers.iter().map(|(k, v)| (k.to_ascii_lowercase(), v.to_string())).collect(),
        body: body.as_bytes().to_vec(),
    }
}

fn secrets() -> Secrets {
    Secrets { pairing_code: "abcdef0123456789abcdef0123456789".into(), tokens: Vec::new() }
}

fn go(request: &HttpRequest, secrets: &mut Secrets) -> (u16, String) {
    let response = route(request, PORT, secrets, || "tok-minted".to_string());
    (response.status, response.body)
}

#[test]
fn a_host_header_naming_anywhere_else_is_refused_before_anything_is_read() {
    // The shape of the attack: a name the attacker controls, resolving to 127.0.0.1. The
    // browser sends the attacker's hostname in Host, which is the only part they cannot forge.
    for host in ["evil.example:40404", "127.0.0.1:1", "127.0.0.1.evil.example:40404", "localhost"] {
        let mut state = secrets();
        let (status, _) = go(&request("POST", "/events", &[("Host", host)], "[]"), &mut state);
        assert_eq!(status, 403, "host {host} should not be accepted");
    }
    // And a request with no Host at all.
    let mut state = secrets();
    assert_eq!(go(&request("POST", "/events", &[], "[]"), &mut state).0, 403);
}

#[test]
fn both_spellings_of_this_machine_are_accepted() {
    assert!(host_is_ours(Some("127.0.0.1:40404"), PORT));
    assert!(host_is_ours(Some("localhost:40404"), PORT));
    assert!(!host_is_ours(Some("[::1]:40404"), PORT));
}

#[test]
fn events_need_a_key_that_pairing_actually_issued() {
    let mut state = secrets();
    let host = [("Host", "127.0.0.1:40404")];
    let with = |token: &str| {
        request("POST", "/events", &[host[0], ("X-Breadcrumb-Token", token)], "[{\"type\":\"click\"}]")
    };
    assert_eq!(go(&with("guessed"), &mut state).0, 403);
    assert_eq!(go(&request("POST", "/events", &host, "[]"), &mut state).0, 403);

    let paired = go(&request("POST", "/pair", &host, r#"{"code":"abcdef0123456789abcdef0123456789"}"#), &mut state);
    assert_eq!(paired.0, 200);
    assert!(paired.1.contains("tok-minted"));

    let (status, body) = go(&with("tok-minted"), &mut state);
    assert_eq!(status, 200);
    assert_eq!(body, r#"{"accepted":1}"#);
}

#[test]
fn a_pairing_code_works_once_and_never_again() {
    let mut state = secrets();
    let host = [("Host", "127.0.0.1:40404")];
    let pair = request("POST", "/pair", &host, r#"{"code":"abcdef0123456789abcdef0123456789"}"#);
    assert_eq!(go(&pair, &mut state).0, 200);
    // The same code replayed — from a screenshot, a shoulder, a second script.
    assert_eq!(go(&pair, &mut state).0, 403);
    // …and the key it already issued still works, so the learner loses nothing.
    let send = request("POST", "/events", &[host[0], ("X-Breadcrumb-Token", "tok-minted")], "[]");
    assert_eq!(go(&send, &mut state).0, 200);
}

#[test]
fn a_wrong_code_is_refused_and_does_not_burn_the_right_one() {
    let mut state = secrets();
    let host = [("Host", "127.0.0.1:40404")];
    assert_eq!(go(&request("POST", "/pair", &host, r#"{"code":"nope"}"#), &mut state).0, 403);
    assert_eq!(go(&request("POST", "/pair", &host, "not json"), &mut state).0, 400);
    let pair = request("POST", "/pair", &host, r#"{"code":"abcdef0123456789abcdef0123456789"}"#);
    assert_eq!(go(&pair, &mut state).0, 200);
}

#[test]
fn an_oversized_batch_is_refused_whole() {
    let mut state = secrets();
    let host = [("Host", "127.0.0.1:40404")];
    go(&request("POST", "/pair", &host, r#"{"code":"abcdef0123456789abcdef0123456789"}"#), &mut state);
    let batch = format!("[{}]", vec!["{}"; 501].join(","));
    let send = request("POST", "/events", &[host[0], ("X-Breadcrumb-Token", "tok-minted")], &batch);
    assert_eq!(go(&send, &mut state).0, 413);
}

#[test]
fn the_scripts_are_served_so_a_browser_can_install_them_from_this_machine() {
    let mut state = secrets();
    let host = [("Host", "127.0.0.1:40404")];
    for path in ["/script/bilibili.user.js", "/script/youtube.user.js"] {
        let (status, body) = go(&request("GET", path, &host, ""), &mut state);
        assert_eq!(status, 200);
        assert!(body.starts_with("// ==UserScript=="), "{path} should be a user script");
    }
    assert_eq!(go(&request("GET", "/", &host, ""), &mut state).0, 404);
    assert_eq!(go(&request("GET", "/../../etc/passwd", &host, ""), &mut state).0, 404);
}

#[test]
fn a_request_that_is_not_http_is_not_parsed_into_one() {
    assert!(parse_head("GET /events HTTP/1.1\r\nHost: 127.0.0.1:1\r\n").is_some());
    assert!(parse_head("GET /events\r\n").is_none());
    assert!(parse_head("hello").is_none());
}
