# Tasks

## 1. Identity

- [x] 1.1 Calibre tokens, fonts and the lens-and-line logo in the phone page; verify at 390 px with a screenshot and no horizontal overflow
- [x] 1.2 Card label "DILO", cyan only on the reply and amber only on numbers; verify on a live cue
- [x] 1.3 Clear listening vs paused indicator; verify both states on the phone

## 2. Installable

- [ ] 2.1 Web app manifest and icon served by the hub; verify "Add to Home Screen" launches full screen on iOS and Android

## 3. Layout system (from `docs/kb/ui-reference.md`)

- [x] 3.1 Surfaces without borders, radii 24 for cards and full pills for controls, 20 px gutter, 48 px targets; verify screenshots at 360 and 390 px with no horizontal overflow
- [x] 3.2 Header reduced to brand, clip state and the listening pill; meeting, briefing, past meetings, vocabulary and names move into grouped rows with inset dividers and sentence-case captions; verify every row opens and its controls still work against the hub
- [x] 3.3 Bottom action bar without borders, one filled primary (Mirar); DILO keeps the only uppercase label, cyan and amber keep their meaning; verify a live cue and the listening and paused states
- [x] 3.4 All phone copy in Spanish (transcription states translated on the page) and the screen kept on while listening where the browser allows it (Wake Lock, HTTPS or localhost); verify no English left on screen and the screen stays on over localhost
