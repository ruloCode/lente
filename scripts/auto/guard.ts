// PreToolUse hook (wired in .claude/settings.json): refuses shell commands and file writes that
// break the hard rules. Exit 2 blocks the call and hands the reason back to the agent.

import { readFileSync } from "node:fs";
import { checkCommand, checkWrite } from "./policy.ts";

type HookInput = { tool_name?: string; tool_input?: { command?: string; file_path?: string; notebook_path?: string }; cwd?: string };

let input: HookInput;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // not a hook payload; nothing to judge
}

const ctx = { auto: process.env.LENTE_AUTO === "1", boardPort: process.env.LENTE_BOARD_PORT || undefined, root: process.env.LENTE_LANE_ROOT || input.cwd };
const tool = input.tool_name ?? "";
const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
const reason =
  tool === "Bash" && input.tool_input?.command ? checkCommand(input.tool_input.command, ctx)
  : path && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) ? checkWrite(path, ctx)
  : null;

if (reason) {
  console.error(`Blocked by Lente's guard: ${reason}`);
  process.exit(2);
}
