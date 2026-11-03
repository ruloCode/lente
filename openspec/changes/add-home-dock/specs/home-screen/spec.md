# Spec Delta

## Purpose

The Android app's Inicio, readable at first glance: a dock with only the field to ask Lente and the round record button, the device pill with its Conectar screen, and the top bar's calendar, search and activity.

## ADDED Requirements

### Requirement: Two controls in the dock
Inicio's bottom SHALL show only the field to ask Lente and the round record button. The field SHALL show its whole placeholder and no icon of its own. No chips, dictation microphone or voice button SHALL sit in or above the dock.

#### Scenario: Opening the app
- **WHEN** the wearer opens Lente on Inicio
- **THEN** the bottom of the screen shows the field with its full placeholder and the round record button, and nothing else

### Requirement: The field opens the chat
Tapping the field SHALL open the chat as a full-height sheet over Inicio with the field focused and the keyboard up. Inicio SHALL stay as it was behind it: an answer SHALL never replace the greeting or the projects.

#### Scenario: Asking from Inicio
- **WHEN** the wearer taps the field, types a question and sends it
- **THEN** the question and Lente's answer appear in the chat sheet, and Inicio behind it still shows the greeting and the projects

### Requirement: The chat sheet
The chat sheet SHALL show a drag handle and a close button, the conversation so far oldest first (voice sessions included), the starter suggestions while it is empty, and "Nueva conversación". The composer SHALL offer typing, dictation, Hablar con Lente and the scope chip. While the field is empty its round button SHALL dictate; with text it SHALL send.

#### Scenario: Empty chat
- **WHEN** the wearer opens the chat with no conversation yet
- **THEN** the sheet shows a few suggestions to ask and the scope chip reading "Toda mi memoria"

#### Scenario: Send replaces dictate
- **WHEN** the wearer types one letter in the composer
- **THEN** the composer's round button changes from dictate to send

### Requirement: Answer actions
Each answer in the chat SHALL offer copy, read aloud and share. Its sources SHALL stay as chips that open what they cite.

#### Scenario: Sharing an answer
- **WHEN** the wearer taps share under an answer
- **THEN** Android's share sheet opens with the answer's text, and nothing is sent until the wearer picks an app

### Requirement: Leaving the chat
The chat sheet SHALL close with its close button, a swipe down on the handle or the back gesture, and Inicio SHALL be shown as it was, with the dock in place. Reopening the chat SHALL show the same conversation until the wearer starts a new one.

#### Scenario: Swipe down
- **WHEN** the wearer swipes the chat sheet down
- **THEN** Inicio shows again with the field and the record button, and tapping the field shows the same conversation

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
