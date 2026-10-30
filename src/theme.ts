// The Lente iOS kit's tokens (docs/design/ios-kit), shared by the phone page and the desktop page.
// Light by default, dark from the system setting; every text pair is measured in test/contrast.test.ts.

export const THEME_TOKENS = `  /* Look from the Lente iOS kit (docs/design/ios-kit): system font, light and dark from the phone's
     setting, white cards on a grouped background, one blue accent, red only for recording.
     Every text color pair measures 7:1 or more on its surface (test/contrast.test.ts). */
  :root {
    color-scheme: light dark;
    --bg: #F2F2F7; --surface: #FFFFFF; --raised: #EEF0F5; --line: #E5E6EC; --ink: #0A0C16; --muted: #464C5E;
    --accent: #0842B5; --accent-fill: #0A47C2; --on-accent: #FFFFFF; --tag: #E8F0FE;
    --live: #A3001A; --live-fill: #B0001D; --on-live: #FFFFFF; --ok: #0A5C27;
    --track: #E8E9EE; --thumb: #FFFFFF;
    /* Kept names from the earlier identity: the accent and the measured-number color. */
    --cyan: var(--accent); --amber: var(--muted);
    --glass: rgba(255, 255, 255, .80); --glass-edge: rgba(10, 12, 22, .08); --scrim: rgba(8, 10, 22, .38);
    --shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 8px 24px rgba(16, 24, 40, .06);
    --shadow-float: 0 10px 28px rgba(20, 30, 70, .12), 0 1px 3px rgba(20, 30, 70, .06);
    --body: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
    --display: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
    --card: 20px; --tap: 48px; --row: 52px; --gutter: 16px;
    --spring: cubic-bezier(.32, 1.25, .5, 1); --ease: cubic-bezier(.22, 1, .36, 1);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000000; --surface: #1C1C1E; --raised: #2C2C2E; --line: #38383A; --ink: #FFFFFF; --muted: #C7C7CC;
      --accent: #8CC8FF; --accent-fill: #8CC8FF; --on-accent: #000000; --tag: #26333F;
      --live: #FF8A8A; --live-fill: #FF6B6B; --on-live: #000000; --ok: #5FE08A;
      --track: #2C2C2E; --thumb: #3A3A3C;
      --glass: rgba(30, 30, 33, .82); --glass-edge: rgba(255, 255, 255, .10); --scrim: rgba(0, 0, 0, .6);
      --shadow: none; --shadow-float: 0 10px 30px rgba(0, 0, 0, .6);
    }
  }
`;
