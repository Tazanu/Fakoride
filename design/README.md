# Daylight — the Fako Ride design system

Version 0.2. Every rule below exists because of something we found, not because
it looked good. Where a rule has a number attached, that number is the reason.

```
design/
  tokens.json        source of truth — colours, type, spacing, touch targets
  tokens.ts          typed access for the apps and the ops console
  check-contrast.mjs asserts every colour pair against its WCAG floor
  mockups/           the screens, as editable HTML artboards
```

## The six rules

**1. Light ground. Night is the exception, not a preference.**
This app is used standing at Checkpoint at one in the afternoon, four degrees
from the equator. In bright light, readability measures **5.78 for light mode
against 4.29 for dark**, and only 35% of people prefer dark outdoors — though
94% prefer it in a dark room. So `theme("light")` is the default and
`theme("night")` switches on ambient light or time of day, never on taste.

**2. Interface text ships in the phone's own font.**
Roboto on Android, San Francisco on iOS. Our riders are on Tecno, Infinix and
itel handsets running Android Go with ≤2 GB of memory, buying data by the
megabyte. A bundled UI font costs APK weight and a flash of invisible text on
exactly those devices. Roboto is already installed and already tuned for small
sizes.

**3. One bundled face, for money and names only.**
Barlow Semi Condensed, two weights, subset — fares, headings, the wordmark.
Nothing else. French runs **20–25% longer** than English and short button labels
expand the most, so a semi-condensed display face earns its ~20 KB.

**4. Green is the action colour, and it had to be.**
MTN MoMo is yellow (`brand.mtnMomo`) and Orange Money is orange
(`brand.orangeMoney`), and both appear as chips on the payment screen. An amber
call-to-action — which v0.1 used — competes with a payment brand the user is
trying to choose between. Green is the only strong colour left that means
nothing else here. Those two brand hexes are for payment chips and nothing else.

**5. Thumbs, not cursors.**
Minimum **48×48 dp** touch target with **8 dp** between, body text never below
**14 sp**, no text below 12 px. v0.1 shipped 9 px navigation labels, which is
unreadable one-handed, outdoors, in sun.

**6. Dense with facts, single in action.**
Google's research on the next billion users is blunt that Western minimalism
underperforms in these markets — sparse screens read as empty rather than calm.
But ride-hailing rewards the shortest possible booking flow. So: crowd the
screen with information that *removes a step* (repeat fares, live bike count,
service status), and never with decoration. One primary button per screen.

## Using the tokens

```ts
import { theme, font, space, radius, touch } from "../../design/tokens";

const c = theme("light");

const styles = {
  card:   { backgroundColor: c.card, borderColor: c.line, borderRadius: radius.md },
  fare:   { fontFamily: font.displayFamily, fontSize: 46, color: c.ink },
  button: { minHeight: touch.primaryButtonMinHeight, backgroundColor: c.action,
            paddingHorizontal: space.xl },
};
```

Two things never to do: write a colour as a literal hex in a component, and give
a button a fixed height or width. `Book this bike` becomes `Réserver cette moto`
and has to wrap without breaking the row.

## Checking a colour change

```bash
node design/check-contrast.mjs
```

18 pairs, each against the WCAG 2.2 floor — 4.5:1 for body text, 3:1 for
non-text UI that carries meaning on its own. It exits non-zero on failure, so it
belongs in CI.

This is not ceremony. The first muted grey we picked (`#6B7C73`) looked
perfectly fine and failed at 4.42:1; it was darkened to `#5E6F66` until it
passed. **If a pair fails, fix the token — never lower the floor.**

## The mockups

`mockups/*.dc.html` are the screens as standalone HTML, one file per artboard,
laid out by `canvas.json`. They are the reference for building the real screens,
not a component library — every value in them comes from `tokens.json`, so build
from the tokens and use the mockups to check yourself.

`Main`, `Booking` and `Trip` are the rider app. `DriverHome` and `Earnings` are
the driver app. `Tokens` is this system on one sheet. `WireRider`, `WireDriver`
and `WireFlow` are the low-fidelity wireframes and the end-to-end trip flow —
deliberately left rough, since they are about structure rather than surface.

Live canvas: https://claude.ai/code/artifact/8aa3fcb3-5f84-4d75-a1f5-8649aadca50d

## Sample data

Names, plates, ratings and fares in the mockups are placeholders. The fares
happen to match the seed formula in `api/src/modules/fare-math.ts`, but both are
provisional until somebody walks the corridor and prices it by hand.
