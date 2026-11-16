/**
 * Staying findable while he is online.
 *
 * Dispatch offers a ride to the nearest driver, and "nearest" is measured from
 * the last position each phone sent. The app used to send one: at the moment he
 * switched online. A driver who went online at Mile 17 and drove to Buea Town
 * was, as far as dispatch knew, still at Mile 17 — offered rides there he could
 * not reach, and never the ones beside him.
 *
 * So while he is online his phone reports where it is every half minute, and
 * keeps doing so with the screen off and the phone in his pocket, which is
 * where it is for most of a shift.
 *
 * On Android that is a foreground service: a small permanent notification
 * saying he is online, and location updates for as long as it is up. It is the
 * honest way to do this — he can see it running and switch it off — and because
 * he starts it himself by going online, it needs only the ordinary "while using
 * the app" permission, not "allow all the time".
 *
 * Where the service cannot start — Expo Go, iOS, a phone that refuses it — the
 * same pings are sent by a timer for as long as the app is on screen. Less, but
 * never nothing.
 *
 * The server expects these: a driver it has not heard from for five minutes is
 * no longer offered rides and is taken offline (see the API's watchdog).
 *
 * This file is imported by the root layout for its side effect. The task has
 * to be defined before Android can deliver a location to it, including when it
 * wakes the app's JavaScript with no screen mounted at all.
 */

import { AppState } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { ApiError } from "@/api/client";
import { shift } from "@/api/driver";
import { findMe } from "@/ui/position";

const TASK = "fako-ride-driver-location";

/** How often he reports. The server allows five minutes of silence, so ten can be lost. */
const PING_EVERY_MS = 30_000;

/** Android may deliver faster than asked. Nothing is gained by forwarding all of them. */
const NO_SOONER_THAN_MS = 15_000;

let lastSentAt = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

/**
 * Send one position, and stop everything if the server says he is not online.
 *
 * That answer is how a service running with no screen learns what the app would
 * have known: the watchdog took him offline, ops suspended him, he signed out
 * on another phone. Without it the notification would go on saying "online"
 * over a driver nobody can book.
 *
 * A dropped request is not that. No signal on the Soppo climb is the normal
 * case, and the next ping is thirty seconds away.
 */
async function report(lat: number, lng: number): Promise<void> {
  const now = Date.now();
  if (now - lastSentAt < NO_SOONER_THAN_MS) return;
  lastSentAt = now;

  try {
    const { online } = await shift.pushPosition(lat, lng);
    if (online === false) await stopPresence();
  } catch (err) {
    if (err instanceof ApiError && !err.offline && (err.status === 401 || err.status === 403)) {
      await stopPresence();
    }
  }
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) return;
  const locations = data?.locations ?? [];
  const latest = locations[locations.length - 1];
  if (!latest) return;
  await report(latest.coords.latitude, latest.coords.longitude);
});

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    // A backgrounded app's timers are paused or throttled by the OS anyway;
    // this only says so out loud.
    if (AppState.currentState !== "active") return;
    void findMe().then((fix) => (fix ? report(fix.lat, fix.lng) : undefined));
  }, PING_EVERY_MS);
}

function stopHeartbeat(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

/**
 * Start reporting. Call it with the app on screen — Android will not let a
 * foreground service start from the background — and with location permission
 * already granted.
 *
 * `notice` is the text of the permanent notification, passed in because this
 * module has no language of its own.
 *
 * Never throws. Going online must not fail because a notification could not be
 * shown; the timer covers for the service.
 */
export async function startPresence(notice: { title: string; body: string }): Promise<void> {
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
      await Location.startLocationUpdatesAsync(TASK, {
        // GPS, not cell towers: this is the dot a rider watches come towards her.
        accuracy: Location.Accuracy.High,
        timeInterval: PING_EVERY_MS,
        // Zero, so a taxi parked at a junction still reports. A driver waiting
        // for work is not moving, and he is exactly who must stay findable.
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: notice.title,
          notificationBody: notice.body,
          notificationColor: "#0F5F58",
          // If Android kills the app for memory the service carries on. It
          // stops when he goes offline, or when the server says he already is.
          killServiceOnDestroy: false,
        },
      });
    }
    stopHeartbeat();
  } catch {
    startHeartbeat();
  }
}

/** Stop reporting, by whichever means it was running. Never throws. */
export async function stopPresence(): Promise<void> {
  stopHeartbeat();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  } catch {
    // Not running, or this build has no task manager (Expo Go, web).
  }
}
