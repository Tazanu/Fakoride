/**
 * The other person's face, while the two of you are looking for each other.
 *
 * A rider at a crowded junction and a taxi pulling in are two strangers trying
 * to find each other. The rider's account screen has always said "add a photo
 * so the driver can find you in a crowd", and the server has always been ready
 * to show it — to the other person only, only while the ride is live — but no
 * screen ever asked for it.
 *
 * For a rider this is the driver's face as ops checked it against his ID when
 * they approved him, not a picture he chose afterwards.
 */

import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { fetchPhotoDataUri } from "@/api/client";
import { palette, type } from "@/theme";

const c = palette("light");

/** The other person's photo for this trip, or null. Fetched once, while `live`. */
export function useTripFace(tripId: string | undefined, live: boolean): string | null {
  const [face, setFace] = useState<string | null>(null);
  useEffect(() => {
    if (!tripId || !live || face) return;
    let alive = true;
    void fetchPhotoDataUri(`/trips/${encodeURIComponent(tripId)}/photo`).then((uri) => {
      if (alive && uri) setFace(uri);
    });
    return () => {
      alive = false;
    };
  }, [tripId, live, face]);
  return face;
}

/** A round face, or the person's initials when there is no photo. */
export function Face({ uri, name, size = 58 }: { uri: string | null; name: string | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[styles.photo, box]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.initials, box]}>
      <Text style={styles.initialsText}>{initials(name)}</Text>
    </View>
  );
}

/** Two letters. "Epie Ndive" becomes EN. */
export function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const styles = StyleSheet.create({
  photo: { backgroundColor: c.fill },
  initials: { backgroundColor: c.action, alignItems: "center", justifyContent: "center" },
  initialsText: { ...type.heading, color: c.onAction },
});
