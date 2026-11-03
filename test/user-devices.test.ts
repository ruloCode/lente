import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEVICES_PER_USER_MAX, FileDeviceStore, MemoryDeviceStore, UserDevices, deviceRoute } from "../src/user-devices.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";

function setup() {
  let now = 1_000;
  const devices = new UserDevices(new MemoryDeviceStore(), () => now);
  return { devices, tick: (ms: number) => (now += ms) };
}

test("a created token is shown once, resolves to its user and device, and is listed without it", async () => {
  const { devices } = setup();
  const made = await devices.create(ALICE, "clip", "  Clip gafas  ");
  assert.equal(made.label, "Clip gafas");
  assert.match(made.token, /^[\w-]{32}$/);
  assert.deepEqual(await devices.resolve(made.token), { userId: ALICE, deviceId: made.id });
  const listed = await devices.list(ALICE);
  assert.equal(listed.length, 1);
  assert.ok(!JSON.stringify(listed).includes(made.token));
  assert.ok(!("tokenHash" in listed[0]!));
});

test("connecting records last seen", async () => {
  const { devices, tick } = setup();
  const made = await devices.create(ALICE, "clip", "c");
  assert.equal((await devices.list(ALICE))[0]!.lastSeenAt, null);
  tick(5_000);
  await devices.resolve(made.token);
  assert.equal((await devices.list(ALICE))[0]!.lastSeenAt, 6_000);
});

test("a revoked token no longer resolves, and revoking twice is not found", async () => {
  const { devices } = setup();
  const made = await devices.create(ALICE, "clip", "c");
  assert.ok(await devices.revoke(ALICE, made.id));
  assert.equal(await devices.resolve(made.token), undefined);
  assert.equal(await devices.revoke(ALICE, made.id), false);
  assert.equal((await devices.list(ALICE))[0]!.revoked, true);
});

test("another user's device answers as if it did not exist: not listed, not revocable", async () => {
  const { devices } = setup();
  const alices = await devices.create(ALICE, "clip", "alice clip");
  await devices.create(BOB, "desktop", "bob desk");
  assert.deepEqual((await devices.list(BOB)).map((d) => d.label), ["bob desk"]);
  assert.equal(await devices.revoke(BOB, alices.id), false);
  assert.deepEqual(await deviceRoute(devices, BOB, "POST", "/devices/revoke", JSON.stringify({ id: alices.id })), { status: 404, json: { error: "no such device" } });
  assert.deepEqual(await devices.resolve(alices.token), { userId: ALICE, deviceId: alices.id });
});

test("unknown tokens resolve to no one", async () => {
  const { devices } = setup();
  await devices.create(ALICE, "clip", "c");
  assert.equal(await devices.resolve("not-a-token"), undefined);
});

test("bad kinds, empty labels and too many devices are refused with 400", async () => {
  const { devices } = setup();
  assert.equal((await deviceRoute(devices, ALICE, "POST", "/devices", JSON.stringify({ kind: "toaster", label: "x" })))?.status, 400);
  assert.equal((await deviceRoute(devices, ALICE, "POST", "/devices", JSON.stringify({ label: "  " })))?.status, 400);
  assert.equal((await deviceRoute(devices, ALICE, "POST", "/devices", "not json"))?.status, 400);
  for (let i = 0; i < DEVICES_PER_USER_MAX; i++) await devices.create(ALICE, "clip", `c${i}`);
  const over = await deviceRoute(devices, ALICE, "POST", "/devices", JSON.stringify({ label: "one more" }));
  assert.equal(over?.status, 400);
  assert.match(JSON.stringify(over?.json), /revoke one first/);
});

test("the routes: create (201, kind defaults to clip), list (200), revoke (204), others not handled", async () => {
  const { devices } = setup();
  const created = await deviceRoute(devices, ALICE, "POST", "/devices", JSON.stringify({ label: "Clip" }));
  assert.equal(created?.status, 201);
  const { id, kind, token } = created!.json as { id: string; kind: string; token: string };
  assert.equal(kind, "clip");
  assert.ok(token);
  const listed = await deviceRoute(devices, ALICE, "GET", "/devices", "");
  assert.equal((listed!.json as { devices: unknown[] }).devices.length, 1);
  assert.deepEqual(await deviceRoute(devices, ALICE, "POST", "/devices/revoke", JSON.stringify({ id })), { status: 204 });
  assert.equal(await deviceRoute(devices, ALICE, "GET", "/meetings", ""), undefined);
});

test("the file store keeps devices across restarts and never the token", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-devices-")), "user-devices.json");
  const made = await new UserDevices(new FileDeviceStore(file)).create(ALICE, "clip", "c");
  assert.ok(!readFileSync(file, "utf8").includes(made.token));
  const again = new UserDevices(new FileDeviceStore(file));
  assert.deepEqual(await again.resolve(made.token), { userId: ALICE, deviceId: made.id });
  await again.revoke(ALICE, made.id);
  assert.equal(await new UserDevices(new FileDeviceStore(file)).resolve(made.token), undefined);
});
