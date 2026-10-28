# Spec Delta

## Purpose

Telling the wearer what the clip's camera is looking at, once on request or continuously while Live is on.

## ADDED Requirements

### Requirement: Read one photo
When a photo arrives outside Live mode, the hub SHALL ask Muse Spark 1.3 what matters in it (a slide, screen, whiteboard or document first) and SHALL publish one sentence with the photo and the measured time.

#### Scenario: Look at a slide
- **WHEN** the wearer presses Look while facing a projected slide
- **THEN** the phone shows the photo and one sentence about the slide

### Requirement: Narrate continuously in Live mode
While Live is on, the hub SHALL request a new photo only after the previous one has been described, SHALL pass the previous description so the model reports only what changed, and SHALL recover if a photo or description does not arrive within ten seconds.

#### Scenario: Paced by the model
- **WHEN** describing a photo takes longer than the camera needs to take one
- **THEN** photos never queue up; the next is requested when the description is done

#### Scenario: Nothing changed
- **WHEN** the new description is identical to the previous one
- **THEN** the phone updates the photo but no new timeline entry is added

### Requirement: Live implies camera mode
Turning Live on SHALL switch the clip to camera mode, and switching to mic-only mode SHALL turn Live off.

#### Scenario: Live from mic-only
- **WHEN** the wearer turns Live on while in mic-only mode
- **THEN** the camera powers up and narration starts

### Requirement: Photos stay in memory
Photos SHALL only be relayed to the phone and the model; they SHALL NOT be written to disk.

#### Scenario: Day record after Live
- **WHEN** Live has run for a while
- **THEN** the day record contains descriptions as text and no image data
