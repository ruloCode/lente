# Spec Delta

## ADDED Requirements

### Requirement: Pair the phone
The phone SHALL pair with a hub by entering or scanning a short code shown by the hub; the hub SHALL then remember that phone, and unpaired browsers SHALL see nothing but the pairing screen.

#### Scenario: First visit to the cloud hub
- **WHEN** a browser opens the cloud hub without being paired
- **THEN** it sees only the pairing screen and no status or content

#### Scenario: Paired phone returns
- **WHEN** a paired phone opens the page again
- **THEN** it goes straight to the app
