// Prints the measured contrast of every text color pair of the phone page, in light and dark.
// usage: node scripts/contrast.ts   (exits 1 if any pair is under 7:1)
import { PAGE_TEXT_PAIRS, readTokens, tokenContrast, type Theme } from "../src/contrast.ts";
import { PILOT_PAGE } from "../src/pilot-page.ts";

const AAA = 7;
const css = PILOT_PAGE.slice(PILOT_PAGE.indexOf("<style>"), PILOT_PAGE.indexOf("</style>"));
let low = 0;
for (const theme of ["light", "dark"] as Theme[]) {
  const tokens = readTokens(css, theme);
  console.log(`\n${theme}`);
  for (const [text, surface, where] of PAGE_TEXT_PAIRS) {
    const ratio = tokenContrast(tokens, text, surface);
    if (ratio < AAA) low++;
    console.log(`  ${ratio >= AAA ? "AAA " : "LOW "} ${ratio.toFixed(2).padStart(5)}:1  ${`${text} ${tokens[text]}`.padEnd(26)} on ${`${surface} ${tokens[surface]}`.padEnd(34)} ${where}`);
  }
}
if (low) { console.error(`\n${low} pair(s) under ${AAA}:1`); process.exit(1); }
