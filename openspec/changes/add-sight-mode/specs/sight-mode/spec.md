# Spec Delta

## Purpose

Letting a person who is blind or has low vision use Lente's camera as eyes: continuous spoken descriptions in Spanish, questions out loud about what is in front of them, and an app that works with TalkBack. Lente describes; it never guides movement.

## ADDED Requirements

### Requirement: Ver is an assist mode
The hub SHALL accept `sight` as an assist mode beside `assist` and `record`. In `sight`, the hub SHALL turn on the camera's live reads with the sight prompt and SHALL NOT run reply cues.

#### Scenario: Turning Ver on
- **WHEN** the phone sets the assist mode to `sight` while a clip is connected
- **THEN** the clip is put in camera mode, live reads start with the sight prompt, and no Dilo card is produced for questions heard

#### Scenario: Leaving Ver
- **WHEN** the phone sets the assist mode back to `assist`
- **THEN** live reads stop unless they were on before, and live reads that remain use the meeting prompt again

### Requirement: Sight descriptions
Live reads in `sight` SHALL put text first, read verbatim up to 300 characters, then what is held close, then how many people and where, then the rest of the scene, with positions relative to the wearer. A reply of `=` SHALL mean "nothing changed" and SHALL produce no description and nothing spoken.

#### Scenario: Nothing changed
- **WHEN** the model answers `=` for a live frame
- **THEN** no `live` entry is published and the phone says nothing

#### Scenario: A long text
- **WHEN** a frame holds more than 300 characters of text
- **THEN** the description says there is a long text and offers to read it, instead of a text cut mid-word

### Requirement: No guidance to move
Lente SHALL NOT tell the wearer to move, cross, step, stop or go. When a question asks whether moving is safe, the answer SHALL describe what is seen and SHALL say Lente cannot judge whether it is safe.

#### Scenario: Asking to cross
- **WHEN** the wearer asks by voice «¿puedo cruzar?»
- **THEN** the answer describes the scene and says Lente cannot tell whether crossing is safe, and contains no instruction to cross or wait

### Requirement: Looking by voice
The voice agent SHALL have a `look` tool with a `question` and a `mode` of `describe` or `read`. The tool SHALL use a frame newer than 1.5 s, or ask the device for a fresh still. It SHALL ask Muse Spark 1.3 the question about that frame and return the answer for the agent to speak. In `read` mode it SHALL return the frame's text, up to 1,500 characters.

#### Scenario: What is in my hand
- **WHEN** the wearer says «¿qué tengo en la mano?» in a voice session with the clip connected
- **THEN** the agent calls `look` in `describe` mode and speaks the answer

#### Scenario: No camera
- **WHEN** `look` runs with no clip and no phone camera available
- **THEN** it returns «No hay cámara conectada» and nothing else is attempted

#### Scenario: The camera does not answer
- **WHEN** no frame arrives within 8 seconds of asking
- **THEN** the tool returns «No pude ver: la cámara no respondió»

### Requirement: No identities
Descriptions and look answers SHALL NOT name a person or guess identity, age, health or emotion from a face.

#### Scenario: A person in view
- **WHEN** the frame shows a person and the wearer asks «¿quién es?»
- **THEN** the answer says where the person is and what is visible, and says Lente does not identify people

### Requirement: The Ver screen works with TalkBack
The Android Ver screen SHALL be one focusable surface whose content description names its actions. It SHALL offer «Mirar», «Hablar con Lente» and «Pausar narración» both as gestures and as TalkBack custom actions. Its state SHALL be announced through a live region.

#### Scenario: TalkBack on
- **WHEN** TalkBack is on and a live description arrives
- **THEN** it is announced through the accessibility service, the app's own text-to-speech stays silent, and the hub still receives the narrated report

### Requirement: A guest session keeps nothing
While «Sesión de invitado» is on, the hub SHALL store no audio or photos, and SHALL NOT write live descriptions to the day record or the memory index. The switch SHALL turn itself off after 3 hours.

#### Scenario: A guest uses Ver
- **WHEN** a guest session runs Ver for ten minutes
- **THEN** no media object, day entry or memory unit is written for that time
