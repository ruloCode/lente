# Spec Delta

## Purpose

Telling the wearer what happened in Lente and what waits for them: one activity feed, the same on every device, with alerts on the phone and the clip that the wearer controls.

## ADDED Requirements

### Requirement: The activity feed
The hub SHALL derive an activity feed from the meetings, actions, agent jobs and memories it keeps, from the last 14 days and newest first: notes being written, ready, failed or too short; actions waiting for approval; agent jobs done or failed; memories waiting for review, as one item. Each item SHALL say what happened and what it refers to, and approvals and failed jobs SHALL be marked urgent.

#### Scenario: A meeting ends
- **WHEN** a recording ends and its notes are written
- **THEN** the feed first shows the notes being written and then that they are ready, referring to that meeting

#### Scenario: Several memories to review
- **WHEN** a meeting proposes three memories
- **THEN** the feed shows one item saying three memories wait for review

### Requirement: Read state and settings follow the account
The hub SHALL keep, sealed in the wearer's profile, the time up to which the feed was read and the notification settings, and SHALL send the unread count on the event stream whenever it changes.

#### Scenario: Read on the phone, seen on the web
- **WHEN** the wearer opens Actividad on the phone
- **THEN** the unread count drops to zero on the phone and on any other connected device

### Requirement: The bell and Actividad
Inicio SHALL show a bell next to Ajustes with the unread count. The bell SHALL open Actividad: the feed grouped by day, each item with its action, and a filter for what waits for the wearer. Opening it SHALL mark the feed read.

#### Scenario: Notes ready
- **WHEN** the wearer taps the bell after a meeting's notes were written
- **THEN** Actividad shows the item with «Abrir notas», and tapping it opens that meeting

### Requirement: Alerts on the phone
The app SHALL post an Android notification for each new item allowed by the wearer's settings, once per item, while it runs and, when it is closed, from a background check at most every 15 minutes. Tapping the notification SHALL open Actividad. With «Ocultar el contenido» on, the notification SHALL not show the item's text on the lock screen.

#### Scenario: Quiet hours
- **WHEN** an item arrives at 23:30 with quiet hours from 22:00 to 07:00
- **THEN** no alert is posted, and the item is in Actividad

### Requirement: The clip buzzes for urgent items
With «Vibrar el clip para lo urgente» on, outside quiet hours, the hub SHALL send the clip its cue signal once when a new urgent item appears.

#### Scenario: An approval while walking
- **WHEN** an agent job waits for approval and the setting is on
- **THEN** the clip signals once and the item is in Actividad
