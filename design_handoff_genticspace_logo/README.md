# Handoff: Genticspace Logo

## Overview
Brand mark and lockup for genticspace.com. The mark is a "leaf quartet with agent dot": three leaves (teal, amber, indigo) arranged around a center in a diamond formation, with the fourth position replaced by a solid red circle — the "agent" among leaves. Asymmetry (three leaves + one dot) is intentional and is what distinguishes it from generic four-petal marks.

## About the Design Files
The files in this bundle are **design references created in HTML/SVG** — they show the intended look, not production code to copy verbatim. Recreate the logo in the target codebase's environment (React component, static SVG asset, favicon set, etc.) using its established patterns. The SVGs here are clean and production-usable as-is if the codebase simply serves static assets.

## Fidelity
**High-fidelity.** Colors, proportions, and geometry are final. Reproduce exactly.

## The Mark (logo.svg)
Canvas: 100×100 viewBox, four elements around center (50,50):
- **Teal leaf** — horizontal lens (pointed ends left/right), centered (50, 24), tip-to-tip 46, arc radius 27. Fill `#3cb8a2`.
- **Amber leaf** — vertical lens, centered (24, 50), same dimensions. Fill `#e8a23c`.
- **Indigo leaf** — vertical lens, centered (76, 50), same dimensions. Fill `#3540c0`.
- **Red dot** — circle, center (50, 77), radius 15. Fill `#e8404f`.

Each lens is two circular arcs (radius 27) meeting at pointed tips — see the SVG path source. Keep the visual gap around the center; elements never touch.

## The Lockup (logo-lockup.svg)
Mark scaled to 64px height + wordmark:
- Wordmark: "genticspace", all lowercase, Space Grotesk SemiBold (600), 30px at this scale, letter-spacing -0.02em, fill `#23261f`.
- Gap between mark and wordmark ≈ 0.19× mark height.
- Load font: https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap (or self-host). If SVG text is a problem, convert wordmark to outlines.

## Design Tokens
- Teal `#3cb8a2`, Indigo `#3540c0`, Amber `#e8a23c`, Red `#e8404f`
- Ink (wordmark) `#23261f`; works on light backgrounds (`#fbfcf9` / `#edefe9`)
- Font: Space Grotesk (Google Fonts), weight 600 for wordmark

## Usage Rules
- Minimum mark size: 16px (favicon OK — the dot stays legible).
- On dark backgrounds, keep leaf colors as-is; switch wordmark to `#fbfcf9`.
- Do not rotate, recolor, or add a fifth element.

## Files
- `logo.svg` — mark only, 100×100
- `logo-lockup.svg` — mark + wordmark
- `reference.png` — user-approved raster reference of the mark
- `Genticspace Logo.dc.html` — original exploration file (concept 3a is the chosen one)
