# Proposal

## Why

The brand study (competitors' sites measured with Matiz on 2026-10-28) showed every rival on light, gadget-store or fashion styling, and Cluely selling "undetectable". Lente takes the opposite ground: a calm, dark instrument that asks permission and shows its numbers. The reply card becomes "Dilo" (Spanish for "say it"), the product's single action, and the app should be installable like a real one for the demo.

## What Changes

- Apply the "Calibre" identity to the phone app: graphite surfaces, cyan only for the line to say, amber only for measured numbers, Barlow Condensed / Atkinson Hyperlegible / IBM Plex Mono, the lens-and-line logo.
- Rename the reply card label from "SAY THIS" to "DILO" (the content stays in the meeting's language).
- Make the phone app installable: name, icon and full-screen launch from the home screen.
- A visible "listening" state that others can understand, in line with consent-first.

Out of scope before 2026-11-04: the public landing site redesign (handled with the submission), localization of the whole UI.

Meta models: none directly.

Privacy: the listening indicator makes recording visible; no data changes.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `companion-app`: the card label, the identity, installability and a clearer listening state.

## Impact

- `src/pilot-page.ts` (styles, labels, logo), a web app manifest and icon served by the hub.
- Fonts load from Google Fonts with system fallbacks so the page still works offline on the local network.
