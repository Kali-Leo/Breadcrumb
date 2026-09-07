"""Purpose: retrain the browsing-interest topic (48-way) and emotion (9-way) classifiers on
Breadcrumb's own embedding model, and export their coefficients as an int8 JSON the app can
read. Development-only: run by hand when the taxonomy or the corpus changes, never by the
product. Ported from Kali-Leo/feed-mode (research/pipeline/emb_topics.py, train_emotions.py,
export_model.py), GPL-3.0, re-licensed AGPL-3.0-only by the copyright holder; modified
2026-09 (bge-small-zh -> multilingual-e5-small, joblib -> int8 JSON, reads the .jsonl.gz files
in place instead of a scratchpad copy).

THE CORPUS STAYS OUT OF THIS REPO. The 17,867 labelled titles live in the feed-mode repo
(research/data/) and are read from there via --data-dir. They are scraped video titles;
redistributing them inside an app shipped to learners is a risk this project does not take.
Only the trained coefficients cross over.

Two things the original pipeline got wrong and this script fixes:
  1. the scripts hardcoded a dead /tmp scratchpad path from an old session;
  2. they read `corpus.jsonl` / `labels.jsonl`, while the repo actually holds
     `corpus.jsonl.gz` / `labels_clean.jsonl.gz`. Everything here reads the gzipped names
     that exist, through a --data-dir that defaults to the sibling checkout.

Splitting is by UP (channel), not at random: the same creator words their titles the same
way, so a random split leaks and doubles the apparent accuracy (0.673 measured against 0.33
真实). GroupShuffleSplit(test_size=0.15, random_state=42) reproduces feed-mode's own numbers.

Usage: python3 scripts/interest-model/train_classifiers.py [--data-dir ...] [--out ...]
The JSON is written compact; run `npx biome check --write` on it afterwards so `pnpm lint`
stays green.
Main exports: none (script).
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e5_encoder import E5Encoder  # noqa: E402

FEED_MODE_REPO = os.path.expanduser("~/桌面/bilibili")
DEFAULT_DATA_DIR = os.path.join(FEED_MODE_REPO, "research", "data")
DEFAULT_TAXONOMY = os.path.join(FEED_MODE_REPO, "interest-model", "taxonomy.json")
DEFAULT_EMOTIONS = os.path.join(FEED_MODE_REPO, "interest-model", "emotions.json")
DEFAULT_OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "packages/feature-browsing-interest/src/classifierCoefficients.json",
)
TEST_SIZE = 0.15
RANDOM_STATE = 42
INVERSE_REGULARISATION = 4.0


def read_jsonl_gz(path: str) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def load_rows(data_dir: str, label_file: str) -> list[dict]:
    """Joins a label file (`{b, tid}`, tid is 1-based) onto the corpus, first label wins."""
    corpus = {r["b"]: r for r in read_jsonl_gz(os.path.join(data_dir, "corpus.jsonl.gz"))}
    seen: set[str] = set()
    rows: list[dict] = []
    for record in read_jsonl_gz(os.path.join(data_dir, label_file)):
        bvid = record["b"]
        if bvid in seen or bvid not in corpus:
            continue
        seen.add(bvid)
        rows.append({**corpus[bvid], "y": record["tid"] - 1})
    return rows


def quantise(coefficients: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-class (row-wise) int8. One scale per row rather than one for the whole matrix:
    it costs 48 extra floats and keeps a class whose weights are small from being crushed
    into a handful of levels by whichever class happens to have the largest weight."""
    scales = np.abs(coefficients).max(axis=1) / 127.0
    scales = np.where(scales > 0, scales, 1.0).astype(np.float32)
    quantised = np.clip(np.round(coefficients / scales[:, None]), -127, 127).astype(np.int8)
    return quantised, scales


def evaluate(name: str, X: np.ndarray, y: np.ndarray, groups: np.ndarray, group_of) -> dict:
    splitter = GroupShuffleSplit(1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    train, test = next(splitter.split(X, y, groups))
    model = LogisticRegression(C=INVERSE_REGULARISATION, max_iter=3000).fit(X[train], y[train])
    proba = model.predict_proba(X[test])
    top1 = float(accuracy_score(y[test], proba.argmax(1)))
    order = np.argsort(proba, axis=1)[:, -3:]
    top3 = float(np.mean([y[test][i] in order[i] for i in range(len(test))]))
    report = {"train": int(len(train)), "test": int(len(test)), "top1": top1, "top3": top3}
    report["macro_f1"] = float(f1_score(y[test], proba.argmax(1), average="macro"))
    if group_of is not None:
        report["group_top1"] = float(
            np.mean([group_of[y[test][i]] == group_of[int(proba[i].argmax())] for i in range(len(test))])
        )
    print(f"[{name}] " + "  ".join(f"{k}={v:.4f}" if isinstance(v, float) else f"{k}={v}"
                                   for k, v in report.items()), flush=True)
    return report


def fit_head(name: str, rows: list[dict], X: np.ndarray, classes: int, group_of) -> dict:
    y = np.array([r["y"] for r in rows])
    groups = np.array([r["u"] or r["b"] for r in rows])
    report = evaluate(name, X, y, groups, group_of)
    full = LogisticRegression(C=INVERSE_REGULARISATION, max_iter=3000).fit(X, y)
    quantised, scales = quantise(full.coef_.astype(np.float32))
    agreement = float(
        np.mean(
            ((quantised.astype(np.float32) * scales[:, None]) @ X.T + full.intercept_[:, None]).argmax(0)
            == (full.coef_ @ X.T + full.intercept_[:, None]).argmax(0)
        )
    )
    print(f"[{name}] int8-vs-float top1 agreement on the full corpus: {agreement:.4f}", flush=True)
    assert full.coef_.shape == (classes, X.shape[1]), full.coef_.shape
    return {
        "classes": classes,
        "dims": int(X.shape[1]),
        "scales": [round(float(s), 10) for s in scales],
        "intercepts": [round(float(b), 7) for b in full.intercept_],
        "weightsBase64": base64.b64encode(quantised.tobytes()).decode("ascii"),
        "eval": report | {"int8Agreement": agreement},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--taxonomy", default=DEFAULT_TAXONOMY)
    parser.add_argument("--emotions", default=DEFAULT_EMOTIONS)
    parser.add_argument("--model-dir", default=None, help="multilingual-e5-small snapshot")
    parser.add_argument("--cache", default=None, help="npz to cache embeddings in")
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    taxonomy = json.load(open(args.taxonomy, encoding="utf-8"))
    leaves = [leaf for group in taxonomy["groups"].values() for leaf in group]
    group_of = [
        index
        for index, group_leaves in enumerate(taxonomy["groups"].values())
        for _ in group_leaves
    ]
    emotions = json.load(open(args.emotions, encoding="utf-8"))["emotions"]

    topic_rows = load_rows(args.data_dir, "topics.jsonl.gz")
    emotion_rows = load_rows(args.data_dir, "emotions.jsonl.gz")
    print(f"topic-labelled={len(topic_rows)}  emotion-labelled={len(emotion_rows)}", flush=True)

    encoder = E5Encoder(args.model_dir)
    vectors: dict[str, np.ndarray] = {}
    if args.cache and os.path.exists(args.cache):
        vectors = dict(np.load(args.cache))
    for name, rows in (("topic", topic_rows), ("emotion", emotion_rows)):
        if name not in vectors or vectors[name].shape[0] != len(rows):
            print(f"encoding {len(rows)} texts for {name}...", flush=True)
            vectors[name] = encoder.encode([f"{r['t']} {r['u']}" for r in rows], log_every=40)
    if args.cache:
        np.savez(args.cache, **vectors)

    payload = {
        "model": "multilingual-e5-small",
        "prefix": "query: ",
        "note": "int8 per-class quantisation; dequantise as weight[c][d] * scales[c].",
        # Labels travel with the coefficients only so a retrain against a reordered taxonomy
        # is caught by a test (classifier.test.ts). What the app displays comes from
        # packages/feature-browsing-interest/src/taxonomy.ts, the one source of truth.
        "topicLabels": leaves,
        "emotionLabels": [e["name"] for e in emotions],
        # Read back by make_parity_fixture.py, which cannot import the TypeScript taxonomy.
        "emotionValences": [e["valence"] for e in emotions],
        "topic": fit_head("topic", topic_rows, vectors["topic"], len(leaves), group_of),
        "emotion": fit_head("emotion", emotion_rows, vectors["emotion"], len(emotions), None),
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {args.out} ({os.path.getsize(args.out) / 1024:.1f} KB)", flush=True)
    print("now run: npx biome check --write " + args.out, flush=True)


if __name__ == "__main__":
    main()
