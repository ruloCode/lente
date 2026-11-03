# Spec Delta

## Purpose

The Android app's Inicio, readable at first glance: a dock with only two buttons, one to ask Lente and the round record button, the device pill with its Conectar screen, and the top bar's calendar, search and activity.

## ADDED Requirements

### Requirement: Two buttons in the dock
Inicio's bottom SHALL show only two buttons: a wide ask button shaped like a bar, with its whole label and no icon of its own, and the round record button. It SHALL NOT be a text field. No chips, dictation microphone or voice button SHALL sit in or above the dock.

#### Scenario: Opening the app
- **WHEN** the wearer opens Lente on Inicio
- **THEN** the bottom of the screen shows the ask button with its full label and the round record button, and nothing else

### Requirement: The ask button opens the chat
Tapping the ask button SHALL open the chat as a full-height sheet over Inicio. Inicio SHALL stay as it was behind it: an answer SHALL never replace the greeting or the projects.

#### Scenario: Asking from Inicio
- **WHEN** the wearer taps the ask button, types a question in the chat and sends it
- **THEN** the question and Lente's answer appear in the chat sheet, and Inicio behind it still shows the greeting and the projects

### Requirement: The chat sheet
The chat sheet SHALL show a drag handle, a header with close, where Lente looks and a new-conversation control (once there is a conversation), and the conversation oldest first (voice sessions included). Empty, it SHALL show a centred greeting and a few questions to start from. The composer SHALL be one card: the field on top; under it the scope chip, dictation and a round button that talks to Lente while the field is empty and sends once it has text.

#### Scenario: Empty chat
- **WHEN** the wearer opens the chat with no conversation yet
- **THEN** the sheet shows the greeting, a few questions to start from, and the scope chip reading "Toda mi memoria"

#### Scenario: Send replaces talk
- **WHEN** the wearer types one letter in the composer
- **THEN** the composer's round button changes from Hablar con Lente to send, and dictation stays beside it

#### Scenario: Asking within a project
- **WHEN** the wearer picks a project from the scope chip
- **THEN** the field's placeholder names that project and the next answer looks only there

### Requirement: Answer actions
Each answer SHALL take the full width with no avatar and offer copy, share and read aloud; the newest answer SHALL also offer to ask its question again. Its sources SHALL stay as chips that open what they cite. Under the newest answer a line SHALL say Lente answers only from the wearer's memory.

#### Scenario: Sharing an answer
- **WHEN** the wearer taps share under an answer
- **THEN** Android's share sheet opens with the answer's text, and nothing is sent until the wearer picks an app

### Requirement: The chat's history
The chat's header SHALL offer the history: the conversations the hub keeps, typed or by voice, newest first, each titled by its first question with when it was. Opening one SHALL show it in the chat, and the next question SHALL continue that conversation. The hub SHALL keep a typed question and its answer in the conversation the phone names, sealed like a voice session; a question with no conversation named SHALL NOT be kept.

#### Scenario: Going back to yesterday's question
- **WHEN** the wearer opens the history and taps yesterday's conversation
- **THEN** its questions and answers show in the chat, and a new question is added to that same conversation

#### Scenario: An old hub
- **WHEN** the hub does not offer the history yet
- **THEN** the history says the hub needs an update, and the chat keeps working

### Requirement: Leaving the chat
The chat sheet SHALL close with its close button, a swipe down on the handle or the back gesture, and Inicio SHALL be shown as it was, with the dock in place. Reopening the chat SHALL show the same conversation until the wearer starts a new one.

#### Scenario: Swipe down
- **WHEN** the wearer swipes the chat sheet down
- **THEN** Inicio shows again with its two buttons, and tapping the ask button shows the same conversation

### Requirement: Record button while recording
While Lente is listening the record button SHALL turn the live colour and tapping it SHALL open the live screen. Inicio SHALL NOT show a separate bar to open the live transcript.

#### Scenario: Back to the live screen
- **WHEN** the wearer collapses the live screen and taps the red record button on Inicio
- **THEN** the live screen opens again and listening never stopped

### Requirement: The device pill
The pill in the top-left corner SHALL say which device hears: the clip, the phone, or none (then it invites to connect). While listening it SHALL also show the elapsed time. Tapping it SHALL always open Conectar.

#### Scenario: Nothing connected
- **WHEN** neither the clip nor the phone is the device
- **THEN** the pill reads as an invitation to connect, and tapping it opens Conectar

### Requirement: Conectar
Conectar SHALL be a full screen with a back control. With no clip it SHALL show "searching" for a short time and then "not found" with a hint to turn the clip on near the same Wi-Fi and a button to use the phone as the microphone. With a device it SHALL show which one and its state, with a way to its details (lost and late audio, recorded time, spend).

#### Scenario: No clip, use the phone
- **WHEN** the wearer opens Conectar with no clip, waits until it says nothing was found, and taps the button to use the phone
- **THEN** after the microphone permission the phone becomes the device and the pill says so

#### Scenario: Clip connected
- **WHEN** the clip is connected and the wearer opens Conectar
- **THEN** the screen shows the clip as connected with its mode, and back returns to Inicio

### Requirement: Recuerdos in place of Hoy
Inicio's third tab SHALL be Recuerdos, without the ask button or the record button: on top the chosen moment (a picture of its colours with the day, the time and Revivir, then its title, place, length, lines said, summary and relive count); below, a wheel of fixed size whose rings turn with the finger and a carousel of moment cards along its arc. Until add-memory-timeline serves real moments, the tab SHALL use sample moments and say so.

#### Scenario: Turning to an earlier moment
- **WHEN** the wearer turns a finger around the wheel against the clock
- **THEN** the rings turn, the cards move along the arc, and the card on top shows the earlier moment's details

#### Scenario: Reliving
- **WHEN** the wearer taps the chosen card or Revivir
- **THEN** the moment plays as timed text with its clock, and on the third relive the end offers its summary

### Requirement: The top bar
To the right of the pill Inicio SHALL show round buttons for Calendario, Buscar, Actividad and the menu. Ajustes SHALL stay reachable from the menu.

#### Scenario: Reaching settings
- **WHEN** the wearer wants Ajustes from Inicio
- **THEN** they open the menu and choose Ajustes

### Requirement: Calendario
Calendario SHALL open a bottom sheet with a month grid: today marked, days with meetings marked, future days disabled, previous and next month, and a button to confirm. Confirming SHALL open that day's screen: back, the day as its title, previous and next day, and the day's meetings, or a line saying there were none.

#### Scenario: A past day
- **WHEN** the wearer picks a day with two meetings and confirms
- **THEN** the day screen lists those two meetings, and tapping one opens its detail

#### Scenario: An empty day
- **WHEN** the wearer moves to a day with no meetings
- **THEN** the day screen says there were no meetings that day

### Requirement: Buscar
Buscar SHALL open a full screen with the field focused and the keyboard up, and a cancel control. With an empty query it SHALL show shortcuts to Reuniones, Tareas, Memoria and Proyectos with their counts. A query SHALL list matching meetings, tasks and memories in groups, or one line saying nothing matched, with a control to clear the field.

#### Scenario: No match
- **WHEN** the wearer searches for a word no meeting, task or memory contains
- **THEN** the screen says nothing matched and offers to clear the field

#### Scenario: A meeting matches
- **WHEN** the wearer searches for a word said in a meeting
- **THEN** that meeting is listed under meetings and tapping it opens its detail

### Requirement: Actividad
Actividad SHALL open a full screen with back, listing newest first what waits for the wearer (actions to approve, memories to review) and what Lente finished (meeting notes ready, agent jobs done or failed). Each item SHALL open where it is handled. With nothing to show it SHALL say so in one line. The Actividad button SHALL carry a dot while something waits for the wearer.

#### Scenario: An action to approve
- **WHEN** a meeting ends with a proposed action
- **THEN** the Actividad button shows a dot, and the item in Actividad opens Acciones at that action

#### Scenario: Nothing yet
- **WHEN** the wearer opens Actividad with nothing pending or finished
- **THEN** the screen says there is no activity yet
