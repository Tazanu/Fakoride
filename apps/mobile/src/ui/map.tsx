/**
 * The map panel, and the sheet that sits over it.
 *
 * Every screen in the rider design is the same two pieces: a map filling the
 * top, and a rounded sheet pulled up over its bottom edge so the two overlap.
 * That overlap is the whole trick — it says the sheet belongs to the map rather
 * than following it down the page — so it lives here once instead of being
 * re-derived with a different negative margin on each screen.
 *
 * **This is a drawing, not a map.** There is no tile source, no OSM, no
 * MapLibre. The design canvas itself draws a stylised street grid, and until
 * real tiles are wired this reproduces that: the same block colours, the same
 * white roads, a position marker and route drawn from real coordinates where
 * they exist. It is honest scaffolding — it never claims to show a street a
 * rider could navigate by, and it costs no tiles, no API key and no data.
 *
 * When MapLibre lands, `MapPanel` is the one component that changes.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { mapPalette, palette, radius, space } from "@/theme";
import { Rise } from "./motion";

const c = palette("light");
const map = mapPalette;

/** How far the sheet is pulled up over the map. Straight from the canvas. */
const OVERLAP = 26;

type Marker = { x: number; y: number };

export function MapPanel({
  height,
  /** Where she is, in panel coordinates 0–1. Centre by default. */
  here = { x: 0.5, y: 0.55 },
  /** Other taxis, as dots. Positions are illustrative, never real ones. */
  pins = [],
  /** A dotted line from a driver to her, when one is coming. */
  driver,
  children,
}: {
  height: number;
  here?: Marker;
  pins?: Marker[];
  driver?: Marker;
  children?: ReactNode;
}) {
  const w = 390;
  const h = height;
  const hx = here.x * w;
  const hy = here.y * h;

  return (
    <View style={[styles.map, { height }]}>
      <Svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} accessibilityLabel="Map of your area">
        <Rect width={w} height={h} fill={map.ground} />

        {/* City blocks. Four, placed off-grid so it reads as a town. */}
        <Rect x={22} y={h * 0.08} width={112} height={h * 0.17} rx={6} fill={map.block} />
        <Rect x={238} y={h * 0.06} width={126} height={h * 0.19} rx={6} fill={map.block} />
        <Rect x={34} y={h * 0.52} width={104} height={h * 0.22} rx={6} fill={map.block} />
        <Rect x={244} y={h * 0.5} width={122} height={h * 0.25} rx={6} fill={map.block} />

        {/* Roads. White, and wider than feels right — they read as gaps. */}
        <Path d={`M-10 ${h * 0.42} L400 ${h * 0.38}`} stroke={map.road} strokeWidth={17} fill="none" />
        <Path d={`M-10 ${h * 0.78} L400 ${h * 0.76}`} stroke={map.road} strokeWidth={13} fill="none" />
        <Path d={`M178 -10 L202 ${h + 10}`} stroke={map.road} strokeWidth={15} fill="none" />
        <Path d={`M330 ${h * 0.2} L302 ${h + 10}`} stroke={map.lane} strokeWidth={8} fill="none" />

        {/* A driver on the way: a dotted run to her, and the car at its end. */}
        {driver ? (
          <>
            <Path
              d={`M${driver.x * w} ${driver.y * h} C${(driver.x * w + hx) / 2} ${driver.y * h} ${hx} ${(driver.y * h + hy) / 2} ${hx} ${hy}`}
              stroke={map.route}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray="1 11"
              fill="none"
            />
            <Circle cx={driver.x * w} cy={driver.y * h} r={17} fill={map.pin} />
          </>
        ) : null}

        {/* Other taxis nearby. A count, never a real position. */}
        {pins.map((p, i) => (
          <Circle key={i} cx={p.x * w} cy={p.y * h} r={6} fill={map.pin} />
        ))}

        {/* Her. A soft halo, then a hard dot with a white ring. */}
        <Circle cx={hx} cy={hy} r={26} fill={map.here} opacity={0.16} />
        <Circle cx={hx} cy={hy} r={9} fill={map.route} stroke={map.road} strokeWidth={3} />
      </Svg>

      {children}
    </View>
  );
}

/**
 * The sheet.
 *
 * Pulled up over the map by `OVERLAP` and rounded only at the top, so the map
 * appears to run underneath it.
 */
export function Sheet({
  children,
  style,
  handle = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** The little grab bar. Present when the sheet is the page's main body. */
  handle?: boolean;
}) {
  // The entrance lives here rather than on each screen: every sheet in the app
  // is this component, so this is the one place it can be consistent — and the
  // one place to change it if it ever turns out to be a millisecond too slow.
  return (
    <Rise style={[styles.sheet, style]}>
      {handle ? <View style={styles.handle} /> : null}
      {children}
    </Rise>
  );
}

/** A floating control over the map: 48×48, white, softly bordered. */
export function MapButton({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.mapButton, style]}>{children}</View>;
}

/** The white pill that floats over the map — "3 taxis near you". */
export function MapPill({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.mapPill, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  map: { backgroundColor: map.ground, overflow: "hidden" },

  sheet: {
    flexGrow: 1,
    marginTop: -OVERLAP,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: c.paper,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.lineStrong,
    alignSelf: "center",
    marginBottom: space.md,
  },

  mapButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
});
