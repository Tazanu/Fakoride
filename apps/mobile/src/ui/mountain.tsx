/**
 * Mount Cameroon, from Buea.
 *
 * The mountain is not scenery here — it is the product. Fares are priced by
 * gradient because this town is built on a volcano, "up" and "down" are what
 * every rider and every driver actually negotiates, and the app is named after
 * the division the mountain sits in. A welcome screen that opened on a generic
 * city skyline would be describing somewhere else.
 *
 * Drawn rather than photographed, for three reasons: it costs nothing to
 * download on a connection people pay for by the megabyte, it cannot go out of
 * date, and it holds the canvas palette exactly — a photograph would fight the
 * teal field rather than sit in it.
 *
 * The view is the one from town: the summit left of centre, the long southern
 * shoulder falling away east, foothills in front, and the mist that sits on
 * those shoulders most mornings of the year. The amber scatter low on the near
 * ridge is Buea at dusk, in the badge's own amber — which the tokens reserve
 * for the welcome screen and nothing else.
 *
 * Purely decorative: no text sits over it, and it is hidden from screen
 * readers rather than described, because "a drawing of a mountain" is not
 * information anybody needs read aloud.
 */

import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { logoPalette, palette } from "@/theme";

const c = palette("light");
const logo = logoPalette;

/**
 * The drawing's own coordinate space.
 *
 * Wider than any handset, and cropped rather than squashed, so the summit
 * keeps its shape on a narrow screen instead of being stretched into a hill.
 */
const VIEW_W = 390;
const VIEW_H = 150;

/**
 * The far massif.
 *
 * Asymmetric on purpose. From Buea the mountain climbs hard out of the west,
 * carries a broad flattish crest rather than a peak — Fako is a dome, not a
 * horn — and then falls away south-east over a very long shoulder. The small
 * rise at x≈250 is one of the flank cones that shoulder is covered in. A
 * symmetrical triangle would be Fuji, and would be a lie about this place.
 */
const SUMMIT =
  "M -20 150 L -20 112 C 4 108, 30 96, 52 78 C 70 63, 84 40, 104 28 C 112 23, 120 20, 130 20 C 140 20, 148 21, 156 24 C 166 28, 172 38, 180 50 C 190 64, 200 76, 213 84 C 223 90, 232 88, 241 82 C 250 76, 256 72, 264 77 C 274 83, 284 95, 302 102 C 328 112, 366 115, 410 117 L 410 150 Z";

/** The middle ground, where the mountain becomes farm plots and rooftops. */
const SHOULDER =
  "M -20 150 L -20 126 C 18 122, 52 110, 84 98 C 112 88, 138 80, 166 84 C 192 88, 214 102, 240 112 C 268 122, 310 128, 348 130 C 374 131, 396 132, 410 132 L 410 150 Z";

/**
 * The near ridge the town is built along. Meets the sheet.
 *
 * Given real undulation rather than a flat band: at this size a straight edge
 * reads as the bottom of the drawing, and the lights that sit on it looked
 * like they were hanging in the air.
 */
/**
 * The near ridge as an open line, stroked over the fill.
 *
 * Its fill and the shoulder's differ by one hex step, which at this size is
 * nothing — the layer was there and invisible. A thin lit edge along the top
 * is how you actually tell two dark ridges apart at dusk, and it costs one
 * more path.
 */
const FOOTHILL_EDGE =
  "M -20 141 C 16 139, 42 129, 70 130 C 96 131, 116 140, 144 139 C 174 138, 198 128, 230 130 C 260 132, 284 141, 316 139 C 348 137, 386 134, 410 135";

const FOOTHILLS =
  "M -20 150 L -20 141 C 16 139, 42 129, 70 130 C 96 131, 116 140, 144 139 C 174 138, 198 128, 230 130 C 260 132, 284 141, 316 139 C 348 137, 386 134, 410 135 L 410 150 Z";

/** Buea at dusk, on the near slope. Placed by hand, not scattered randomly. */
const LIGHTS: { x: number; y: number; r: number }[] = [
  { x: 84, y: 136, r: 1.2 },
  { x: 100, y: 139, r: 1.5 },
  { x: 118, y: 144, r: 1.1 },
  { x: 138, y: 144, r: 1.6 },
  { x: 158, y: 141, r: 1.2 },
  { x: 176, y: 137, r: 1.4 },
  { x: 196, y: 134, r: 1.1 },
  { x: 216, y: 134, r: 1.7 },
  { x: 238, y: 136, r: 1.2 },
  { x: 258, y: 139, r: 1.4 },
  { x: 280, y: 143, r: 1.1 },
  { x: 302, y: 144, r: 1.5 },
  { x: 324, y: 142, r: 1.2 },
  { x: 348, y: 139, r: 1.3 },
  { x: 372, y: 138, r: 1.1 },
];

export function Mountain({ height = 150 }: { height?: number }) {
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      // Crop the sides on a wide screen, keep the summit. Never squash.
      preserveAspectRatio="xMidYMax slice"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        {/* Mist, thickest where it meets the shoulder and gone by the summit. */}
        <LinearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.onActionEdge} stopOpacity="0" />
          <Stop offset="0.55" stopColor={c.onActionEdge} stopOpacity="0.22" />
          <Stop offset="1" stopColor={c.onActionEdge} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Path d={SUMMIT} fill={c.onActionLine} />
      <Rect x="-20" y="74" width="450" height="32" fill="url(#mist)" />

      <Path d={SHOULDER} fill={c.actionDeep} />
      <Rect x="-20" y="110" width="450" height="24" fill="url(#mist)" />

      <Path d={FOOTHILLS} fill={c.actionPressed} />
      <Path d={FOOTHILL_EDGE} stroke={c.onActionEdge} strokeWidth={1} opacity={0.35} fill="none" />

      {LIGHTS.map((l) => (
        <Circle key={`${l.x}-${l.y}`} cx={l.x} cy={l.y} r={l.r} fill={logo.amber} opacity={0.85} />
      ))}
    </Svg>
  );
}
