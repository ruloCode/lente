# Spec Delta

## MODIFIED Requirements

### Requirement: Framed uplink
Every message from the clip to the hub SHALL be a frame of one type byte, a four-byte little-endian payload length, and the payload. Types SHALL be `H` (hello, JSON), `A` (audio) and `J` (JPEG). An audio payload SHALL start with a four-byte sequence number and a four-byte capture time in milliseconds since the clip started, followed by PCM16 mono samples at the sample rate declared in the hello.

#### Scenario: Frames split across network packets
- **WHEN** a frame arrives split over several TCP chunks or several frames arrive in one chunk
- **THEN** the hub reassembles exactly the frames that were sent, in order

#### Scenario: Corrupt length
- **WHEN** a frame declares a payload larger than 2 MB
- **THEN** the hub rejects the stream and closes the connection instead of buffering it

#### Scenario: Golden frames
- **WHEN** the shared fixtures file is decoded by the hub's tests and by the firmware self-test
- **THEN** both produce the same types, sequence numbers, times and sample counts

## ADDED Requirements

### Requirement: Versioned handshake
The first frame on a connection SHALL be a hello declaring the protocol version (major.minor), firmware version, codec and sample rate. The hub SHALL refuse a connection whose major version differs from its own, closing it and showing a plain-language message to update the clip, and SHALL accept any minor version within the same major.

#### Scenario: Old firmware
- **WHEN** a clip running protocol 1 connects to a protocol 2 hub
- **THEN** the hub closes the connection and the phone says the clip firmware needs updating

#### Scenario: Missing hello
- **WHEN** the first frame is not a hello
- **THEN** the hub closes the connection

### Requirement: Account for lost audio
The hub SHALL track audio sequence numbers per connection and SHALL count gaps and out-of-order frames, exposing the totals in its status and in eval results; a gap SHALL be filled with silence of the missing duration so the audio timeline stays aligned.

#### Scenario: Wi-Fi drop
- **WHEN** five audio frames are lost
- **THEN** the hub counts five lost frames and inserts 400 ms of silence in their place
