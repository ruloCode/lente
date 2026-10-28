# Tasks

## 1. Wearer identification

- [ ] 1.1 Pure module with a per-frame RMS ring and per-label median loudness; unit tests cover two speakers, the 2× margin and an unknown result (`pnpm test`)
- [ ] 1.2 Map completed turns to their audio span using `audioProcessedMs`; test with synthetic timings
- [ ] 1.3 Enrollment phrase in English and Spanish assigns the wearer label; unit test
- [ ] 1.4 Phone shows "You" for the wearer's label; verify with the simulated clip playing two voices at different levels

## 2. Addressing rules

- [ ] 2.1 `isAddressed` with name/alias and reply-chain rules, returning the deciding rule; unit tests for named, wearer-asks, other-person and reply cases
- [ ] 2.2 Ambiguous-case check with Muse Spark 1.3 (minimal effort, yes/no); verify one real call returns a decision in the hub log
- [ ] 2.3 Wearer name and aliases as a setting on the phone, stored by the hub; verify it survives a hub restart

## 3. Cues and signal

- [ ] 3.1 Cues fire only when addressed, with an "every question" testing switch; verify both paths with the simulated clip
- [ ] 3.2 Card and timeline show who asked and why; verify on a 390 px phone screenshot
- [ ] 3.3 Firmware drives the motor on D0 for ~300 ms on `B` (when fitted); verify by feel and with the LED-only clip that nothing breaks
