# Design Foundation

Warcry Herald should feel like a practical campaign ledger, not a marketing
page or a reproduction of any official publication.

## Product Shape

- The first screen should give direct access to the campaign ledger.
- Navigation should remain compact and predictable.
- Dense campaign data should favor tables, summaries, and clear status labels.
- Fantasy styling should support usability rather than compete with it.

## Visual Direction

Use original visual cues inspired by:

- Heraldic records.
- Wax seals.
- Inked maps.
- Weathered parchment.
- Carved stone.
- Aged metal.
- Faction-colored accents.

Do not use Games Workshop layouts, artwork, logos, or copied publication
presentation.

## Accessibility Rules

- Body text must use a highly readable font.
- Decorative type is limited to headings.
- Controls must have visible focus states.
- No essential information can be conveyed only through color.
- The app must work at 360 pixels wide without horizontal scrolling.
- Reduced-motion preferences should be honored when animation is introduced.

## Phase 9 Design System

The Phase 9 component layer lives in `src/components/design-system.tsx` and is
documented in the app at `#/style-guide`.

Reusable components:

- `HeraldPanel`
- `ParchmentCard`
- `SectionBanner`
- `WaxSealBadge`
- `StatBlock`
- `RunemarkBadge`
- `FighterCard`
- `WarbandBanner`
- `CampaignTimeline`
- `LedgerTable`
- `ConfirmationScroll`

Implementation notes:

- Fantasy cues are original CSS treatments: parchment texture, ink borders,
  wax-seal badges, timeline markers, and faction-tone accent bands.
- Body copy stays on the system sans-serif stack; decorative serif type is used
  for headings and banners only.
- Existing workflow surfaces keep their dense layouts and collapse to one
  column on small screens.
- Tables use an internal scroll container when the data shape is wider than a
  phone viewport, so forms and page-level layout remain usable at 360 pixels.
- Motion is limited to small button feedback and is disabled through
  `prefers-reduced-motion`.
