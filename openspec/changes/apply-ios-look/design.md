# Design

## Context

`src/pilot-page.ts` names its colors through a few variables (`--bg`, `--surface`, `--raised`, `--line`, `--ink`, `--muted`, `--cyan`, `--amber`, `--live`, `--ok`) and its fonts through `--display`, `--body`, `--mono`. The kit (`docs/design/ios-kit/tokens.css`) has measured light and dark values for the same roles.

## Decisions

- **Remap, don't rewrite.** Keep the page's variable names and point them at kit values, then restyle the components that need more than color (shadows, glass, radii, type). Markup and scripts are untouched, so the hub's routes, the page tests and the live behavior can't regress.
- **Theme follows the system.** Light by default, dark under `prefers-color-scheme: dark`. Both keep text at 7:1 or more on its surface, as in the kit.
- **One accent.** Blue (`--accent`) marks the Dilo tag, links, selected controls and primary buttons; red only for recording. Measured numbers use tabular figures in the secondary ink instead of amber, so color still never carries meaning alone.
- **Native type.** `-apple-system` / SF Pro on Apple devices, `system-ui` elsewhere (Roboto on the Android bench). No web fonts, which also removes a network dependency at launch.

## Risks

- The Android bench renders Roboto, not SF: spacing was measured for SF. Accept for now; the kit's README notes the fix (ship Inter) if it matters.
