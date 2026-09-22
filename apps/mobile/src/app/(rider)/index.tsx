/**
 * Where are you going?
 *
 * The whole app is this one question, and the design answers it map-first: she
 * sees where she is standing before she is asked anything. The sheet is pulled
 * up over the map so the two read as one surface rather than as a page that
 * happens to start with a picture.
 *
 * Everything below the question exists to make answering it one tap:
 *
 *   the places she always goes, priced, straight from her own history
 *   every other zone underneath, for a trip she has not taken before
 *
 * The fare sits on the row before she commits to anything. That is the product:
 * a fixed price she can see standing at the junction, rather than a number
 * argued about on arrival.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { ClockIcon, CrosshairIcon, HouseIcon, ListIcon, MagnifyingGlassIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { demand, geo, trips, type Repeat, type Resolved, type Zone } from "@/api/rider";
import { findMe, type Fix } from "@/ui/position";
import { Appear } from "@/ui/motion";
import { MapButton, MapPanel, MapPill, Sheet } from "@/ui/map";
import { ServiceNotice } from "@/ui/notice";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

/** The canvas gives the map roughly 55% of a 844pt screen. */
const MAP_HEIGHT = 470;

/**
 * Where the other taxis sit on the drawing.
 *
 * Fixed positions, deliberately. The API gives a count and never coordinates —
 * showing a rider exactly where each car is parked is a safety problem — so
 * these are decoration that stands for "some, nearby", and the honest number
 * is the one written in the pill.
 */
const PIN_SPOTS = [
  { x: 0.25, y: 0.44 },
  { x: 0.8, y: 0.4 },
  { x: 0.69, y: 0.7 },
  { x: 0.16, y: 0.72 },
];

export default function Book() {
  const router = useRouter();
  // Signing out moved to the account screen; nothing here needs the session.
  const insets = useSafeAreaInsets();

  const [fix, setFix] = useState<Fix | null>(null);
  const [here, setHere] = useState<Resolved | null>(null);
  const [repeats, setRepeats] = useState<Repeat[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [nearby, setNearby] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Find her, then find out what that place is called.
   *
   * Asked at the moment it is needed rather than at startup, where a
   * permission sheet before she has seen the app reads as a demand.
   */
  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("We need your location to know where to send the taxi.");
        return;
      }
      const next = await findMe();
      if (!next) {
        setError("We could not find you. Check that location is on, then pull down.");
        return;
      }
      setFix(next);

      // Three independent answers. One failing must not blank the other two —
      // she can still book without knowing how many taxis are around.
      const [place, repeat, count] = await Promise.allSettled([
        geo.resolve(next.lat, next.lng),
        trips.repeats(next.lat, next.lng),
        demand.nearby(next.lat, next.lng),
      ]);
      if (place.status === "fulfilled") setHere(place.value);
      if (repeat.status === "fulfilled") setRepeats(repeat.value.repeats);
      if (count.status === "fulfilled") setNearby(count.value.driversNearby);
      if (place.status === "rejected") {
        setError(
          place.reason instanceof ApiError && place.reason.offline
            ? "No network. Pull down to try again."
            : "We could not work out where you are.",
        );
      }
    } catch {
      setError("We could not find you. Pull down to try again.");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  // The full list never changes during a session and is not worth re-fetching.
  useEffect(() => {
    void geo
      .zones()
      .then((r) => setZones(r.zones))
      .catch(() => undefined);
  }, []);

  // Coming back from a finished trip should not show a stale taxi count.
  useFocusEffect(
    useCallback(() => {
      if (fix) void demand.nearby(fix.lat, fix.lng).then((r) => setNearby(r.driversNearby)).catch(() => undefined);
    }, [fix]),
  );

  function choose(zoneCode: string, label: string) {
    if (!fix) return;
    // The pickup name travels with the tap. The quote answers in zone codes,
    // and "MILE16" is not what she calls the place she is standing in.
    router.push({
      pathname: "/(rider)/confirm",
      params: {
        toZone: zoneCode,
        toName: label,
        fromName: here?.label ?? "",
        lat: String(fix.lat),
        lng: String(fix.lng),
      },
    });
  }

  const q = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(q);

  /** Her own places first, then everywhere else — both narrowed by the search. */
  const shownRepeats = repeats.filter((r) => !q || matches(r.label) || matches(r.name));
  const shown = zones.filter(
    (z) =>
      z.code !== here?.zone.code &&
      !repeats.some((r) => r.zone === z.code) &&
      (!q || matches(z.name) || matches(z.town)),
  );
  const nothingMatched = q.length > 0 && shownRepeats.length === 0 && shown.length === 0;
  const pins = nearby === null ? [] : PIN_SPOTS.slice(0, Math.min(nearby, PIN_SPOTS.length));

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await locate();
            setRefreshing(false);
          }}
          tintColor={c.action}
          progressViewOffset={insets.top}
        />
      }
    >
      <MapPanel height={MAP_HEIGHT} pins={pins}>
        <View style={[styles.mapTop, { top: insets.top + space.sm }]}>
          {/*
            This used to sign her out in one tap, from a button that looked
            like a menu. Now it opens the account, where signing out is a
            deliberate act rather than a mis-tap on the way to booking.
          */}
          <Pressable
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Your account"
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <MapButton>
              <ListIcon size={22} color={c.ink} />
            </MapButton>
          </Pressable>

          {nearby !== null ? (
            <MapPill>
              <View style={[styles.liveDot, nearby === 0 && styles.liveDotOff]} />
              <Text style={styles.pillText}>
                {nearby === 0 ? "No taxis near you" : `${nearby} ${nearby === 1 ? "taxi" : "taxis"} near you`}
              </Text>
            </MapPill>
          ) : null}
        </View>

        <Pressable
          onPress={() => void locate()}
          accessibilityRole="button"
          accessibilityLabel="Centre on my location"
          style={({ pressed }) => [styles.recentre, pressed && styles.pressed]}
        >
          <MapButton>
            <CrosshairIcon size={22} color={c.action} />
          </MapButton>
        </Pressable>
      </MapPanel>

      <Sheet>
        <ServiceNotice />
        <Text style={styles.question}>Where are you going?</Text>

        {/*
          A real filter, not a dead control.
          
          There is no place-search endpoint, but all fourteen zones are already
          on the device — so this narrows what is below rather than pretending
          to call a server. It is the design's primary affordance and it works.
        */}
        <View style={[styles.search, query ? styles.searchOn : null]}>
          <MagnifyingGlassIcon size={20} color={query ? c.actionText : c.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a place"
            placeholderTextColor={c.muted}
            accessibilityLabel="Search for a place"
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.list}>
          {shownRepeats.map((r, i) => (
            <Appear key={r.zone} index={i}>
              <Pressable
                onPress={() => choose(r.zone, r.label)}
                disabled={!fix}
                accessibilityRole="button"
                accessibilityLabel={`${r.label}, ${r.priceXaf} francs`}
                style={({ pressed }) => [styles.row, i > 0 && styles.rowRuled, pressed && styles.rowPressed]}
              >
                {/* First repeat is the one she uses most — the teal tile. */}
                <View style={[styles.tile, i === 0 ? styles.tileHome : styles.tileRecent]}>
                  {i === 0 ? (
                    <HouseIcon size={20} color={c.actionText} />
                  ) : (
                    <ClockIcon size={20} color={c.hill} />
                  )}
                </View>
                <View style={styles.grow}>
                  <Text style={styles.rowPlace} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text style={styles.rowSub}>
                    {r.tripCount} {r.tripCount === 1 ? "time" : "times"}
                    {r.hillFare ? " · up the hill" : ""}
                  </Text>
                </View>
                <Text style={styles.rowFare}>{xaf(r.priceXaf)}</Text>
              </Pressable>
            </Appear>
          ))}

          {shown.map((z, i) => {
            const ruled = i > 0 || shownRepeats.length > 0;
            return (
              <Appear key={z.code} index={shownRepeats.length + i}>
                <Pressable
                  onPress={() => choose(z.code, z.name)}
                  disabled={!fix}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${z.name}`}
                  style={({ pressed }) => [styles.row, ruled && styles.rowRuled, pressed && styles.rowPressed]}
                >
                  <View style={[styles.tile, styles.tilePlain]}>
                    <ClockIcon size={20} color={c.muted} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.rowPlace} numberOfLines={1}>
                      {z.name}
                    </Text>
                    {/* Mutengene is its own town, so its subtitle would just
                        repeat its name. A line that says nothing is worse
                        than no line. */}
                    {z.town.trim().toLowerCase() !== z.name.trim().toLowerCase() ? (
                      <Text style={styles.rowSub}>{z.town}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </Appear>
            );
          })}
          {nothingMatched ? (
            <Text style={styles.empty}>No place here matches &ldquo;{query.trim()}&rdquo;.</Text>
          ) : null}
        </View>

        {/*
          The way in to driving.

          One app serves both sides, so this is the only place a taxi man finds
          out the app wants him too. It sits under the places rather than over
          them — somebody who opened the app is going somewhere, and the offer
          to come and work can wait until they have stopped typing.
        */}
        {q.length === 0 ? (
          <Pressable
            onPress={() => router.push("/apply")}
            accessibilityRole="button"
            style={styles.drive}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.driveTitle}>Drive with Fako Ride</Text>
              <Text style={styles.driveLine}>
                Own a taxi? Carry riders and keep every franc of the fare.
              </Text>
            </View>
          </Pressable>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },

  drive: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
    minHeight: touch.min,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: c.actionTint,
    borderWidth: 1,
    borderColor: c.actionTintEdge,
  },
  driveTitle: { ...type.bodyStrong, color: c.actionText },
  driveLine: { ...type.secondary, marginTop: 2, color: c.inkSoft },

  grow: { flexGrow: 1, flexShrink: 1 },
  pressed: { opacity: 0.7 },

  mapTop: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.actionBright },
  liveDotOff: { backgroundColor: c.lineStrong },
  pillText: { ...type.secondaryStrong, color: c.ink },

  recentre: { position: "absolute", right: space.lg, bottom: space.xl + space.lg },

  question: { ...type.titleSmall, color: c.ink, marginBottom: space.md },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
  },
  searchOn: { borderColor: c.actionBright },
  searchInput: { ...type.body, color: c.ink, flexGrow: 1, flexShrink: 1, paddingVertical: 0 },
  empty: { ...type.bodyPlain, color: c.muted, paddingVertical: space.lg },

  error: { ...type.secondary, color: c.danger, marginTop: space.sm },

  list: { marginTop: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min + space.md,
    paddingVertical: space.md,
  },
  /* A hairline between rows, not a border around each. The list is one thing. */
  rowRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  rowPressed: { opacity: 0.6 },

  /* The tinted rounded square that leads every row — the canvas's signature. */
  tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  tileHome: { backgroundColor: c.actionTint },
  tileRecent: { backgroundColor: c.amberTint },
  tilePlain: { backgroundColor: c.fill },

  rowPlace: { ...type.bodyStrong, color: c.ink },
  rowSub: { ...type.secondary, color: c.muted },
  rowFare: { ...type.fareSmall, color: c.ink, fontVariant: ["tabular-nums"] },
});
