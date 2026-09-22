/**
 * Finding her, fast enough to be useful.
 *
 * `getCurrentPositionAsync` waits for a fresh satellite fix, and indoors — a
 * bar on the Molyko strip, the UB library, anywhere with a roof — that wait can
 * run past a minute or never resolve at all. The screen sits on a spinner and
 * she puts the phone away.
 *
 * So: take the fix the phone already has, and only go looking for a new one if
 * there isn't one or it is stale. A position from two minutes ago is wrong by a
 * couple of hundred metres at worst, which lands in the same zone, and the zone
 * is all the fare depends on. Being approximately right immediately beats being
 * exactly right after she has given up.
 */

import * as Location from "expo-location";

export type Fix = { lat: number; lng: number };

/** Older than this and it is worth waiting for a new one. */
const STALE_AFTER_MS = 2 * 60_000;

/** Long enough for a cold GPS lock outdoors, short enough not to feel broken. */
const FRESH_TIMEOUT_MS = 12_000;

const toFix = (p: Location.LocationObject): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
});

/**
 * A usable position, or null if the phone genuinely cannot say.
 *
 * Caller has already asked for permission — this does not, because the place to
 * ask is the moment the screen needs it and that is not here.
 */
export async function findMe(): Promise<Fix | null> {
  try {
    const known = await Location.getLastKnownPositionAsync({ maxAge: STALE_AFTER_MS });
    if (known) return toFix(known);
  } catch {
    // No cached fix. Normal on a phone that has just booted.
  }

  try {
    // Races the lock against a deadline: without this the promise can outlive
    // the screen that is waiting on it.
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_TIMEOUT_MS)),
    ]);
    if (fresh) return toFix(fresh);
  } catch {
    // Location off at the OS level, or the fix failed outright.
  }

  // One last try with anything at all, however rough. A cell-tower fix is
  // several hundred metres out and still usually names the right zone.
  try {
    const rough = await Location.getLastKnownPositionAsync({});
    if (rough) return toFix(rough);
  } catch {
    // Nothing to be had.
  }

  return null;
}
