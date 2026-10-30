// PreToolUse hook (wired in .claude/settings.json): refuses shell commands and file writes that
// break the hard rules. Exit 2 blocks the call and hands the reason back to the agent.

import { readFileSync } from "node:fs";
import { type ToolInput, checkTool } from "./policy.ts";

type HookInput = { tool_name?: string; tool_input?: ToolInput; cwd?: string };

let input: HookInput;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // not a hook payload; nothing to judge
}

const ctx = { auto: process.env.LENTE_AUTO === "1", boardPort: process.env.LENTE_BOARD_PORT || undefined, root: process.env.LENTE_LANE_ROOT || input.cwd };
const reason = checkTool(input.tool_name ?? "", input.tool_input ?? {}, ctx);

if (reason) {
  console.error(`Blocked by Lente's guard: ${reason}`);
  process.exit(2);
}
