/**
 * Where the session token is kept.
 *
 * On a phone that is the device keystore, which is the only acceptable home for
 * a thirty-day credential.
 *
 * On web it is localStorage, and that is **not** equivalent — localStorage is
 * readable by any script on the origin and survives in a shared browser. The
 * web target exists so the team can look at screens quickly during development;
 * it is not a build anybody signs into with a real account, and it is not
 * something to ship. If web ever becomes a real target, this needs an
 * httpOnly cookie and a server session, not a bigger comment.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const webStore = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // Private windows and blocked site data both throw rather than return null.
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Nothing to do. The session lives for this tab only.
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // As above.
    }
  },
};

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === "web") return webStore.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    webStore.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === "web") {
    webStore.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
