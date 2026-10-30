# Spec Delta

## ADDED Requirements

### Requirement: Native look in light and dark
The phone page SHALL use the Lente iOS kit's look: the system font, light and dark themes that follow the phone's setting, one blue accent and red only for recording. Text SHALL keep at least 7:1 contrast on its surface in both themes, and state SHALL never be shown by color alone.

#### Scenario: Phone in dark mode
- **WHEN** the phone's appearance is dark
- **THEN** the page renders the dark theme and every text measures at least 7:1 on its surface

#### Scenario: Listening at a glance
- **WHEN** Lente is listening and then paused
- **THEN** the pill reads "Escuchando" with a red dot and then "En pausa" with a grey dot, in both themes
