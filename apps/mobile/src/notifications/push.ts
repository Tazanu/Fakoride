/**
 * Push notifications: asking, registering, and letting go.
 *
 * The socket only reaches an open app. A driver waits with the phone in his
 * pocket and a rider puts hers away once the taxi is booked, so without this
 * the offer and the "your taxi is outside" both went nowhere. The server sends
 * the words (already in the reader's language — the phone draws a notification
 * before any of our translation runs); this file only gets the phone ready to
 * receive them.
 *
 * Three things can make registration impossible, and none of them is an error
 * worth showing anybody:
 *
 *   Expo Go on Android     cannot receive remote notifications since SDK 53.
 *                          It needs a real build (see eas.json).
 *   no EAS project id      getExpoPushTokenAsync needs one, and it only exists
 *                          once somebody has run `eas init` for the project.
 *   permission refused     her choice; the app still works over the socket.
 *
 * Each of those returns null quietly. The app works as it did before; it just
 * cannot wake a pocketed phone.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import * as Notifications from "expo-notifications";
import { pushToken } from "@/api/session";

/**
 * In the foreground the screen is already showing what the notification says —
 * the offer card, the trip moving — so a banner on top of it is noise. It still
 * goes into the notification list.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The server names these; they have to exist on the phone before anything
 * arrives on them. Offers are loud: a driver has twelve seconds.
 */
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("offers", {
    name: "Ride offers",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 150, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("trips", {
    name: "Your ride",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

function projectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

/** This phone's Expo push token, or null when it cannot have one. */
export async function devicePushToken(): Promise<string | null> {
  // Asked directly rather than left to fail: on Android the library throws the
  // moment Expo Go asks for a token, and on iOS it warns on every sign-in.
  if (isRunningInExpoGo()) return null;
  const id = projectId();
  if (!id) return null;

  try {
    await ensureChannels();
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return data;
  } catch {
    // A phone with no Google Play services lands here.
    return null;
  }
}

/** Tell the server where to reach this account. Safe to call on every sign-in. */
export async function registerForPush(): Promise<void> {
  const token = await devicePushToken();
  if (!token) return;
  await pushToken.register(token).catch(() => undefined);
}

/** On sign-out, before the session token goes: a signed-out phone gets nothing. */
export async function unregisterForPush(): Promise<void> {
  await pushToken.unregister().catch(() => undefined);
}
