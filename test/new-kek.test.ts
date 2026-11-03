import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { nextSteps, withNewKek } from "../scripts/new-kek.ts";
import { parseKek } from "../src/seal.ts";

const SCRIPT = new URL("../scripts/new-kek.ts", import.meta.url).pathname;
const run = (file: string) => spawnSync(process.execPath, [SCRIPT, file], { encoding: "utf8" });
const kekIn = (text: string) => /^LENTE_KEK=(.+)$/m.exec(text)?.[1];

test("the script writes a 32-byte KEK at version 1 and never prints it", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-kek-")), ".env");
  writeFileSync(file, "MODEL_API_KEY=placeholder\n");
  const out = run(file);
  assert.equal(out.status, 0, out.stderr);
  const text = readFileSync(file, "utf8");
  const key = kekIn(text)!;
  assert.equal(parseKek(key, 1).key.length, 32);
  assert.match(text, /^MODEL_API_KEY=placeholder\n/);
  assert.match(text, /^LENTE_KEK_VERSION=1$/m);
  for (const stream of [out.stdout, out.stderr]) {
    assert.ok(!stream.includes(key), "the key must not appear in the output");
    assert.ok(!stream.includes(Buffer.from(key, "base64").toString("hex")), "nor in hex");
  }
  assert.match(out.stdout, /offline copy/);
  assert.match(out.stdout, /deploy\/modal\/secret\.ts/);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("a second run refuses to replace the KEK, leaves the file alone and prints no key", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-kek-")), ".env");
  run(file);
  const before = readFileSync(file, "utf8");
  const again = run(file);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already set/);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.ok(!(again.stdout + again.stderr).includes(kekIn(before)!));
});

test("withNewKek: creates a missing file's text, adds a newline when needed, sees an exported KEK", () => {
  const key = Buffer.alloc(32, 7);
  assert.match(withNewKek("", key), /^# Key-encryption key/);
  assert.match(withNewKek("A=1", key), /^A=1\n# Key/);
  assert.throws(() => withNewKek("export LENTE_KEK=abc\n", key), /already set/);
  assert.throws(() => withNewKek("", Buffer.alloc(16)), /32 bytes/);
  assert.doesNotThrow(() => withNewKek("LENTE_KEK_PREVIOUS=x\n# LENTE_KEK=old\n", key));
});

test("the next steps name the file and never carry key material", () => {
  assert.match(nextSteps("/x/.env"), /\/x\/\.env/);
});
