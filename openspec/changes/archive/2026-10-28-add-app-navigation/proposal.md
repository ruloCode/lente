# Proposal

## Why

The phone page grew one feature at a time into a single long scroll: the live card, meeting controls, briefing, past meetings, vocabulary, names and modes all compete on one screen, and the planned pieces (the closing agent's actions, MCP connections, desktop mode, the cloud hub, team memory) have nowhere to go. The Meta AI app, measured in `docs/kb/ui-reference.md`, keeps a calm home and puts everything else one tap away in a side menu. Lente should do the same, so the live moment stays uncluttered and the whole product is legible to a first-time user and to judges.

## What Changes

- A side menu (☰ in the header) with sections: Ahora (live), Reuniones, Memoria, Dispositivos and Ajustes, plus the three most recent meetings.
- Planned features appear in the menu greyed out with a "Pronto" tag (Acciones, Conexiones, Equipo; Usar el teléfono, Modo computadora and Hub en la nube inside Dispositivos; Solo grabar inside Ajustes). Tapping one opens a one-sentence screen saying what it will do and which change brings it. Nothing planned is presented as working. Each change removes its tag when it lands.
- Ahora keeps only the live loop: DILO card, meeting start/end, what's happening, the camera and today's timeline, with the bottom actions (Mirar, En vivo, Voz, Resumen).
- Reuniones holds the briefing and past meetings; Memoria the questions asked and answered, the wearer's phrases and the glossary; Dispositivos the clip state, audio loss and the mode; Ajustes the wearer's names, voice enrollment, voice output, the testing switch, privacy (delete memory) and a way to see the introduction again.
- A first-run introduction in five steps built only from existing features: what Lente does, the names people use for the wearer, connecting the clip (live state), "Lente, soy …" voice enrollment (live check) and how listening is shown and paused.

Out of scope: implementing any planned feature; sections only link to them.

Meta models: none directly.

Privacy: no data changes. The introduction explains that only text is kept and that listening is always visible.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `companion-app`: menu navigation, sections, planned features marked as such, first-run introduction.

## Impact

- `src/pilot-page.ts` only (markup, styles, client routing). No hub changes: every section uses events and routes that exist today.
- `docs/kb/decisions.md`: why a side menu and why planned features are visible but marked.
