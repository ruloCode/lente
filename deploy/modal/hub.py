# The Lente hub on Modal: one always-on container running `node src/pilot.ts` in cloud mode.
# Modal terminates TLS; clips and the phone reach the hub at https://<workspace>--lente-hub-hub.modal.run
# (WebSocket at /device, the page and its event stream on the same origin).
#
#   node --env-file=.env deploy/modal/secret.ts   # the hub's keys into the Modal secret `lente-hub`
#   pnpm deploy:hub                                # modal deploy --strategy recreate (see below)
#   modal app logs lente-hub                       # the pairing code for the phone
#   modal container exec <id> node scripts/hub-token.ts add clip   # a clip token, on the volume
#
# State lives in memory (one clip, one phone), so there is exactly one container. The day record,
# memory, traces and tokens live on the volume `lente-data`, which survives redeploys.
#
# Always deploy with `--strategy recreate`. The default rolling strategy keeps the old container until
# its inputs finish, and the phone's event stream and the clip's WebSocket never finish; with
# max_containers=1 the new version cannot start beside it, so the hub stays on the old code (or down).

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
    # The desktop web app (add-web-desktop), served by the hub at /app.
    .add_local_dir(ROOT / "web" / "app", "/app/web/app")
    # The built-in apps' manifests (add-lens-apps), served at /apps.
    .add_local_dir(ROOT / "apps", "/app/apps")
    .add_local_file(ROOT / "scripts" / "hub-token.ts", "/app/scripts/hub-token.ts")
)
volume = modal.Volume.from_name("lente-data", create_if_missing=True)

# Judge access (ship-hackathon decisions 1-3): plain config, not secrets, so closing sign-up or moving a
# cap is a one-line deploy. Keys and LENTE_OWNER_USER_ID stay in the Modal secret.
JUDGE_ACCESS = {
    # Any verified Google account may open an account until the start of this day in Bogota;
    # `allowlist` closes it again (accounts already open keep signing in).
    "LENTE_SIGNUP": "open",
    "LENTE_SIGNUP_UNTIL": "2026-11-17",
    # Daily spend caps in US$; the owner is exempt and not counted in the global one.
    "LENTE_USER_DAY_CAP_USD": "1.00",
    "LENTE_GLOBAL_DAY_CAP_USD": "6.00",
    # Accounts listening at once, until ship-hackathon 4.3 measures it.
    "LENTE_MAX_LISTENING": "4",
    # The caps' and the day record's day turns at midnight in Bogota, not UTC.
    "TZ": "America/Bogota",
}
app = modal.App("lente-hub")


@app.function(
    image=image,
    volumes={DATA_DIR: volume},
    secrets=[modal.Secret.from_name("lente-hub")],
    min_containers=1,
    max_containers=1,
    timeout=DAY_S,
    # ship-hackathon 2.6: room for several judges at once (about 340 MB per hot memory index, docs/benchmarks.md).
    cpu=1.0,
    memory=2048,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(WEB_PORT, startup_timeout=60)
def hub():
    env = {**os.environ, **JUDGE_ACCESS, "LENTE_CLOUD": "1", "PILOT_DATA_DIR": DATA_DIR, "PILOT_WEB_PORT": str(WEB_PORT)}
    subprocess.Popen(["node", "src/pilot.ts"], cwd="/app", env=env)
