# Spec Delta

## Purpose

Answering a question from the wearer's whole memory or from one project's memory, by text or by voice, quickly and only from what was recorded, with sources that open where each claim came from.

## ADDED Requirements

### Requirement: Retrieval without a model call
The hub SHALL find the memory lines for a question in the wearer's runtime without calling a model, using the question's terms, time phrases, people and project, and SHALL send the model only those lines plus the memory prefix.

#### Scenario: A question about a person and a time
- **WHEN** the wearer asks «¿Qué dijo Ana el martes sobre el presupuesto?»
- **THEN** the lines shown to the model come from Tuesday and mention Ana, and no model call happens before the answer call

#### Scenario: Retrieval target
- **WHEN** the wearer has 90 days of all-day recording
- **THEN** retrieval takes at most 30 ms p95, as measured by `pnpm bench:ask` (target)

### Requirement: One streamed answer
A chat answer SHALL stream to the phone as it is generated, with its sources arriving next to the text, and a fast-path question SHALL need exactly one model call.

#### Scenario: First text
- **WHEN** a question takes the fast path
- **THEN** the first text of the answer reaches the phone within 1.2 s p50 of the question being sent (target)

#### Scenario: Sources while streaming
- **WHEN** the answer cites a line that was shown
- **THEN** its chip appears under the answer while the text is still streaming, and opens the meeting at that turn or the moment of that day

### Requirement: Only real sources
Cited ids that were not shown SHALL be dropped. A factual answer whose citations are all invalid SHALL be replaced on the phone by «No lo encuentro en lo que viste y escuchaste.».

#### Scenario: Made-up citation
- **WHEN** the model cites only ids that do not exist
- **THEN** the phone replaces the streamed text with the not-found line and shows no chips

#### Scenario: Small talk
- **WHEN** the wearer says «Hola, ¿qué puedes hacer?»
- **THEN** the answer is kept without sources

### Requirement: A cut-off answer is not "not found"
An answer that stops at the model's length limit SHALL never be reported as not found; the hub SHALL keep what streamed or retry once with a higher limit.

#### Scenario: Long commitment list
- **WHEN** the reply to «¿Qué prometí entregar esta semana?» hits the length limit
- **THEN** the wearer sees the commitments that streamed, ending in «…», not «No lo encuentro»

### Requirement: Hard project scope
A question asked inside a project SHALL be answered only from that project's records, memory cards, brief and people cards; no profile, global digest or other project's content SHALL reach the model.

#### Scenario: Asking a project about another project
- **WHEN** the wearer asks inside Atlas «¿A quién entrevistamos para diseño?» and only Orion's meetings mention it
- **THEN** the answer is the not-found line, and the prompt holds no line from Orion

#### Scenario: Whole memory
- **WHEN** the same question is asked outside any project
- **THEN** it is answered from Orion's meeting with its chip

### Requirement: The concrete line wins
When a raw segment and a summary both support a claim, the answer SHALL cite the segment, so names, numbers and dates are quoted as they were said.

#### Scenario: A number
- **WHEN** a meeting turn says the marketing budget is 18,000 dollars and a digest says only that a budget was set
- **THEN** the answer says 18,000 dollars and cites the turn

### Requirement: Cross-language questions
A question in Spanish SHALL find lines spoken in English, and the reverse.

#### Scenario: Spanish question, English meeting
- **WHEN** the wearer asks «¿Qué dijeron del presupuesto?» about a meeting where only "budget" was said
- **THEN** the answer cites that meeting's turn

### Requirement: Recall by meaning
Retrieval SHALL rank memory by meaning as well as by words, so a question in the wearer's own words finds a line that shares none of them. Word matches and meaning matches SHALL be combined, so names and numbers keep their exact matches.

#### Scenario: Paraphrase
- **WHEN** the wearer asks «¿Cuánta plata hay para anuncios?» and the meeting said "the marketing budget is 18,000 dollars"
- **THEN** the answer cites that turn and says 18,000 dollars

#### Scenario: Exact name
- **WHEN** the wearer asks about "PROBE-Carla Méndez"
- **THEN** the lines that name her rank above lines that are only similar in meaning

#### Scenario: Encoder change
- **WHEN** the encoder changes and the index is being rebuilt
- **THEN** questions are still answered from word matches, and meaning matches return when the rebuild ends

### Requirement: Deep questions
Aggregate questions and questions where retrieval is not confident SHALL take a deeper path. The phone SHALL show «Buscando más…» at once and stream the answer when it comes.

#### Scenario: Aggregate
- **WHEN** the wearer asks «Resume todo lo que hablé con Ana este mes»
- **THEN** «Buscando más…» appears at once, and the answer cites several of this month's meetings with Ana

### Requirement: Commands are not answers
A request to have something done SHALL become a proposed agent job, as with the agent bridge, and SHALL never be streamed as an answer.

#### Scenario: Asking for work
- **WHEN** the wearer writes «Haz que Claude prepare el plan de lanzamiento»
- **THEN** a job waits in «Por aprobar» and the chat shows the proposal, not a claim that it was done

### Requirement: Voice memory answers in one step
In voice mode the hub SHALL attach the best memory lines to the wearer's turn when it ends, so a memory question is answered in the voice model's first step.

#### Scenario: Memory question by voice
- **WHEN** the wearer says «¿Qué se decidió sobre la beta?»
- **THEN** the first spoken sentence is the answer, within 1.5 s p50 of the end of speech (target), with its chips on the phone

#### Scenario: Not a memory question
- **WHEN** the wearer says «Agrega que llame a Ana el viernes»
- **THEN** no memory lines are attached and the task tool runs as today

### Requirement: Session preload
When a voice session opens, the model SHALL already have the wearer's memory prefix (profile, people and recent days, or the project's brief inside a project), so questions about who and what is current need no lookup.

#### Scenario: Who someone is
- **WHEN** the wearer asks by voice «¿Quién es Marco?» and Marco has a people card
- **THEN** the answer comes from the card with no tool call

### Requirement: Questions stay in the runtime
The words of a question, the index, its terms and any vectors SHALL never reach the database or a log line in accounts mode, except as sealed values.

#### Scenario: Database view
- **WHEN** a question is answered on a hub with accounts
- **THEN** the database receives no request that contains a word of the question, and the log line shows only lengths and timings
