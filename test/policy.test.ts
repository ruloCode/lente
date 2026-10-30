import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCommand, checkRead, checkWrite } from "../scripts/auto/policy.ts";

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

test("the auto lane never plays audio out loud, only to files", () => {
  for (const cmd of ["say -v Samantha 'hello'", "afplay /tmp/x.wav", "cd /tmp && say hi", "pnpm test; say done"]) assert.ok(blocked(cmd, LANE), cmd);
  for (const cmd of ["say -v Samantha -o /tmp/x.aiff 'hello'", "say -o /tmp/x.aiff --data-format=LEI16@16000 hi", "node scripts/fake-clip.ts t.wav --ws", "echo say hello"]) assert.equal(checkCommand(cmd, LANE), null, cmd);
  assert.equal(blocked("say hi"), false, "a human session may speak");
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

test("the cloud key and GitHub token files are never read, copied or listed", () => {
  for (const cmd of ["cat ~/.config/lente/anthropic-cloud.key", "head -c 20 /Users/me/.config/lente/github-read.token", "cp ~/.config/lente/anthropic-cloud.key /tmp/k", "grep sk- ~/.config/lente/anthropic-cloud.key", "ls ~/.config/lente/github-read.token"]) assert.ok(blocked(cmd, LANE), cmd);
  assert.equal(checkCommand("pnpm auto:cloud-setup --dry-run", LANE), null);
  assert.ok(checkRead("/Users/me/.config/lente/anthropic-cloud.key"));
  assert.ok(checkRead("/Users/me/.config/lente/github-read.token"));
  assert.equal(checkRead("/repo/src/pilot.ts"), null);
});

test("the guard hook itself blocks Read, Grep and Glob aimed at the key and token files", () => {
  const run = (tool_name: string, tool_input: object) => spawnSync("node", ["scripts/auto/guard.ts"], { input: JSON.stringify({ tool_name, tool_input, cwd: "/repo" }), encoding: "utf8" }).status;
  assert.equal(run("Read", { file_path: "/Users/me/.config/lente/anthropic-cloud.key" }), 2);
  assert.equal(run("Grep", { pattern: "sk-ant", path: "/Users/me/.config/lente/github-read.token" }), 2);
  assert.equal(run("Glob", { pattern: "**/anthropic-cloud.key", path: "/Users/me/.config/lente" }), 2);
  assert.equal(run("Grep", { pattern: "TODO", path: "/repo/src" }), 0);
  assert.equal(run("Read", { file_path: "/repo/src/pilot.ts" }), 0);
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
