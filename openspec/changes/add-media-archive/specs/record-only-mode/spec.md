# Spec Delta

## REMOVED Requirements

### Requirement: Text only
**Reason**: The owner decided on 2026-11-03 that Lente keeps the day as speech audio, keyframes and text (`docs/kb/decisions.md`). Solo grabar is the main way a whole day is recorded, so it keeps media too.
**Migration**: Replaced by "What Solo grabar keeps" below. Days recorded before this change stay text only. Nothing is backfilled.

## ADDED Requirements

### Requirement: What Solo grabar keeps
Solo grabar SHALL keep the day as text and episode notes. Where the media archive allows it, it SHALL also keep speech audio and scene-change keyframes, sealed and expiring, as the `media-archive` capability defines. It SHALL keep no audio of silence.

#### Scenario: A full day recorded with media on
- **WHEN** Solo grabar runs for a full day with «Guardar audio» and «Guardar fotos» on
- **THEN** the day is kept as text, episode notes, speech audio chunks and keyframes, and silent stretches have no audio

#### Scenario: A full day recorded with media off
- **WHEN** Solo grabar runs for a full day with both switches off
- **THEN** the data holds the day as text and episode notes, and no audio or frames
