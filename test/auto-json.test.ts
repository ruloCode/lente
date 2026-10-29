import assert from "node:assert/strict";
import { test } from "node:test";
import { lastJsonWith } from "../scripts/auto/json.ts";

test("the verdict is found among logs, fences and braces in strings", () => {
  const out = `muse: Skills: 68 loaded
Looking at {the diff}…
\`\`\`json
{"verdict":"changes","blocking":[{"file":"src/a.ts","line":3,"issue":"a \\"}\\" in a string"}],"notes":[]}
\`\`\`
muse: done {ok}`;
  const v = lastJsonWith<{ verdict: string; blocking: { issue: string }[] }>(out, "verdict");
  assert.equal(v?.verdict, "changes");
  assert.equal(v?.blocking[0].issue, 'a "}" in a string');
});

test("the last object with the key wins, and none gives null", () => {
  assert.deepEqual(lastJsonWith('{"verdict":"changes"} then {"verdict":"approve"} {"x":1}', "verdict"), { verdict: "approve" });
  assert.equal(lastJsonWith("no json here {broken", "verdict"), null);
});
