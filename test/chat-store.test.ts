// add-voice-mode 2.2: the chat store on files and on Supabase (sealed). Synthetic text only.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type ChatLine, FileChats, MAX_FILE_CHAT_LINES, groupThreads, plainRefs } from "../src/chat-store.ts";
import { newDek } from "../src/seal.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const T1 = "11111111-0000-4000-8000-000000000001";
const T2 = "22222222-0000-4000-8000-000000000002";

const lines = (): ChatLine[] => [
  { threadId: T1, role: "user", text: "PROBE-CHAT-pregunta", sources: [], via: "voice", at: 1000 },
  { threadId: T1, role: "lente", text: "PROBE-CHAT-respuesta", sources: [{ kind: "meeting", label: "PROBE-CHAT-etiqueta", meetingId: "m1", turnId: "t2" }, { kind: "web", label: "example.org", url: "https://example.org/PROBE-CHAT-url" }], via: "voice", at: 2000 },
  { threadId: T2, role: "user", text: "segunda", sources: [], via: "voice", at: 5000 },
];

test("lines group into threads, newest thread first, lines in order", () => {
  const threads = groupThreads([...lines()].reverse(), 5);
  assert.deepEqual(threads.map((t) => [t.threadId, t.at, t.lines.length]), [[T2, 5000, 1], [T1, 2000, 2]]);
  assert.deepEqual(threads[1].lines.map((l) => l.role), ["user", "lente"]);
  assert.equal(groupThreads(lines(), 1).length, 1);
  assert.deepEqual(plainRefs(lines()[1].sources), [{ kind: "meeting", meetingId: "m1", turnId: "t2" }, { kind: "web" }]);
});

test("the file store keeps lines across instances and caps them", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-chat-")), "chat.json");
  new FileChats(file).add(lines());
  assert.equal(new FileChats(file).recent(5)[1].lines[1].text, "PROBE-CHAT-respuesta");
  const many = Array.from({ length: MAX_FILE_CHAT_LINES + 5 }, (_, i): ChatLine => ({ threadId: T2, role: "user", text: `l${i}`, sources: [], via: "voice", at: 10_000 + i }));
  new FileChats(file).add(many);
  assert.equal(new FileChats(file).recent(5).reduce((n, t) => n + t.lines.length, 0), MAX_FILE_CHAT_LINES);
});

test("on Supabase each line is sealed with its sources; refs keep kinds and ids only; another user reads nothing", async () => {
  const fake = fakePostgrest();
  const dek = newDek();
  const alice = await openUserStores(fake.rest, ALICE, dek);
  await alice.chats.add(lines());
  const dump = fake.dump();
  for (const probe of ["PROBE-CHAT-pregunta", "PROBE-CHAT-respuesta", "PROBE-CHAT-etiqueta", "PROBE-CHAT-url"]) {
    assert.ok(!dump.includes(probe), `${probe} reached the database in the clear`);
    assert.ok(!dump.includes(Buffer.from(probe).toString("hex")), `${probe} reached the database as hex`);
  }
  const rows = fake.tables.get("chat_messages")!;
  assert.deepEqual(rows[1].refs, [{ kind: "meeting", meetingId: "m1", turnId: "t2" }, { kind: "web" }]);
  const threads = await alice.chats.recent(5);
  assert.deepEqual(threads.map((t) => t.threadId), [T2, T1]);
  assert.deepEqual(threads[1].lines[1].sources, lines()[1].sources);
  const bob = await openUserStores(fake.rest, BOB, newDek());
  assert.deepEqual(await bob.chats.recent(5), []);
});
