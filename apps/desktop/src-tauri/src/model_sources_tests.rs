// Purpose: the tests for model_sources.rs — the order the sources are tried in, the URL each
// builds, and what happens when none of them answers. Beside the module because this crate
// holds every source file to the same 200-line ceiling.
//
// The one test that touches the real internet is `#[ignore]`d and run by hand:
//
//     cargo test --lib model_sources -- --ignored --nocapture
//
// It downloads the whole embedding model (328 MB) with the release host pointed at a port
// nothing listens on, which is the only honest way to show the fall-through to the mirror
// works end to end — pieces fetched, joined, hashed, renamed into place.

use super::{fetch_missing, sources_for, Source};
use crate::model_files::{is_complete_file, ModelFile, ModelSpec, MODEL_BASE_URL_ENV};
use crate::test_http::LocalRelease;

/// Seven bytes of "graph!!" and three of "{;}" — what the local release below serves, with
/// the digests of exactly those bodies so a file that lands is also a file that is kept.
const FILES: [ModelFile; 2] = [
    ModelFile {
        name: "model_int8.onnx",
        bytes: 7,
        sha256: "def6ba583d5564455d7cd30272966d2f34cb94571e44a5d220dffb9582dfbcd4",
    },
    ModelFile {
        name: "config.json",
        bytes: 3,
        sha256: "34eb75c8b7ab6234e4741f96ce66907ee7e263054381cc18fcabf828c6fca884",
    },
];
const SPEC: ModelSpec = ModelSpec {
    dir: "gte-multilingual-base",
    release: "gte-multilingual-base-int8-v1",
    files: &FILES,
};

fn scratch(name: &str) -> std::path::PathBuf {
    let dir =
        std::env::temp_dir().join(format!("breadcrumb-sources-{}-{name}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

/// The release first, because it is the faster download where it can be reached; the mirror
/// second, at the URL the browser edition builds from the same three parts (pinned in
/// packages/core-vectors/src/embeddingModel.test.ts).
#[test]
fn the_release_is_tried_first_and_the_mirror_is_where_the_browser_reads() {
    let sources = sources_for(&SPEC);
    assert_eq!(sources.len(), 2);
    match &sources[0] {
        Source::Release { base } => assert!(base.ends_with("/gte-multilingual-base-int8-v1/")),
        Source::Mirror { .. } => panic!("the release should come first"),
    }
    match &sources[1] {
        Source::Mirror { base } => assert_eq!(
            base,
            "https://cdn.jsdelivr.net/gh/Kali-Leo/breadcrumb-language-packs@gte-multilingual-base-int8-v1/models/gte-multilingual-base/"
        ),
        Source::Release { .. } => panic!("the mirror should come second"),
    }
    assert_eq!(
        sources[1].file_url("config.json"),
        "https://cdn.jsdelivr.net/gh/Kali-Leo/breadcrumb-language-packs@gte-multilingual-base-int8-v1/models/gte-multilingual-base/config.json"
    );
}

/// Port 9 is reserved for a service that discards everything and, on this machine, has
/// nothing listening — so a connection is refused at once rather than timing out. The error
/// has to name every source: a user reading "did not answer" once would try the one host
/// they know about, and the point is that both were tried.
#[test]
fn when_no_source_answers_the_error_names_each_and_nothing_lands() {
    let dir = scratch("dead");
    let dead = [
        Source::Release {
            base: "http://127.0.0.1:9/release/".into(),
        },
        Source::Mirror {
            base: "http://127.0.0.1:9/mirror/".into(),
        },
    ];
    let result = tauri::async_runtime::block_on(fetch_missing(&dir, &SPEC, &dead));
    let message = result.expect_err("nothing was listening");
    assert!(message.contains("the release did not answer"), "{message}");
    assert!(message.contains("the mirror did not answer"), "{message}");
    assert!(
        message.contains("gte-multilingual-base-int8-v1"),
        "{message}"
    );
    assert!(
        std::fs::read_dir(&dir).expect("dir").next().is_none(),
        "no file should land"
    );
    std::fs::remove_dir_all(&dir).ok();
}

const BODIES: [(&str, &[u8]); 2] = [("model_int8.onnx", b"graph!!"), ("config.json", b"{;}")];

/// One refusal is not the answer: the source that served the probe and then said 403 is
/// asked once more, and the second answer is the one that counts. The file that was refused
/// is the only one fetched again — the other landed the first time and is left alone.
#[test]
fn a_source_that_refuses_a_file_once_is_asked_again() {
    let dir = scratch("flaky");
    let release = LocalRelease::serve(&BODIES, Some("model_int8.onnx"));
    let sources = [Source::Release { base: release.base }];
    let result = tauri::async_runtime::block_on(fetch_missing(&dir, &SPEC, &sources));
    assert_eq!(result, Ok(()));
    assert_eq!(
        std::fs::read(dir.join("model_int8.onnx")).expect("graph"),
        b"graph!!"
    );
    assert!(is_complete_file(&dir.join("config.json")));
    std::fs::remove_dir_all(&dir).ok();
}

/// Two callers, one absent model, and every file crosses the wire once: the second caller
/// waits for the first and finds the files there. Without the lock both wrote the same
/// `.part` and one of them failed after a second full download (seen 2026-09-15: two
/// `embed_texts` during a first run, one answered "没有那个文件或目录").
#[test]
fn two_callers_asking_for_the_same_absent_model_download_it_once() {
    let dir = scratch("twice");
    let release = LocalRelease::serve(&BODIES, None);
    let sources = [Source::Release { base: release.base }];
    let (first, second) = tauri::async_runtime::block_on(async {
        tokio::join!(
            fetch_missing(&dir, &SPEC, &sources),
            fetch_missing(&dir, &SPEC, &sources)
        )
    });
    assert_eq!((first, second), (Ok(()), Ok(())));
    assert!(is_complete_file(&dir.join("model_int8.onnx")));
    assert!(is_complete_file(&dir.join("config.json")));
    assert_eq!(
        release.requests.load(std::sync::atomic::Ordering::SeqCst),
        BODIES.len(),
        "each file should be fetched once"
    );
    std::fs::remove_dir_all(&dir).ok();
}

/// The real thing, by hand only. Points the release at a dead port and asks for the actual
/// embedding model, so success can only have come from the mirror — 17 pieces joined into
/// one `.part`, hashed against the table in embeddings.rs, and renamed into place whole.
#[test]
#[ignore = "downloads 328 MB from jsDelivr; run with -- --ignored"]
fn a_dead_release_host_falls_through_to_the_mirror_and_the_files_land_whole() {
    let spec = &crate::embeddings::SPEC;
    let dir = scratch("mirror");
    std::env::set_var(MODEL_BASE_URL_ENV, "http://127.0.0.1:9/");
    let result = tauri::async_runtime::block_on(fetch_missing(&dir, spec, &sources_for(spec)));
    std::env::remove_var(MODEL_BASE_URL_ENV);
    assert_eq!(result, Ok(()));
    for file in spec.files {
        let path = dir.join(file.name);
        assert!(is_complete_file(&path), "{} should be whole", file.name);
        let landed = std::fs::metadata(&path).expect("landed").len();
        assert_eq!(
            landed, file.bytes,
            "{} should be {} bytes",
            file.name, file.bytes
        );
    }
    std::fs::remove_dir_all(&dir).ok();
}
