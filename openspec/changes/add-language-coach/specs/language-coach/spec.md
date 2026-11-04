# Spec Delta

## Purpose

Letting a Spanish-speaking wearer learn Portuguese or French on the glasses in real time: Lente estimates their level in a short spoken conversation, helps them say, name, understand and correct things as they go about their day, and keeps what they met as text for review.

## ADDED Requirements

### Requirement: Only verified target languages
The coach SHALL offer a target language only when Lente's documented model support covers transcribing it and answering in it. Spoken output in a target language SHALL use a voice that speaks that language, or show the text without speaking it when none is available.

#### Scenario: A language not yet verified
- **WHEN** French has not passed its support check
- **THEN** «Idiomas» offers only the verified languages and French is shown as «Pronto»

#### Scenario: No voice for the language
- **WHEN** neither the hub's voice nor the phone has a Portuguese voice
- **THEN** the Portuguese text is shown on screen and Lente says in Spanish that it has no Portuguese voice on this phone

### Requirement: Placement conversation
«¿Qué nivel tengo?» SHALL start a spoken conversation of three to five minutes with a tutor that asks questions in the target language from easy to harder. The wearer SHALL be able to stop it at any time, and it SHALL end by itself after five minutes.

#### Scenario: A full placement
- **WHEN** the wearer answers the tutor's questions for four minutes
- **THEN** the tutor closes the conversation and gives the estimate

#### Scenario: Stopping early
- **WHEN** the wearer says «para» after one minute
- **THEN** the conversation ends, and an estimate is given only if enough was said, otherwise Lente says it needs a longer conversation

### Requirement: An honest level estimate
The placement SHALL end with an estimated CEFR band from A1 to C1, what it is based on (vocabulary range and grammar accuracy with quotes from the wearer's own words, and fluency numbers), and a plan of at most three steps. It SHALL always say that it is an estimate and not an official exam.

#### Scenario: Estimate spoken
- **WHEN** a placement ends with enough speech
- **THEN** Lente says the band, one reason for it, and that it is not an official exam, and the phone shows the evidence and the plan

#### Scenario: A quote that was never said
- **WHEN** the model's evidence quotes words the wearer did not say
- **THEN** that quote is dropped before the estimate is shown

### Requirement: Fluency is measured from timing
The estimate SHALL include the wearer's words per minute while speaking and their median time to start answering after the tutor finished, computed from the transcription's timing, not judged by the model.

#### Scenario: Timing numbers shown
- **WHEN** an estimate is shown
- **THEN** it lists words per minute and time to start answering as measured numbers

### Requirement: Re-placement is offered weekly
When the last placement in a language is seven days old or older, the tutor SHALL offer a new one once at the start of a session, and SHALL NOT insist when the wearer declines.

#### Scenario: A week later
- **WHEN** the wearer opens the tutor eight days after their last placement
- **THEN** the tutor offers a new placement once

### Requirement: Dime cómo se dice
When the wearer asks how to say something, Lente SHALL answer with the phrase in the target language at the wearer's level, speak it in the target language's voice, speak it again slower on request, and keep the phrase as a text item.

#### Scenario: Asking for a word
- **WHEN** the wearer asks «¿cómo se dice tenedor en portugués?»
- **THEN** Lente says «garfo» with its article in a Portuguese voice and keeps «o garfo = el tenedor»

### Requirement: Repeat and be understood
After a phrase is spoken, Lente SHALL invite the wearer to repeat it and SHALL say whether the transcription understood the phrase. It SHALL NOT present this as a pronunciation score.

#### Scenario: Repeated well enough
- **WHEN** the wearer repeats «o garfo» and the transcription contains «garfo»
- **THEN** Lente says it understood them

#### Scenario: Not understood
- **WHEN** the transcription of the repeat does not contain the phrase's key word
- **THEN** Lente says it did not catch it and offers to say it again slowly

### Requirement: Nombra lo que veo
A look in the coach SHALL name up to three things in front of the wearer in the target language with their article, at the wearer's level, spoken in the target language's voice, and SHALL keep each name as a text item. The scene-vision rules on people SHALL hold.

#### Scenario: A look at the table
- **WHEN** the wearer asks «¿qué es esto?» with a cup and a fork in view
- **THEN** Lente names «a xícara» and «o garfo» in Portuguese and keeps both

### Requirement: Tradúceme
While «Tradúceme» is on, a completed turn from someone other than the wearer in the target language SHALL be shown on the phone with its Spanish meaning, and spoken in the earbud when voice is on. It SHALL be available only where the room notice of the consent rules is in place.

#### Scenario: Someone speaks Portuguese
- **WHEN** a colleague says «Você pode me mandar o relatório amanhã?» while Tradúceme is on
- **THEN** the phone shows «¿Me puedes enviar el informe mañana?» under the Portuguese line

#### Scenario: Spanish needs no translation
- **WHEN** a colleague speaks Spanish while Tradúceme is on
- **THEN** nothing is translated

#### Scenario: Before the consent rules exist
- **WHEN** a person other than the owner turns on Tradúceme and the room notice is not available
- **THEN** it stays off and says it is not available yet

### Requirement: Corrígeme at most once a minute
While «Corrígeme» is on, a turn the wearer says in the target language with a clear mistake MAY get one correction: what they said, a better version and a reason of a few words. There SHALL be at most one correction per minute, shown on the phone with a buzz and never spoken while the wearer is speaking.

#### Scenario: Two mistakes in thirty seconds
- **WHEN** the wearer makes two mistakes thirty seconds apart
- **THEN** only the first gets a correction

#### Scenario: A correct sentence
- **WHEN** the wearer says a correct sentence in the target language
- **THEN** no correction is shown

### Requirement: The Dilo card at the wearer's level
While the coach is on for a language, a reply cue for a question asked in that language SHALL use words and grammar at the wearer's estimated band and SHALL keep its Spanish meaning.

#### Scenario: An A2 wearer is asked something in Portuguese
- **WHEN** the wearer's band is A2 and a colleague asks a question in Portuguese
- **THEN** the Dilo card shows a short, simple Portuguese line with its Spanish meaning

### Requirement: Words met are kept as text
Every phrase asked, thing named, line translated and correction given SHALL be kept in the day record as a short text item with its language, its Spanish meaning and the sentence it came from. No audio SHALL be stored, and nothing SHALL be kept during a guest or trial session.

#### Scenario: The day after
- **WHEN** the wearer named three objects and asked two phrases yesterday
- **THEN** yesterday's record holds five language items as text and no audio

### Requirement: Spaced review
«Repasemos» SHALL run a short spoken review of the items that are due, at most a fixed number per session, moving an item to a longer interval when the wearer gets it right and back to the shortest when they miss it.

#### Scenario: A review
- **WHEN** the wearer says «repasemos» with seven items due
- **THEN** the tutor asks the due items up to the session's limit and says how many were right

### Requirement: Progress from memory
Asked about their progress in a language, Lente SHALL answer from the memory: the latest band and its date, how many items were met this week, and the reviews done, citing the entries it used.

#### Scenario: «¿Cómo voy con el portugués?»
- **WHEN** the wearer asks it after a placement and a week of use
- **THEN** the answer gives the band with its date and this week's counts, with sources

### Requirement: Modes are opt-in
Every live mode SHALL be off until the wearer turns it on, SHALL show on the phone while it is on, and SHALL count every model call against the person's daily cap.

#### Scenario: Turning on the coach
- **WHEN** the wearer turns on Portuguese
- **THEN** only the modes they chose run, and the phone shows which ones are on
