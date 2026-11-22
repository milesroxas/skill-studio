# Notes: Ferry 4.0 changes page

Deliverable: `outputs/index.html`. Built by `scratch/build.py` from `files/changes.md` (run with `python3 -I`).

## What is in the page
- H1 is the brief's Headline, word for word: "Everything that changed in Ferry 4.0."
- Short intro (about 60 words): release date (1 September 2027), a note that every change is on from release with nothing to switch on, the Link, and the signer (Mara Lindqvist).
- All 180 changes from changes.md, in order. Each has its number, title, area and full description, copied verbatim from the file. Titles keep their ", part N" suffixes.
- Footer: "Questions? Write to help@ferry.example" with a mailto link.
- Checks run: one `<h1>`; no `<script>`; "Falcon" does not appear; the only colours used are #0B3D5C, #F4F1EA and #E2572B; `<style>` is inline; body text is 18px; content column is 640px max.

## Choices made where the brief or skill was unclear
1. **120-word limit.** The launch-note skill caps announcements at 120 words. The request asks for every change in full, so the 120 words applies only to the intro prose, not to the 180-entry list. The intro is about 60 words.
2. **Product name before the headline.** The skill says to open with the headline and also to start with the product name and version. The headline already contains "Ferry 4.0" in its first words and cannot be reworded, so the H1 stays first and the first sentence of the intro names "Ferry 4.0".
3. **No number of my own.** I did not state a total count of changes, because the brief does not give one. The page does not say "180" in prose. The numbers shown are the ones in changes.md.
4. **Colour use.** The skill allows only the brief's three colours, so there is no white, black or grey. #E2572B is used only for rules and borders, not text, because orange on the cream background is low contrast for reading text.
5. **Price and quote.** The brief has neither, so the page has no price and no customer quote.
6. **Preview file.** Not written. `index.html` is a static page and opens in a browser by itself.

## To check
- Whether the CMS keeps the `<style>` block. The skill says it is pasted into a CMS that strips scripts and outside files; if it strips styles too, the page loses its layout.
- Whether "Each change was asked for by people who run more than one location" should stay in the intro. It is accurate for every change, but it is repetitive.
- The release date is in the future (today is 20 November 2026). Confirm that 1 September 2027 is correct.
