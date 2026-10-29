# Spec Delta

## ADDED Requirements

### Requirement: The phone stands in for the clip
While no clip is connected, the phone page SHALL offer to use the phone's microphone and camera. Once the wearer taps it and the browser grants permission, the page SHALL send the microphone as 16 kHz mono PCM16 with the clip protocol v2 (hello, sequenced audio frames) over a WebSocket, and the hub SHALL treat it as a clip: transcription, addressing, cues, memory, pause and modes behave exactly as with the clip.

#### Scenario: No clip, phone microphone
- **WHEN** no clip is connected and the wearer taps "Usar el teléfono" and allows the microphone
- **THEN** the status row shows the phone as the device, turns appear in the timeline, and a question aimed at the wearer produces a DILO card

#### Scenario: Pause
- **WHEN** the wearer pauses listening while the phone is capturing
- **THEN** no audio leaves the page until listening resumes

### Requirement: Phone camera for Mirar and En vivo
While the phone is the device, Mirar and En vivo SHALL use the phone's rear camera, sending a still picture sized like the clip's to the hub.

#### Scenario: Look with the phone
- **WHEN** the phone is the device and the wearer taps Mirar
- **THEN** a picture from the rear camera is described on Ahora as it would be from the clip

### Requirement: The clip takes over
When a clip connects while the phone is capturing, the clip SHALL become the device, the phone SHALL stop capturing and release the microphone and camera, and the page SHALL say that the clip took over.

#### Scenario: Clip powers on
- **WHEN** the clip connects while the phone is the device
- **THEN** the phone's microphone indicator turns off and the status row shows the clip

### Requirement: Secure context only
The page SHALL offer phone capture only where the browser allows it (HTTPS or localhost). The hub SHALL serve HTTPS when given a certificate and key. Over plain HTTP the page SHALL say in one sentence why the option is unavailable.

#### Scenario: Plain HTTP on the LAN
- **WHEN** the page is opened over plain HTTP from another device
- **THEN** "Usar el teléfono" is disabled with a one-line reason instead of failing after a tap

### Requirement: Capture needs the page visible
Browsers stop capture when the page is hidden. The page SHALL keep the screen on while capturing and, when capture stopped because the page was hidden, SHALL say so when the wearer returns and offer to resume.

#### Scenario: Wearer switches apps
- **WHEN** the wearer leaves the browser while the phone is capturing and comes back
- **THEN** the page shows that capture paused while it was hidden and offers to resume
