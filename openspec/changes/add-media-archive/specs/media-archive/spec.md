# Spec Delta

## Purpose

Keeping the wearer's day as speech audio and scene-change keyframes next to its text, where consent allows, sealed and expiring, so a remembered moment can be heard and seen again from its source.

## ADDED Requirements

### Requirement: Kept by default where consent allows
The hub SHALL keep speech audio and keyframes for the owner. For any other account it SHALL keep them only after that account has accepted a terms version that describes media. «Guardar audio» and «Guardar fotos» SHALL be on by default and SHALL stop storage at once when turned off.

#### Scenario: Owner records a meeting
- **WHEN** the owner records a meeting with both switches untouched
- **THEN** the meeting's speech audio and its keyframes are kept next to its text

#### Scenario: Terms without media
- **WHEN** an account has accepted only a terms version that does not describe media
- **THEN** no media is stored for it, and the phone asks it to read the new terms

#### Scenario: Switched off mid-meeting
- **WHEN** the wearer turns «Guardar audio» off during a meeting
- **THEN** no audio after that moment is stored, and the text keeps being recorded

### Requirement: Visible while kept
While media is being stored, the phone SHALL show it on Ahora and the clip SHALL show its media light pattern.

#### Scenario: Recording with audio kept
- **WHEN** «Guardar audio» is on and the clip is streaming speech
- **THEN** Ahora shows «Guardando audio» and the clip's light uses the media pattern

### Requirement: Speech only, aligned to segments
Stored audio SHALL contain only speech that passed the silence gate. Each chunk SHALL correspond to one memory segment.

#### Scenario: Silent hour
- **WHEN** the clip is on in a silent room for an hour
- **THEN** no audio is stored for that hour

### Requirement: Keyframes on change
With «Guardar fotos» on, a frame SHALL be kept only when the scene changed and at least 30 s have passed since the last kept frame.

#### Scenario: Same desk all morning
- **WHEN** the camera sees the same desk for an hour
- **THEN** one frame is kept for that hour, not 120

### Requirement: Play from a source
A source chip and a Revivir moment that have media SHALL offer «Escuchar», and the frame of that minute where one was kept.

#### Scenario: Hearing a quote
- **WHEN** the wearer taps «Escuchar» on a chip for Ana's budget line
- **THEN** that segment's audio starts within 1 s (target)

### Requirement: Sealed and private
Media SHALL be stored only sealed with the wearer's data key. It SHALL be opened only in the hub for that wearer, and SHALL never reach a client as a storage link, a log line or a model call.

#### Scenario: Storage view
- **WHEN** someone reads the storage bucket directly
- **THEN** every object is ciphertext and its key names no person, title or word that was said

### Requirement: Expiry and forgetting
Media SHALL be deleted when its retention passes (7, 30 or 90 days; 30 by default), when its day is forgotten, when its meeting is deleted and when the account is deleted.

#### Scenario: Retention
- **WHEN** a chunk is 31 days old under the default retention
- **THEN** the nightly run deletes it, and its chip no longer offers «Escuchar»

### Requirement: Measured cost
Storage per recorded hour and the clip's battery cost with frames on SHALL be measured and published before media is kept for anyone but the owner.

#### Scenario: Before opening
- **WHEN** media is about to be turned on for other accounts
- **THEN** `docs/benchmarks.md` already has the storage-per-hour and battery measurements
