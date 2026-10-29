// The stubbed Meta API on its own, for live checks that must not spend model credit (the auto
// lane has no keys). Prints the environment that points a hub at it, then serves until stopped.
//
//   pnpm stub
//   MODEL_API_KEY=stub META_BASE_URL=… META_REALTIME_URL=… node src/pilot.ts

import { startStubMeta } from "./stub-meta.ts";

const { port } = await startStubMeta();
console.log(`stub Meta API on 127.0.0.1:${port}; start a hub with:`);
console.log(`MODEL_API_KEY=stub META_BASE_URL=http://127.0.0.1:${port}/v1 META_REALTIME_URL=ws://127.0.0.1:${port}/v1/asr/realtime node src/pilot.ts`);
