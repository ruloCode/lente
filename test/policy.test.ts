import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCommand, checkWrite } from "../scripts/auto/policy.ts";

const HUMAN = { auto: false };
const LANE = { auto: true, boardPort: "/dev/cu.usbmodem3101", root: "/repo/.claude/worktrees/auto" };
const blocked = (cmd: string, ctx = HUMAN) => checkCommand(cmd, ctx) !== null;

test("everyday commands pass", () => {
  for (const cmd of ["pnpm typecheck && pnpm test", "git status", "git diff main", "node --env-file-if-exists=.env src/pilot.ts", "cp .env.example .env.local.example", "cat .env.example", "adb -s RFGYB098QCN exec-out screencap -p > /tmp/s.png", "rm -rf /tmp/lente-x", "rm -rf node_modules", "muse exec --contributor-mode off --prompt-file /tmp/p.txt"]) {
    assert.equal(checkCommand(cmd, LANE), null, cmd);
  }
});

test("secrets are never printed or copied", () => {
  for (const cmd of ["cat .env", "grep KEY .env", "head -3 ./.env", "cat firmware/lente-clip/secrets.h", "echo $MODEL_API_KEY", "printenv", "env | sort", "cp .env /tmp/x", "cat .env.local"]) assert.ok(blocked(cmd), cmd);
});

test("contributor models, force pushes, forbidden adds and root deletes are refused", () => {
  for (const cmd of ["muse exec --contributor-mode on hi", "curl -d '{\"model\":\"muse-spark-1.3-contributor\"}' x", "git push --force", "git push -f origin main", "git push origin +main", "git add -f data/day.json", "git add .env", "git add recordings/a.wav", "rm -rf ~", "rm -rf .", "rm -rf .git"]) assert.ok(blocked(cmd), cmd);
});

test("the auto lane leaves git history to the runner", () => {
  for (const cmd of ["git commit -m x", "git push", "git merge main", "gh pr create", "git -C x rebase main"]) {
    assert.ok(blocked(cmd, LANE), cmd);
    assert.equal(blocked(cmd), cmd.startsWith("git push --force"), `${cmd} is fine for a human session`);
  }
});

test("the auto lane never loads another checkout's keys", () => {
  for (const cmd of ["node --env-file=/Users/rulocode/dev/side/lente/.env src/pilot.ts", "node --env-file-if-exists=../../.env src/pilot.ts", "set -a; source ../../../.env; set +a"]) {
    assert.ok(blocked(cmd, LANE), cmd);
  }
  assert.equal(checkCommand("node --env-file-if-exists=.env src/pilot.ts", LANE), null, "the lane's own (absent) .env is harmless");
  assert.equal(checkCommand("cp ../../.env.example /tmp/x", LANE), null);
});

test("firmware uploads name the clip's port, never a glob that may hit the phone", () => {
  assert.ok(blocked("arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p /dev/cu.usbmodem* firmware/lente-clip"));
  assert.ok(blocked("arduino-cli upload firmware/lente-clip"));
  assert.ok(blocked("arduino-cli upload -p /dev/cu.usbmodemRFGYB098QCN2 firmware/lente-clip", LANE));
  assert.equal(checkCommand("arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p /dev/cu.usbmodem3101 firmware/lente-clip", LANE), null);
  assert.equal(checkCommand('arduino-cli monitor -p "$LENTE_BOARD_PORT" -c baudrate=115200', LANE), null);
  assert.equal(checkCommand("arduino-cli compile -b esp32:esp32:XIAO_ESP32S3 firmware/lente-clip", LANE), null, "compiling alone needs no port");
});

test("writes keep off secrets, and the lane stays in its checkout", () => {
  assert.ok(checkWrite("/repo/.env", HUMAN));
  assert.ok(checkWrite("firmware/lente-clip/secrets.h", HUMAN));
  assert.equal(checkWrite("/repo/.env.example", HUMAN), null);
  assert.equal(checkWrite("/repo/src/pilot.ts", HUMAN), null);
  assert.ok(checkWrite("/repo/src/pilot.ts", LANE), "main checkout from the lane");
  assert.equal(checkWrite("/repo/.claude/worktrees/auto/src/pilot.ts", LANE), null);
  assert.equal(checkWrite("/tmp/shot.png", LANE), null);
  assert.equal(checkWrite("/Users/me/.claude/projects/-repo/memory/x.md", LANE), null, "its own memory");
});
