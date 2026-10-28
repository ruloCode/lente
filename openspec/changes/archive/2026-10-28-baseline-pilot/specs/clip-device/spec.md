# Spec Delta

## Purpose

The clip is the wearable half of Lente: it hears and sees from the wearer's glasses and signals back, while doing as little thinking as possible on the device.

## ADDED Requirements

### Requirement: Join the configured network
The clip SHALL join the 2.4 GHz Wi-Fi network named in its local, git-ignored configuration, and SHALL report on its serial console when that network is not visible on 2.4 GHz, listing visible networks whose names contain the configured name.

#### Scenario: Network only broadcast on 5 GHz
- **WHEN** the configured network name is not visible to the clip
- **THEN** the serial console reports that it is not visible on 2.4 GHz and lists similarly named networks with their channels

#### Scenario: Network visible
- **WHEN** the configured network is visible
- **THEN** the clip connects and logs its signal strength in dBm

### Requirement: Stream the microphone continuously
While connected to the hub and not paused, the clip SHALL send microphone audio as signed 16-bit mono PCM at 16 kHz in 80 ms blocks, and SHALL keep reading the microphone while paused so that resuming does not deliver stale audio.

#### Scenario: Listening
- **WHEN** the clip is connected and listening
- **THEN** the hub receives one 2,560-byte audio block about every 80 ms

#### Scenario: Paused
- **WHEN** the hub sends the pause command
- **THEN** the clip stops sending audio until the listen command arrives

### Requirement: Take a photo on demand
The clip SHALL capture and send one JPEG (1024×768) when its BOOT button is pressed or when the hub asks for a photo, discarding a possibly stale buffered frame first.

#### Scenario: Button press
- **WHEN** the wearer presses the BOOT button
- **THEN** the hub receives one fresh JPEG within a few seconds

### Requirement: Camera power follows the mode
The clip SHALL keep the camera sensor powered down unless the hub selects camera mode, and SHALL still take a single photo in mic-only mode by powering the camera up for that photo and down again afterwards.

#### Scenario: Mic-only mode with a photo request
- **WHEN** the clip is in mic-only mode and a photo is requested
- **THEN** it powers the camera up, sends one photo, and powers it down again

### Requirement: Blink for a cue
The clip SHALL blink its user LED three times when the hub signals a cue, and SHALL otherwise keep the LED dark.

#### Scenario: Cue signal
- **WHEN** the hub sends the blink command
- **THEN** the LED blinks three times within about one second

### Requirement: Reconnect without intervention
The clip SHALL retry the hub connection every two seconds while disconnected and SHALL resume streaming once reconnected, without a reboot.

#### Scenario: Hub restarted
- **WHEN** the hub process restarts
- **THEN** the clip reconnects and audio flows again without anyone touching the clip
