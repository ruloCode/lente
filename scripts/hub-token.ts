// Manage a cloud hub's clip tokens on its volume.
// Usage: node scripts/hub-token.ts add <name> | list | revoke <id>   (PILOT_DATA_DIR picks the data folder)
// `add` prints the token once; only its hash is stored.

import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DeviceAuth } from "../src/device-auth.ts";

const dataDir = process.env.PILOT_DATA_DIR ?? fileURLToPath(new URL("../data/", import.meta.url));
const auth = new DeviceAuth(join(dataDir, "devices.json"));
const [command, arg] = process.argv.slice(2);

if (command === "add" && arg) {
  const { id, token } = auth.issueDevice(arg);
  console.log(`Device ${id} (${arg}). Token, shown once: ${token}`);
} else if (command === "list") {
  for (const d of auth.listDevices()) console.log(`${d.id}  ${d.name}${d.revoked ? "  (revoked)" : ""}`);
} else if (command === "revoke" && arg) {
  console.log(auth.revokeDevice(arg) ? `Revoked ${arg}` : `No active device ${arg}`);
} else {
  console.error("Usage: node scripts/hub-token.ts add <name> | list | revoke <id>");
  process.exit(1);
}
