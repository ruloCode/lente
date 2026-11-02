# Spec Delta

## Purpose

Showing the user the projects they are working on, detected from their meetings, first on the home screen.

## ADDED Requirements

### Requirement: Projects detected from meetings
After a meeting's notes, Lente SHALL assign the meeting to one of the user's active projects, open a new project, or leave it unassigned, from the meeting's title, topic and summary and the names of the user's projects; a failed assignment SHALL NOT block the notes.

#### Scenario: A meeting about a known project
- **WHEN** a meeting's notes are about a project the user already has
- **THEN** the meeting is assigned to that project and its tasks count toward it

#### Scenario: A meeting about something new
- **WHEN** the model proposes a new project whose name matches an existing one apart from case or accents
- **THEN** the meeting goes to the existing project and no duplicate is created

### Requirement: Managing projects
The user SHALL be able to see all projects, open one to see its meetings and open tasks, rename it, merge it into another, and archive it.

#### Scenario: Merging two projects
- **WHEN** the user merges one project into another
- **THEN** every meeting of the first belongs to the second and the first is archived

### Requirement: Projects first on the home screen
Before a conversation starts, Inicio SHALL show a short greeting and up to three active projects with their last activity, open tasks, meetings this week and next task, a link to all projects, and a row of suggestion chips above the ask bar, without the option cards.

#### Scenario: Opening the app
- **WHEN** the user opens Lente with no conversation in progress
- **THEN** they see their three most recently active projects and can ask Lente from the bar below
