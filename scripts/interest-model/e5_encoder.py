"""Purpose: encode text exactly the way Breadcrumb encodes it at runtime, so a classifier
trained here is valid on the vectors the app actually produces.

The app has two embedders and they must agree with this file:
  - desktop: apps/desktop/src-tauri/src/embeddings.rs -> fastembed MultilingualE5Small,
    `format!("query: {t}")` before encoding;
  - browser: apps/web/src/shims/embedding/embeddingWorker.ts -> transformers.js q8 ONNX,
    `prefixForE5` (QUERY_PREFIX = "query: ") + `{ pooling: "mean", normalize: true }`.
So: "query: " prefix, mean pooling over the attention mask, L2 normalisation. Dropping the
prefix silently shifts the vector space and the coefficients stop meaning anything.

This runs on the ONNX file the desktop build already downloaded (fp32); the browser's q8
export agrees with it to a cosine of ~0.995, which is inside the margin these coefficients
carry. Development-only: nothing here ships, and the product never runs Python.

Main exports: E5Encoder, DEFAULT_MODEL_DIR.
"""

from __future__ import annotations

import glob
import os

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

QUERY_PREFIX = "query: "
MAX_TOKENS = 512

DEFAULT_MODEL_DIR = os.path.expanduser(
    "~/.local/share/app.breadcrumb.desktop/embedding-models/"
    "models--intfloat--multilingual-e5-small/snapshots/*"
)


def resolve_model_dir(pattern: str = DEFAULT_MODEL_DIR) -> str:
    """The snapshot directory is named by commit hash, so the default path is a glob."""
    matches = sorted(glob.glob(pattern))
    if not matches:
        raise FileNotFoundError(
            f"no multilingual-e5-small snapshot under {pattern}. "
            "Run the desktop app once so it downloads the model, or pass --model-dir."
        )
    return matches[-1]


class E5Encoder:
    def __init__(self, model_dir: str | None = None, threads: int = 0) -> None:
        directory = model_dir or resolve_model_dir()
        options = ort.SessionOptions()
        if threads:
            options.intra_op_num_threads = threads
        self.session = ort.InferenceSession(
            os.path.join(directory, "onnx", "model.onnx"),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = Tokenizer.from_file(os.path.join(directory, "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=MAX_TOKENS)
        self.input_names = {i.name for i in self.session.get_inputs()}

    def encode(self, texts: list[str], batch_size: int = 64, log_every: int = 0) -> np.ndarray:
        vectors: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch = [QUERY_PREFIX + t for t in texts[start : start + batch_size]]
            vectors.append(self._encode_batch(batch))
            if log_every and (start // batch_size) % log_every == 0:
                print(f"  encoded {min(start + batch_size, len(texts))}/{len(texts)}", flush=True)
        return np.concatenate(vectors, axis=0) if vectors else np.zeros((0, 384), np.float32)

    def _encode_batch(self, prefixed: list[str]) -> np.ndarray:
        encodings = self.tokenizer.encode_batch(prefixed)
        width = max(len(e.ids) for e in encodings)
        ids = np.zeros((len(encodings), width), np.int64)
        mask = np.zeros((len(encodings), width), np.int64)
        for row, encoding in enumerate(encodings):
            length = len(encoding.ids)
            ids[row, :length] = encoding.ids
            mask[row, :length] = encoding.attention_mask
        feeds = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self.input_names:
            feeds["token_type_ids"] = np.zeros_like(ids)
        hidden = self.session.run(None, feeds)[0]
        weights = mask[:, :, None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1e-9, None)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        return (pooled / np.clip(norms, 1e-12, None)).astype(np.float32)
