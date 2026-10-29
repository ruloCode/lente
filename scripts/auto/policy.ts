// The hard rules of CLAUDE.md as checks a hook can enforce, so they hold even when no human is
// watching. Pure: a command or a path in, the reason to refuse it (or null) out. The
// PreToolUse hook in scripts/auto/guard.ts applies these to every session in this repo.

export type Context = {
  /** Running in the unattended lane (LENTE_AUTO=1): the runner commits, merges and pushes. */
  auto: boolean;
  /** The clip's serial port when the runner found one; the phone shows up as a usbmodem too. */
  boardPort?: string;
  /** The checkout the session works in; in the auto lane, edits stay inside it. */
  root?: string;
};

const SECRET_FILE = String.raw`(?:^|[\s/'"=])(?:\.env(?![\w.-]*\.example\b)(?:\.[\w.-]+)?|secrets\.h)(?=$|[\s'";|&)])`;
const GIT = String.raw`\bgit(?:\s+-[Cc]\s+\S+)*\s+`;
const READS_FILE = new RegExp(String.raw`\b(?:cat|less|more|head|tail|bat|nl|strings|xxd|od|grep|rg|ag|sed|awk|cut|sort|cp|mv|scp|rsync|curl|base64|open|code|pbcopy)\b[^|;&]*${SECRET_FILE}`);
const PRINTS_KEY = /\b(?:echo|printf|print)\b[^|;&]*\$\{?\w*(?:API_KEY|TOKEN|SECRET|PASSWORD)\b/;
const DUMPS_ENV = /(?:^|[;&|]\s*)(?:printenv|env|set|export\s+-p)\s*(?:$|[;&|>])/;
const FORCE_PUSH = new RegExp(String.raw`${GIT}push\b[^;&|]*(?:\s--force(?:-with-lease)?\b|\s-[a-zA-Z]*f\b|\s\+\S)`);
const ADD_FORBIDDEN = new RegExp(String.raw`${GIT}add\b[^;&|]*(?:\s-[a-zA-Z]*f\b|\s--force\b|\.env\b(?!\.example)|secrets\.h|\bdata\/|\brecordings\/|\.wav\b|\.pcm\b|\beval\/audio\/)`);
const CONTRIBUTOR = /(?:\b[a-z0-9][\w.-]*-contributor\b(?!-mode)|--contributor-mode[ =]on\b)/i;
const LANE_GIT = new RegExp(String.raw`(?:${GIT}(?:commit|push|merge|rebase|cherry-pick|worktree)|\bgh\s+pr\s+(?:merge|create))\b`);
const ARDUINO_PORT = /\barduino-cli\b[^;&|]*\b(?:upload|monitor|burn-bootloader|compile\b[^;&|]*--upload)\b/;
const PORT_ARG = /(?:\s-p|\s--port)[ =]?(\S+)/;
const OTHER_ENV = /(?:^|[\s='"])[^\s='"]*\/\.env(?![\w.-]*\.example\b)(?=$|[\s'";|&)])/;
const RM_ROOTS = /\brm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(?:-[a-zA-Z]+\s+)*(?:\/|~|\$HOME|\.\.?|\.git)(?:\/)?(?:\s|$)/;

/** Why a shell command must not run, or null when it may. */
export function checkCommand(cmd: string, ctx: Context): string | null {
  if (READS_FILE.test(cmd) || PRINTS_KEY.test(cmd) || DUMPS_ENV.test(cmd)) return "rule 3: never print or copy keys (.env) or Wi-Fi secrets (secrets.h); load them with --env-file instead";
  if (CONTRIBUTOR.test(cmd)) return "rule 4: standard mode only; never use *-contributor models or contributor mode";
  if (FORCE_PUSH.test(cmd)) return "force push rewrites published history; push normally or ask the human";
  if (ADD_FORBIDDEN.test(cmd)) return "rule 3: keys, the day record, recordings and audio never go into git (and no `git add -f`)";
  if (RM_ROOTS.test(cmd)) return "refusing to recursively delete the home, root, repository or .git directory";
  if (ctx.auto && OTHER_ENV.test(cmd)) return "auto lane: building Lente spends no model credit; use the stub (pnpm stub), never another checkout's .env";
  if (ctx.auto && LANE_GIT.test(cmd)) return "auto lane: leave changes uncommitted; the runner reviews, commits, merges and pushes";
  if (ARDUINO_PORT.test(cmd)) {
    const port = PORT_ARG.exec(cmd)?.[1]?.replace(/['"]/g, "");
    if (!port || port.includes("*")) return "name the clip's port exactly (the phone is a /dev/cu.usbmodem* too); use $LENTE_BOARD_PORT";
    if (ctx.boardPort && port !== ctx.boardPort && port !== "$LENTE_BOARD_PORT" && port !== "${LENTE_BOARD_PORT}") return `${port} is not the clip; the clip is on ${ctx.boardPort}`;
  }
  return null;
}

/** Why a file must not be written, or null when it may. */
export function checkWrite(path: string, ctx: Context): string | null {
  const name = path.split("/").pop() ?? "";
  if ((name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) || name === "secrets.h") return "rule 3: keys and Wi-Fi secrets are the human's to edit";
  const outside = path.startsWith("/") && !path.startsWith(`${ctx.root}/`) && !/^\/(?:private\/)?tmp\//.test(path) && !path.includes("/.claude/projects/");
  if (ctx.auto && ctx.root && outside) {
    return `auto lane: stay inside the lane's checkout (${ctx.root}); the main checkout belongs to the human`;
  }
  return null;
}
