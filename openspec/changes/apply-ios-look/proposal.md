# Proposal

## Why

The iOS kit in `docs/design/ios-kit/` (measured from reference renders, AAA in light and dark) looks like a native Apple app; the real phone page still wears the dark "Calibre" identity from `apply-dilo-identity` (Barlow Condensed, cyan and amber on graphite) and the Mac page (`/desktop`) is an unstyled form. For the demo and for daily use the app should feel as calm and finished as the kit: native type, light and dark following the system, soft surfaces and one accent.

## What Changes

- The phone page takes the kit's tokens: SF Pro through the system font stack, light and dark from `prefers-color-scheme`, the kit's surfaces, separators, shadows and blue accent, red only for recording. Calibre's fonts are no longer loaded.
- Its components restyle to the kit's: large title header, glass listening pill, white cards with soft elevation, the Dilo card (accent "DILO" tag, large ink line), inset grouped lists, iOS switches and segmented controls, a glass action dock, the side menu and the live view.
- Markup and scripts stay as they are: only CSS, the theme color and the logo colors change, so every behavior and test keeps working.
- The Mac page (`/desktop`) gets the same tokens in a macOS window layout.
- The kit's agents screens become "Tu equipo": a character per agent with a status badge, a lead agent, the list of agents with what each is doing, a chat composer, and an agent page that opens with suggested questions. Characters are drawn new for Lente.

Out of scope: new features, copy changes, the landing site.

Meta models: none.

Privacy: none; the listening state stays visible and is never color only.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `companion-app`: native look in light and dark.

## Impact

- `src/pilot-page.ts` (styles only), `src/brand.ts` (logo and theme colors), `src/desktop-page.ts` (styles), `docs/design/ios-kit/` (agents screens).
- Supersedes the Calibre colors and fonts of `apply-dilo-identity`; its installability task stays.
