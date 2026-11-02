# Premium asset pack

Made for Lente with Higgsfield on 2026-11-01. Every file was generated fresh from prompts written for Lente; the product renders use the kit's own `../clip-glasses.png` as a reference so the glasses and the clip stay the same object everywhere. The people in the lifestyle photos are generated, not real.

The Android app uses the light icon (`android/app/src/main/res/mipmap-*/ic_launcher_art.webp`), the mark's paths (`ui/Icons.kt`, the themed-icon and notification vectors) and `drawable-nodpi/art_*.webp`. `web/` holds what the web app should load (WebP, resized icons, the cropped share card); the PNG, SVG and GLB next to this file are the full-size sources.

## Brand

| File | What | Model |
|---|---|---|
| `logo-b.svg` → `web/logo-mark.svg` | The chosen mark: two overlapping lenses with a voice wave where they meet | Recraft V4.1 vector |
| `logo-a.svg` | The other proposal (a lens with a speech-bubble tail), not used | Recraft V4.1 vector |
| `app-icon-light.png`, `app-icon-dark.png`, `app-icon-tinted.png` | iOS 26 icon in its three appearances, full bleed (the system masks the corners) | GPT Image 2.5, high, 2K |
| `web/app-icon-1024.png`, `icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-64.png`, `favicon-32.png` | Sizes of the light icon for the App Store, the PWA manifest, iOS home screen and the browser tab | resized |

## Product

| File | What |
|---|---|
| `clip-hero.png` | Glasses with the clip, three-quarter view, transparent, 3504 × 2336 |
| `clip-front.png`, `clip-side.png` | Front and right-side views, transparent |
| `clip-macro.png` | The clip alone: lens, microphone, LED, USB-C, strap; transparent |
| `clip-dark.png` | Three-quarter view on black with a blue rim light, for dark mode |
| `lifestyle-meeting.png`, `lifestyle-desk.png` | Wearing it in a meeting; folded on a desk with space for text (4K) |
| `clip-glasses.glb` | 3D model (Tripo H3.1 from `clip-hero.png`, detailed geometry, PBR textures): 945k vertices, 58 MB. Too heavy for the phone as it is; simplify it before loading it in the app |

All renders: GPT Image 2.5, high quality.

## Illustrations

Frosted-glass 3D, transparent, 2048 px; GPT Image 2.5, high.

| File | Where |
|---|---|
| `onboarding-avisa.png`, `onboarding-recuerda.png`, `onboarding-privacidad.png`, `onboarding-voz.png` | The introduction: tells you when you're asked, remembers every meeting, nothing recorded unseen, learns your voice |
| `empty-reuniones.png`, `empty-acciones.png`, `empty-memoria.png`, `empty-preguntar.png` | Empty states of Reuniones, Acciones, Memoria and Preguntar |

## Backgrounds and marketing

| File | What |
|---|---|
| `bg-light.png`, `bg-dark.png` | Ambient app backgrounds, 9:16; the dark one stays near black so white text keeps 7:1 |
| `hero-dark.png` | 4K launch image: the mark, «Lente», «Escucha tu reunión. Te dice qué responder.», the glasses |
| `og-source.png` → `web/og-1200x630.jpg` | Share card, light theme, cropped to 1200 × 630 |
