/**
 * The map's own style, in the app's palette.
 *
 * MapLibre wants a style JSON. Rather than ship one of the stock Protomaps
 * styles — which are grey and blue and look like every other map — this builds
 * one from `design/tokens.json`, so the real map comes out the same colours as
 * the drawing it replaces. The `color.map` tokens were chosen for that drawing
 * and turn out to map cleanly onto the Protomaps layers: ground to earth,
 * block to buildings, ridge to landuse, road and lane to the two road weights.
 *
 * **No labels, deliberately.** Two reasons, and the first is the honest one:
 * only 91 of the 1,915 road segments OpenStreetMap holds for Buea carry a name
 * — 4% — so a labelled basemap would be a scattering of names over a town that
 * mostly has none, which is exactly the problem the landmark gazetteer exists
 * to solve. The app puts its own names on the map, and they are better.
 *
 * The second is that labels need glyph files. Leaving them out keeps the whole
 * basemap to one 2.8 MB file with nothing to fetch, which is what makes it work
 * on the Soppo climb with no signal.
 */

import { mapPalette } from "@/theme";

const m = mapPalette;

/** Protomaps' `kind` values, in the two weights the drawing already used. */
const MAJOR = ["highway", "major_road", "medium_road"];
const MINOR = ["minor_road", "other", "path"];

/**
 * A MapLibre style over one PMTiles archive.
 *
 * `uri` is where the file actually landed on the device — an asset inside the
 * app, so a `file://` path — and gets the `pmtiles://` prefix that tells
 * MapLibre Native to read tiles out of the archive by byte range.
 */
export function fakoStyle(uri: string): object {
  return {
    version: 8,
    name: "Fako",
    sources: {
      fako: {
        type: "vector",
        url: `pmtiles://${uri}`,
        attribution: "© OpenStreetMap",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": m.ground } },

      {
        id: "earth",
        type: "fill",
        source: "fako",
        "source-layer": "earth",
        paint: { "fill-color": m.ground },
      },
      {
        id: "landuse",
        type: "fill",
        source: "fako",
        "source-layer": "landuse",
        paint: { "fill-color": m.ridge },
      },
      {
        id: "water",
        type: "fill",
        source: "fako",
        "source-layer": "water",
        // The only blue on the map, and Fako has little water in frame — the
        // sea is south of Limbe, off the edge of most of these screens.
        paint: { "fill-color": "#C6D8DC" },
      },
      {
        id: "buildings",
        type: "fill",
        source: "fako",
        "source-layer": "buildings",
        // Buildings are what make Buea recognisable from above: there are no
        // street names to read, so the shape of the blocks is the landmark.
        paint: { "fill-color": m.block, "fill-opacity": 0.9 },
      },

      // Lanes under roads, so a junction reads as the bigger road continuing.
      {
        id: "lanes",
        type: "line",
        source: "fako",
        "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", MINOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": m.lane,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 15, 3, 18, 8],
        },
      },
      {
        id: "roads-casing",
        type: "line",
        source: "fako",
        "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", MAJOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": m.ridge,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.4, 15, 8, 18, 20],
        },
      },
      {
        id: "roads",
        type: "line",
        source: "fako",
        "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", MAJOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": m.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.4, 15, 6, 18, 16],
        },
      },
    ],
  };
}
