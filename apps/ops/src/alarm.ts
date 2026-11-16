/**
 * Making an alarm impossible to sit next to and not notice.
 *
 * Somebody pressing Get help put a number on a badge in the rail. An operator
 * reading the fare table, or in another tab, or looking at their phone, saw
 * nothing and heard nothing. The API now texts the operators as well, and that
 * is what reaches a pocket; this is for the person who is at the desk and
 * simply looking elsewhere.
 *
 * Three signals, because each fails differently:
 *
 *   a sound          works with the tab in the background; fails if the laptop
 *                    is muted
 *   the tab title    visible in a row of tabs; fails if the browser is hidden
 *   a notification   reaches a hidden browser; fails until permission is given
 *
 * All of it repeats for as long as an alarm sits un-acknowledged, and stops the
 * moment somebody presses Acknowledge. An alarm that rings once and gives up is
 * a number on a badge again.
 */

const TITLE = "Fako Ride — Ops";

let audio: AudioContext | null = null;

/**
 * Browsers refuse sound and notification prompts until the person has clicked
 * something. Called from the first click in the console, so both are ready
 * long before they are needed.
 */
export function armAlarm(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No Web Audio here. The title and the notification still work.
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    // Notifications blocked by policy. Nothing to ask.
  }
}

/** Three sharp tones. Deliberately unpleasant: this is not a chat message. */
function beep(): void {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime;
  for (let i = 0; i < 3; i += 1) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "square";
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.35 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.35 + 0.25);
    tone.connect(gain).connect(audio.destination);
    tone.start(start + i * 0.35);
    tone.stop(start + i * 0.35 + 0.27);
  }
}

/**
 * Tell the alarm how many alerts nobody has acknowledged yet. Call it on every
 * poll: it sounds while that number is above zero and goes quiet at zero.
 *
 * `fresh` is true when the number has gone up since the last poll, which is the
 * only time a desktop notification is raised — one per alarm, not one every
 * twenty seconds.
 */
export function soundAlarm(unanswered: number, fresh: boolean, detail?: string): void {
  if (unanswered <= 0) {
    document.title = TITLE;
    return;
  }

  document.title = `(${unanswered}) SOS — ${TITLE}`;
  beep();

  if (!fresh) return;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const note = new Notification("SOS — somebody pressed Get help", {
        body: detail ?? "Open the Safety screen now.",
        tag: "fako-sos",
        requireInteraction: true,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    }
  } catch {
    // The sound and the title have already gone off.
  }
}
