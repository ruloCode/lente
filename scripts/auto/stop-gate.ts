// Stop hook (wired in .claude/settings.json): a session that changed code can't finish while
// typecheck or tests are red. Exit 2 sends the failure back so the agent keeps working.
// Outside the auto lane it blocks once, so a human session is never stuck on someone else's
// red test.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TAIL_LINES = 40;
const CODE_PATHS = /^(src|test|scripts)\//;

let active = false;
try {
  active = JSON.parse(readFileSync(0, "utf8")).stop_hook_active === true;
} catch {}
const auto = process.env.LENTE_AUTO === "1";
if (active && !auto) process.exit(0);

const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout ?? "";
const touched = status.split("\n").some((l) => CODE_PATHS.test(l.slice(3)));
if (!touched) process.exit(0);

for (const step of ["typecheck", "test"]) {
  const run = spawnSync("pnpm", [step], { encoding: "utf8" });
  if (run.status !== 0) {
    const tail = `${run.stdout}${run.stderr}`.trim().split("\n").slice(-TAIL_LINES).join("\n");
    console.error(`Lente's gate: \`pnpm ${step}\` fails with your changes. Fix it before finishing.\n${tail}`);
    process.exit(2);
  }
}
