import assert from "node:assert/strict";
import { test } from "node:test";
import { commitMessage } from "../scripts/auto/message.ts";

const CO = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";

test("the builder's own trailer is dropped so the commit carries exactly one", () => {
  const msg = commitMessage({ commit_message: `Subject\n\nBody.\n\n${CO}\n`, tasks: [{ id: "1.2", status: "done", evidence: "ran it" }] }, "fallback", "Auto lane node: c / g", "Review (Muse Code): approve", CO);
  assert.equal(msg.split(CO).length - 1, 1);
  assert.ok(msg.startsWith("Subject\n\nBody.\n\nAuto lane node: c / g\n- 1.2 done: ran it\n"));
  assert.ok(msg.endsWith(`${CO}\n`));
});

test("no report falls back to the node as the subject", () => {
  assert.ok(commitMessage(undefined, "c: g", "Auto lane node: c / g", "", CO).startsWith("c: g\n\n"));
});
