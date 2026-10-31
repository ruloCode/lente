# The Lente hub on Modal: one always-on container running `node src/pilot.ts` in cloud mode.
# Modal terminates TLS; clips and the phone reach the hub at https://<workspace>--lente-hub-hub.modal.run
# (WebSocket at /device, the page and its event stream on the same origin).
#
#   node --env-file=.env deploy/modal/secret.ts   # the hub's keys into the Modal secret `lente-hub`
#   modal deploy deploy/modal/hub.py
#   modal app logs lente-hub                       # the pairing code for the phone
#   modal container exec <id> node scripts/hub-token.ts add clip   # a clip token, on the volume
#
# State lives in memory (one clip, one phone), so there is exactly one container. The day record,
# memory, traces and tokens live on the volume `lente-data`, which survives redeploys.

import os
import subprocess
from pathlib import Path

import modal

# The module is imported again inside the container (as /root/hub.py), where the repo is not around:
# local paths only matter when deploying from the laptop.
ROOT = Path(__file__).resolve().parents[2] if modal.is_local() else Path("/")
WEB_PORT = 8080
DATA_DIR = "/data"
DAY_S = 24 * 60 * 60

image = (
    modal.Image.from_registry("node:22-slim", add_python="3.12")
    .add_local_file(ROOT / "package.json", "/app/package.json")
    .add_local_dir(ROOT / "src", "/app/src")
    .add_local_file(ROOT / "scripts" / "hub-token.ts", "/app/scripts/hub-token.ts")
)
volume = modal.Volume.from_name("lente-data", create_if_missing=True)
app = modal.App("lente-hub")


@app.function(
    image=image,
    volumes={DATA_DIR: volume},
    secrets=[modal.Secret.from_name("lente-hub")],
    min_containers=1,
    max_containers=1,
    timeout=DAY_S,
    cpu=0.25,
    memory=512,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(WEB_PORT, startup_timeout=60)
def hub():
    env = {**os.environ, "LENTE_CLOUD": "1", "PILOT_DATA_DIR": DATA_DIR, "PILOT_WEB_PORT": str(WEB_PORT)}
    subprocess.Popen(["node", "src/pilot.ts"], cwd="/app", env=env)
