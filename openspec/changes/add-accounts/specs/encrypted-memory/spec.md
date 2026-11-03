# Spec Delta

## Purpose

Keeping each user's memory in a structured database where every piece of content is encrypted under that user's own key before it is stored, and no user can reach another's.

## ADDED Requirements

### Requirement: Content sealed per user before storage
The hub SHALL encrypt every stored value that carries content (what was said or heard, speaker names, meeting titles and notes, camera descriptions, facts, tasks, drafts, chat, digests, profile, glossary, traces, refresh tokens) with AES-256-GCM under a data key that belongs to that user, bound to the table, column, user and row, before the value leaves the hub.

#### Scenario: Database dump
- **WHEN** someone reads the database directly, with the platform's console or a dump
- **THEN** they see ids, times, kinds, statuses and counts, and every content column is ciphertext

#### Scenario: Ciphertext moved
- **WHEN** a sealed value is copied into another row, column or user's record
- **THEN** opening it fails and the hub reports the record as unreadable instead of showing it

### Requirement: Keys outside the database
Each user's data key SHALL be stored only wrapped by a key-encryption key that lives in the hub's secret store and never in the database, and the hub SHALL refuse to start with a key-encryption key that cannot open its setup canary.

#### Scenario: Wrong key at start
- **WHEN** the hub starts with a key-encryption key different from the one used at setup
- **THEN** it stops with an error that names the canary check and serves nothing

#### Scenario: Key rotation
- **WHEN** the owner rotates the key-encryption key
- **THEN** every user's data key is re-wrapped under the new version and all memory still opens, with no content rewritten

### Requirement: Isolation between users
Every read and write SHALL be scoped to the signed-in user, clients SHALL reach the data only through the hub, and Row Level Security SHALL be enabled on every table with no access for the public or signed-in roles.

#### Scenario: Publishable key used directly
- **WHEN** someone calls the database's REST interface with the publishable key or a user's own token
- **THEN** every table returns no rows and every write is refused

#### Scenario: Two users at once
- **WHEN** two users are listening and asking at the same time
- **THEN** each one's events, meetings and answers contain only their own data

### Requirement: Finding the past without plaintext in the database
The hub SHALL locate a user's past content by the ids that digests and notes keep and by time ranges on plain columns, decrypt only those records in memory and rank them there, so the database never holds searchable plaintext and never receives the words of a question. A keyed index of hashed terms SHALL be added only if the long-history eval shows answers missed for lack of it.

#### Scenario: Searching an old meeting
- **WHEN** the user asks about something said three months ago
- **THEN** the hub reaches that meeting through a digest's ids or its date, opens only the records it named, and the database receives no word of the question

### Requirement: Database health and free-plan limits
The hub's health SHALL report whether the database answers, is slow, paused or unreachable, without content, and the deployment SHALL record its size per hour of listening against the plan's limit with a written point at which to move to a paid plan.

#### Scenario: Project paused
- **WHEN** the database project has been paused by the platform
- **THEN** health reports the database as paused, the phone shows a note, and no write is silently lost

#### Scenario: Approaching the limit
- **WHEN** the database passes 70 % of the plan's size
- **THEN** the owner is told on the phone and in the hub log that it is time to move to the paid plan

### Requirement: Structured schema with migrations
The database schema SHALL be defined by versioned SQL migrations in the repository, with a table per kind of memory, foreign keys that cascade from the user, and indexes on user and time, and a test SHALL fail if any table lacks Row Level Security.

#### Scenario: New table without RLS
- **WHEN** a migration adds a table and forgets to enable Row Level Security
- **THEN** the schema test fails before the change can merge

### Requirement: Works without the database
When no database keys are configured, the hub SHALL keep its memory in local files as before, so the laptop hub, the smoke test and the unit tests run with no keys.

#### Scenario: Laptop with no keys
- **WHEN** the hub starts without the database keys
- **THEN** it uses the local file stores for one owner and every existing test and the smoke test pass
