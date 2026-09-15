/**
 * The Fako gazetteer.
 *
 * This file is the asset no competitor flying in from Douala will build: the
 * places people in Buea actually name, and how high up the mountain each one is.
 *
 * ---------------------------------------------------------------------------
 * WARNING — these coordinates and elevations are DESK ESTIMATES.
 * They are close enough to develop against and not close enough to launch on.
 * Replace every one with a GPS point taken standing at the spot, during the
 * two weeks of field work, before a single rider installs the app.
 * ---------------------------------------------------------------------------
 */

export type ZoneSeed = {
  code: string;
  name: string;
  town: string;
  lat: number;
  lng: number;
  /** Metres above sea level. This is what turns a fare into a hill fare. */
  elevationM: number;
  landmarks: LandmarkSeed[];
};

export type LandmarkSeed = {
  name: string;
  aliases?: string[];
  lat: number;
  lng: number;
  isPickupPoint?: boolean;
};

/**
 * Launch corridor first: Mile 17 → Checkpoint → Molyko → Malingo → UB, then the
 * upslope zones that carry the hill rate, then the neighbours we will need next.
 */
export const ZONES: ZoneSeed[] = [
  {
    code: "MILE17",
    name: "Mile 17",
    town: "Buea",
    lat: 4.135,
    lng: 9.29,
    elevationM: 380,
    landmarks: [
      { name: "Mile 17 Motor Park", aliases: ["Motor Park", "Mile 17 Park"], lat: 4.135, lng: 9.29 },
      { name: "Mile 17 Roundabout", aliases: ["Mile 17 Junction"], lat: 4.1356, lng: 9.2893 },
    ],
  },
  {
    code: "BOMAKA",
    name: "Bomaka",
    town: "Buea",
    lat: 4.143,
    lng: 9.287,
    elevationM: 420,
    landmarks: [
      { name: "Faculty of Health Sciences", aliases: ["FHS", "Health Sciences"], lat: 4.1434, lng: 9.2868 },
      { name: "Bomaka Junction", lat: 4.1428, lng: 9.2876 },
    ],
  },
  {
    code: "CHECKPOINT",
    name: "Checkpoint",
    town: "Buea",
    lat: 4.1531,
    lng: 9.2764,
    elevationM: 470,
    landmarks: [
      { name: "Checkpoint", aliases: ["Check Point", "CP"], lat: 4.1531, lng: 9.2764 },
      { name: "Buea Road Checkpoint Market", aliases: ["Checkpoint Market"], lat: 4.1536, lng: 9.2758 },
    ],
  },
  {
    code: "MOLYKO",
    name: "Molyko",
    town: "Buea",
    lat: 4.1552,
    lng: 9.274,
    elevationM: 500,
    landmarks: [
      { name: "Molyko Stadium", aliases: ["Stadium"], lat: 4.1544, lng: 9.2751 },
      { name: "Bongo Square", aliases: ["Bonjo Square"], lat: 4.1558, lng: 9.2733 },
      { name: "Dirty South", lat: 4.1565, lng: 9.2748 },
    ],
  },
  {
    code: "MALINGO",
    name: "Malingo",
    town: "Buea",
    lat: 4.1569,
    lng: 9.2721,
    elevationM: 520,
    landmarks: [
      { name: "Malingo Junction", aliases: ["Malingo"], lat: 4.1569, lng: 9.2721 },
      { name: "Sandpit", lat: 4.1576, lng: 9.2714 },
    ],
  },
  {
    code: "UB",
    name: "University of Buea",
    town: "Buea",
    lat: 4.1592,
    lng: 9.2694,
    elevationM: 540,
    landmarks: [
      { name: "UB Main Gate", aliases: ["First Gate", "University Gate"], lat: 4.1592, lng: 9.2694 },
      { name: "UB Junction", aliases: ["Mile 16 Junction UB"], lat: 4.1585, lng: 9.2702 },
      { name: "UB Car Park", aliases: ["Library Car Park"], lat: 4.1601, lng: 9.2686, isPickupPoint: true },
    ],
  },
  {
    code: "GREAT_SOPPO",
    name: "Great Soppo",
    town: "Buea",
    lat: 4.1596,
    lng: 9.2493,
    elevationM: 700,
    landmarks: [
      { name: "Great Soppo Market", aliases: ["Soppo Market"], lat: 4.1596, lng: 9.2493 },
      { name: "Soppo Junction", lat: 4.1589, lng: 9.2505 },
    ],
  },
  {
    code: "BONDUMA",
    name: "Bonduma",
    town: "Buea",
    lat: 4.1655,
    lng: 9.256,
    elevationM: 660,
    landmarks: [{ name: "Bonduma Junction", lat: 4.1655, lng: 9.256 }],
  },
  {
    code: "FEDERAL_QUARTER",
    name: "Federal Quarter",
    town: "Buea",
    lat: 4.162,
    lng: 9.243,
    elevationM: 800,
    landmarks: [{ name: "Federal Quarter", aliases: ["Fed Quarters"], lat: 4.162, lng: 9.243 }],
  },
  {
    code: "BUEA_TOWN",
    name: "Buea Town",
    town: "Buea",
    lat: 4.16,
    lng: 9.232,
    elevationM: 870,
    landmarks: [
      { name: "Buea Town Market", lat: 4.16, lng: 9.232 },
      { name: "Chief's Palace", aliases: ["Palace"], lat: 4.1607, lng: 9.2312 },
    ],
  },
  {
    code: "BOKWAONGO",
    name: "Bokwaongo",
    town: "Buea",
    lat: 4.17,
    lng: 9.236,
    elevationM: 950,
    landmarks: [{ name: "Bokwaongo Junction", aliases: ["Upper Farms"], lat: 4.17, lng: 9.236 }],
  },
  {
    code: "MUEA",
    name: "Muea",
    town: "Buea",
    lat: 4.175,
    lng: 9.314,
    elevationM: 450,
    landmarks: [{ name: "Muea Market", lat: 4.175, lng: 9.314 }],
  },
  {
    code: "MILE16",
    name: "Mile 16 Bolifamba",
    town: "Buea",
    lat: 4.119,
    lng: 9.302,
    elevationM: 300,
    landmarks: [{ name: "Mile 16 Motor Park", aliases: ["Bolifamba Park"], lat: 4.119, lng: 9.302 }],
  },
  {
    code: "MUTENGENE",
    name: "Mutengene",
    town: "Mutengene",
    lat: 4.0925,
    lng: 9.3153,
    elevationM: 120,
    landmarks: [{ name: "Mutengene Junction", aliases: ["Mutengene Park"], lat: 4.0925, lng: 9.3153 }],
  },
];

/**
 * Fares people actually quote today, used to calibrate the seed formula and as
 * regression cases in the tests. Treat as hearsay until the corridor is walked.
 */
export const OBSERVED_FARES: { from: string; to: string; xaf: number }[] = [
  { from: "CHECKPOINT", to: "UB", xaf: 250 },
  { from: "CHECKPOINT", to: "MILE17", xaf: 300 },
  { from: "MOLYKO", to: "GREAT_SOPPO", xaf: 450 },
];
