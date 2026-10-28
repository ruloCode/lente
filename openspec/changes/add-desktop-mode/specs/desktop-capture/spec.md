# Spec Delta

## Purpose

Using Lente on a computer, without the clip, by capturing a meeting tab or window from the browser.

## ADDED Requirements

### Requirement: Capture a meeting tab
The desktop page SHALL let the user pick a tab or window to share, SHALL send its audio (mixed with the microphone if the user enables it) to the hub as 16 kHz mono audio over the clip protocol, and SHALL send a picture of it when the scene changes.

#### Scenario: Meet in a tab
- **WHEN** the user shares a Meet tab and someone asks them a question
- **THEN** the transcript and the cue appear as they would with the clip

#### Scenario: Slide changes
- **WHEN** the shared screen shows a new slide
- **THEN** one picture is sent and described, and repeated identical frames are not

### Requirement: Same rules as the clip
The desktop page SHALL appear to the hub as a clip, subject to the same pause, mode and consent behavior, and SHALL show clearly while it is capturing.

#### Scenario: Pause from the phone
- **WHEN** the wearer pauses Lente from the phone
- **THEN** the desktop page stops sending audio and shows that it is paused

#### Scenario: Sharing stopped
- **WHEN** the user stops sharing in the browser
- **THEN** the page disconnects and the phone shows no active source
