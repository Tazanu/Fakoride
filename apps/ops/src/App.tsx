/**
 * The console.
 *
 * Signed out, it is the sign-in card and nothing else. Signed in, it is the
 * rail and one section.
 *
 * The rail carries three counts, and they are loaded whichever section is
 * open, because the reason to look at this console is usually somewhere you
 * are not currently looking: an alarm raised while you were reading the fare
 * table is the case the whole thing exists for.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { armAlarm, soundAlarm } from "@/alarm";
import { clearToken, getToken, ops } from "@/api";
import { Approvals } from "@/screens/Approvals";
import { Complaints } from "@/screens/Complaints";
import { Drivers } from "@/screens/Drivers";
import { Fares } from "@/screens/Fares";
import { Notices } from "@/screens/Notices";
import { Money } from "@/screens/Money";
import { Safety } from "@/screens/Safety";
import { SignIn } from "@/screens/SignIn";
import { Trips } from "@/screens/Trips";
import { Shell, type Section } from "@/ui/Shell";

/**
 * How often the rail's counts are refreshed while you are on another screen.
 * Ten seconds, not twenty: one of those counts is the alarm, and it also drives
 * the sound.
 */
const WATCH_MS = 10_000;

export function App() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [section, setSection] = useState<Section>("approvals");

  const [waiting, setWaiting] = useState(0);
  const [alarms, setAlarms] = useState(0);
  const [open, setOpen] = useState(0);

  const onWaiting = useCallback((n: number) => setWaiting(n), []);
  const onAlarms = useCallback((n: number) => setAlarms(n), []);
  const onOpen = useCallback((n: number) => setOpen(n), []);
  /** How many alarms were un-acknowledged at the last poll, to spot a new one. */
  const unanswered = useRef(0);

  /**
   * The counts, polled for the whole console rather than by each screen.
   *
   * A screen only knows its own number while it is mounted, so without this
   * the badges would go stale the moment you navigated away — which is exactly
   * when they matter.
   */
  useEffect(() => {
    if (!signedIn) return;

    let alive = true;
    const tick = () => {
      void ops
        .sos()
        .then((r) => {
          if (!alive) return;
          setAlarms(r.open);
          // Ring for the ones nobody has acknowledged — see alarm.ts.
          const waiting = r.alerts.filter((a) => a.status === "RAISED");
          const newest = waiting[0];
          soundAlarm(
            waiting.length,
            waiting.length > unanswered.current,
            newest ? `${newest.raisedByName ?? newest.raisedByPhone} · ${newest.route}` : undefined,
          );
          unanswered.current = waiting.length;
        })
        .catch(() => undefined);
      void ops
        .drivers("PENDING_REVIEW")
        .then((r) => alive && setWaiting(r.waiting))
        .catch(() => undefined);
      void ops
        .complaints("OPEN")
        .then((r) => alive && setOpen(r.complaints.length))
        .catch(() => undefined);
    };

    tick();
    const timer = setInterval(tick, WATCH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      soundAlarm(0, false);
    };
  }, [signedIn]);

  // Sound and notifications need one click first; any click in the console will do.
  useEffect(() => {
    if (!signedIn) return;
    window.addEventListener("pointerdown", armAlarm, { once: true });
    return () => window.removeEventListener("pointerdown", armAlarm);
  }, [signedIn]);

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;

  return (
    <Shell
      section={section}
      onSection={setSection}
      counts={{
        approvals: { value: waiting, urgent: true },
        safety: { value: alarms, urgent: true },
        complaints: { value: open },
      }}
      onSignOut={() => {
        clearToken();
        setSignedIn(false);
      }}
    >
      {section === "approvals" ? <Approvals onCount={onWaiting} /> : null}
      {section === "safety" ? <Safety onCount={onAlarms} /> : null}
      {section === "trips" ? <Trips /> : null}
      {section === "complaints" ? <Complaints onCount={onOpen} /> : null}
      {section === "fares" ? <Fares /> : null}
      {section === "drivers" ? <Drivers /> : null}
      {section === "money" ? <Money /> : null}
      {section === "notices" ? <Notices /> : null}
    </Shell>
  );
}
