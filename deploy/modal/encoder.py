# Candidate C of add-memory-engine's encoder bake-off (task 8.3): a text encoder served from Lente's own
# Modal app, so the text to embed never leaves Lente's infrastructure. It receives texts and returns
# vectors and logs neither (no print of a body, no request logging of content).
#
# NOT DEPLOYED. Deploying it needs the owner (docs/handoff-memory.md). As of 2026-11-03 the Meta
# open-weights candidate checked, SONAR, has CC-BY-NC-4.0 checkpoints and needs fairseq2, so this file
# serves the same small encoder as the hub (multilingual-e5-small, MIT) until a Meta encoder with a
# licence that fits is chosen. Swap MODEL and DIM for it; the hub's ModalEncoder needs no change.
#
#   modal deploy deploy/modal/encoder.py     # only with the owner's go
#
# The hub calls POST <url> with {"texts": [...], "kind": "query"|"passage"} and a bearer token that
# must match the secret `lente-encoder` (ENCODER_TOKEN).

from __future__ import annotations

import os

import modal

MODEL = "intfloat/multilingual-e5-small"
DIM = 384
MAX_TEXTS = 256

image = modal.Image.debian_slim(python_version="3.12").pip_install("sentence-transformers==3.3.1", "fastapi[standard]")
app = modal.App("lente-hub")

with image.imports():
    import fastapi


@app.cls(image=image, secrets=[modal.Secret.from_name("lente-encoder")], min_containers=0, scaledown_window=300)
class Encoder:
    @modal.enter()
    def load(self) -> None:
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(MODEL, device="cpu")

    @modal.fastapi_endpoint(method="POST")
    async def embed(self, request: fastapi.Request):
        if request.headers.get("authorization") != f"Bearer {os.environ['ENCODER_TOKEN']}":
            raise fastapi.HTTPException(status_code=401)
        body = await request.json()
        texts = body.get("texts")
        kind = body.get("kind")
        if not isinstance(texts, list) or not texts or len(texts) > MAX_TEXTS or kind not in ("query", "passage"):
            raise fastapi.HTTPException(status_code=400)
        vectors = self.model.encode([f"{kind}: {t}" for t in texts], normalize_embeddings=True)
        return {"vectors": [v.tolist() for v in vectors]}
