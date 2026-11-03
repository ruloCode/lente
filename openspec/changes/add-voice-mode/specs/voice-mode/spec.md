# Spec Delta

## Purpose

Letting the wearer talk to Lente, hands-free, about what it knows, and have it act on their tasks and recordings, search the web and hand off work, with spoken answers as soon as they stop talking.

## ADDED Requirements

### Requirement: A voice session per user
The hub SHALL serve a WebSocket `/voice` that admits the same credentials as `/device` and runs the session in the caller's own runtime.

#### Scenario: Another user's credentials
- **WHEN** a phone opens `/voice` with no credentials, or with credentials that are not valid
- **THEN** the upgrade is refused and no session starts

#### Scenario: Sessions stay apart
- **WHEN** two users each open a voice session and one of them adds a task by voice
- **THEN** the task lands only in that user's list

### Requirement: The session's messages
The phone SHALL send PCM16 mono audio at 16 kHz as binary messages and its controls (`spoken`, `bargeIn`, `pause`, `resume`, `end`) as JSON text. The hub SHALL answer with JSON events: `listening` with the microphone in use, `state`, `partial`, `heard`, `thinking`, `reply`, `tool`, `sources`, `bargeIn`, `confirm`, `done`, `recordSheet`, `error` and `end`.

#### Scenario: Back to listening
- **WHEN** the phone reports it has spoken every sentence of the last reply
- **THEN** the session's state goes back to listening

### Requirement: Turns end where the wearer stops
Transcription in a voice session SHALL run in `ENDPOINTING` mode. Each `speechComplete` SHALL start one turn of the voice agent, and the session SHALL send `thinking` when it starts.

#### Scenario: A spoken question
- **WHEN** the wearer says "¿Qué tengo pendiente en Ternium?" and stops
- **THEN** the phone shows the words while they are spoken, then the thinking state, then the reply

### Requirement: Short spoken replies, sentence by sentence
The voice agent SHALL answer in Spanish in one to three sentences, with no lists or markdown. The hub SHALL send the reply one complete sentence at a time as it streams, and the phone SHALL speak each sentence with its own text-to-speech as it arrives. A reply that needs more than that SHALL say so, and the full text SHALL stay in the chat.

#### Scenario: First sentence before the last
- **WHEN** a reply has two sentences
- **THEN** the phone starts speaking the first before the second arrives

### Requirement: Barge-in
When the wearer speaks while Lente is speaking or thinking, the session SHALL cancel the reply in progress, SHALL send `bargeIn` so the phone stops speaking, and SHALL take the new turn. Speech that only repeats what Lente just said SHALL NOT count as barge-in.

#### Scenario: Interrupting Lente
- **WHEN** Lente is speaking and the wearer says "Espera, otra cosa"
- **THEN** the phone goes quiet, the cancelled reply sends nothing more, and the new turn is answered

### Requirement: Tools over what Lente already has
The voice agent SHALL be able to:
- answer from the whole memory with sources (`ask_memory`);
- list projects and tasks, by owner and project;
- add a task with its owner;
- complete, delete and reassign a task;
- open the record sheet with a project and the camera chosen (`start_recording`);
- search the web (`web_search`);
- hand off a job (`delegate`).

Every argument SHALL be validated in the hub; ids SHALL be ones the session showed the model.

#### Scenario: A memory question cites its sources
- **WHEN** the wearer asks what was decided in a meeting and the memory has it
- **THEN** the reply says it and the phone shows chips for the meetings it relies on

#### Scenario: Adding a task by voice
- **WHEN** the wearer says "Agrega que llame a Ana el viernes"
- **THEN** a task "Llamar a Ana" owned by the wearer, due "viernes", is added and Lente says so

#### Scenario: Web search names its sources
- **WHEN** the wearer asks something only the web can answer
- **THEN** the reply comes from Spark's web search and the phone shows the pages it used

#### Scenario: Recording needs a tap
- **WHEN** the wearer says "Empieza a grabar en Teker con cámara"
- **THEN** the phone opens the record sheet with Teker and the camera chosen, and nothing records until the wearer taps "Grabar"

### Requirement: Spoken confirmation, and nothing sent
Completing or deleting a task SHALL wait for a spoken yes in the next turn; any other answer SHALL leave the task as it was. Delegating SHALL NOT run anything: without an agent bridge it SHALL leave a task owned by Lente. The voice agent SHALL NOT send emails or messages.

#### Scenario: Completing a task
- **WHEN** the wearer says "Marca como hecha la de la cotización"
- **THEN** Lente asks for confirmation, and the task is done only after the wearer says "sí"

#### Scenario: Delegating
- **WHEN** the wearer says "Que un agente prepare el resumen para el cliente"
- **THEN** a task owned by Lente is left and nothing else runs

### Requirement: Kept as chat, never as a meeting
Each voice session SHALL be kept, sealed, as one thread of chat messages (the wearer's turns and Lente's replies with their source references) and SHALL show in Inicio's chat. A voice session SHALL NOT open a meeting or add turns to the day record.

#### Scenario: After the session
- **WHEN** the wearer ends a voice session
- **THEN** Inicio's chat shows what was said and answered in it

### Requirement: The clip or the phone
The session SHALL use the clip's microphone when the clip is connected and the phone's microphone otherwise. While it uses the clip, meeting listening SHALL be paused and SHALL resume when the session ends.

#### Scenario: Clip connected
- **WHEN** the wearer opens Hablar con Lente with the clip connected
- **THEN** the session hears the clip, and listening resumes as before when it ends
