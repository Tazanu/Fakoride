/**
 * The service banner.
 *
 * "Taxis running normally in Buea today", or the day that is not true: a road
 * closed at Mile 17, rain on the Soppo climb, a strike. Ops writes it from the
 * console; both home screens show it.
 *
 * The endpoint has existed since the beginning, and its own comment says this
 * is the banner both apps show at the top of the home screen. Neither did. A
 * rider standing in the rain wondering why no taxi is coming was the cost.
 *
 * Three severities, three weights:
 *
 *   INFO               quiet, teal — a fact worth knowing
 *   WARNING            amber — something will be slower or dearer than usual
 *   SERVICE_SUSPENDED  red — do not stand at the junction waiting
 *
 * French where we have it. The rest of this app is strict that a server's
 * English sentence must never reach a rider, and a banner is no exception —
 * if ops wrote no French, we show nothing rather than English to a French
 * speaker who cannot read it.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { geo } from "@/api/rider";
import { useLang } from "@/ui/i18n";
import { Appear } from "@/ui/motion";
import { palette, radius, space, type } from "@/theme";

const c = palette("light");

type Notice = {
  message: string;
  messageFr: string | null;
  severity: string;
  zone: string | null;
};

export function ServiceNotice() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const french = useLang() === "fr";

  useEffect(() => {
    let alive = true;
    void geo
      .notices()
      .then((r) => alive && setNotices(r.notices))
      // A banner that cannot load is not worth an error. The screen underneath
      // is the thing she came for.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const shown = notices
    .map((n) => ({ ...n, text: french ? n.messageFr : n.message }))
    .filter((n): n is Notice & { text: string } => Boolean(n.text));

  if (shown.length === 0) return null;

  return (
    <View style={styles.stack}>
      {shown.map((n, i) => (
        <Appear key={`${n.severity}-${i}`} index={i}>
          <View style={[styles.notice, toneFor(n.severity)]}>
            <View style={[styles.bar, barFor(n.severity)]} />
            <Text style={[styles.text, textFor(n.severity)]}>{n.text}</Text>
          </View>
        </Appear>
      ))}
    </View>
  );
}

function toneFor(severity: string) {
  if (severity === "SERVICE_SUSPENDED") return styles.stopped;
  if (severity === "WARNING") return styles.warning;
  return styles.info;
}

function barFor(severity: string) {
  if (severity === "SERVICE_SUSPENDED") return styles.barStopped;
  if (severity === "WARNING") return styles.barWarning;
  return styles.barInfo;
}

function textFor(severity: string) {
  if (severity === "SERVICE_SUSPENDED") return styles.textStopped;
  if (severity === "WARNING") return styles.textWarning;
  return styles.textInfo;
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    paddingRight: space.md,
    overflow: "hidden",
  },
  bar: { width: 4, alignSelf: "stretch" },
  text: { ...type.secondary, lineHeight: 20, flex: 1, paddingVertical: space.sm },

  info: { backgroundColor: c.actionTint },
  barInfo: { backgroundColor: c.action },
  textInfo: { color: c.actionText },

  warning: { backgroundColor: c.amberTint },
  barWarning: { backgroundColor: c.amber },
  textWarning: { color: c.hill },

  stopped: { backgroundColor: c.card, borderWidth: 1, borderColor: c.dangerEdge },
  barStopped: { backgroundColor: c.danger },
  textStopped: { color: c.danger, fontWeight: "600" },
});
