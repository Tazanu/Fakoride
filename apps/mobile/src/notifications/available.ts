/**
 * expo-notifications, or null where loading it would crash the app.
 *
 * Expo Go on Android dropped remote notifications in SDK 53, and from SDK 57
 * the library throws as soon as it is imported there — not when a token is
 * asked for. Every screen that reached push.ts took the error with it, and the
 * app never got past a red screen. Testing in Expo Go is how anybody tries the
 * app on a real handset before a build exists, so it has to open there.
 *
 * Loaded with require() rather than import, because an import is evaluated
 * before any line of this file can decide not to. The web build has nothing to
 * show either: notifications there are a different API we do not use.
 */

import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";

type NotificationsModule = typeof import("expo-notifications");

const unavailable = Platform.OS === "web" || (Platform.OS === "android" && isRunningInExpoGo());

export const Notifications: NotificationsModule | null = unavailable
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("expo-notifications") as NotificationsModule);
