# Notes: Ferry 4.0 changes page

Deliverable: `outputs/index.html`. Built by `scratch/build.py` from `files/changes.md`, with the headline, date, link, support address and signer from `files/brief.md`.

## Choices made

- **Format:** the request names `outputs/index.html`, so no `output.md`. The page opens in a browser on its own, so no `preview.html`.
- **Launch-note rules applied to the page:** the headline is the first and only `<h1>`, word for word. Body text is 18px, the column is 640px wide, styles are in one `<style>` tag, and there is no script. Colours are only the three in the brief (#0B3D5C, #F4F1EA, #E2572B). The footer reads "Questions? Write to help@ferry.example".
- **120-word limit:** applied to the introduction only. The request asks for all 180 changes in full, which cannot fit in 120 words. The intro is about 60 words.
- **Numbers:** the only numbers in the prose are the release date (1 September 2027) from the brief. The change count (180) is not stated anywhere in the page, since the brief does not give it.
- **Codename:** "Falcon" from the brief's `Internal` line does not appear.
- **Banned words:** none of exciting, thrilled, delighted, proud or users appear.
- **Signer:** Mara Lindqvist is named under the intro. The launch-note email rule requires a signature, and the page has no other place for one.
- **Link:** the brief's link (https://ferry.example/4-0) appears once in the intro.
- **Features and Price:** the brief has no `Features`, `Price` or `Quote` line, so none are shown.
- **Change entries:** each has its number, title, `Area:` line and full description, in the order of changes.md. Titles such as "..., part 2" are kept as written.

## Things to check

- Every change description in changes.md is the same sentence, so the page repeats it 180 times. This is what the source says. If the team wants a shorter page, the descriptions need their own text.
- The brief has no `Features` line, so the launch-note rule to name each feature cannot be checked.
- The release date (1 September 2027) is in the future relative to today (20 November 2026). Check the date is intended.
- Colour contrast: the accent #E2572B is used only for rules between sections and for the footer border, never for text, because it is low-contrast on #F4F1EA.
