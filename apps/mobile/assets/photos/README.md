# Photographs

Nothing here yet. This is the brief for the ones to take.

## Why shoot rather than buy

Stock photography of "an African city" is the visual equivalent of a fare
estimate: generic, and wrong in ways the people who live there will notice
immediately. A rider in Molyko recognising the junction in the picture is worth
more than any amount of polish, and it costs a walk and a phone.

## What to take

In priority order. One good frame beats five adequate ones.

1. **`buea-welcome.jpg`** — the welcome screen. Mount Cameroon behind the town,
   late afternoon, taken from somewhere high on the Molyko or Bonduma side.
   Portrait. The top half wants to be sky or mountain with nothing busy in it,
   because the wordmark and tagline sit over that half.
2. **`mile-17.jpg`** — the motor park in use. Taxis, movement, ordinary day.
3. **`checkpoint.jpg`** — the junction at dusk, lights on.

## The constraints that matter here

- **Portrait, about 1200 × 1600 px.** The hero is roughly 390 × 500pt, so that
  covers a 3× screen with a little room to crop.
- **Under 150 KB each, JPEG, quality ~75.** This is the real limit. Data is
  bought by the megabyte in Fako and the app has been kept small on purpose
  everywhere else; a 2 MB hero photograph would undo that in one file.
- **No recognisable faces, and no readable number plates.** Not a style
  preference — those are other people's likeness and other people's vehicles,
  and neither has agreed to appear in the app. Shoot wide, from behind, or at a
  distance where nobody is identifiable.
- **Leave headroom.** Text sits over the top of the welcome image.

## Dropping them in

Put the files in this folder with the names above and say so. They are not
wired to anything yet — the welcome screen currently uses the drawn mountain in
`src/ui/mountain.tsx`, which needs no download at all. Wiring a photograph in
means adding `expo-image` for caching and a placeholder, so that a slow
connection shows the teal field rather than a white rectangle. That is a small
change and it is better made once the real picture exists than guessed at now.
