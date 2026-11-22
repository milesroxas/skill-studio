# Notes: Ferry 3.2 launch page

Deliverable: `outputs/index.html`. Single file, styles in a `<style>` tag, no script, no outside files, so it survives a CMS that strips both.

## Choices made

- **Headline** is the brief's `Headline` word for word, as the only `<h1>`. The `<title>` also carries it with the product and version.
- **Version** "Ferry 3.2" appears in the opening line.
- **Price** given as "12 USD a month", with the currency code.
- **Release date** "4 March 2027" stated in the opening line. Not required by the skill's web-page rules, but it tells the reader which release is meant and comes from the brief.
- **Features** listed under the brief's own names: Automatic confirmations, Waitlist, Calendar sync. Descriptions are the brief's wording.
- **Quote** kept verbatim with the name and company from the brief. The quote is split across two `<p>` tags only for layout; the words are unchanged.
- **Button** "Book a demo" links to the brief's `Link`. The brief gives no separate CTA URL, so the release link is used.
- **Signature** "Mara Lindqvist" added as a sign-off line, from the brief's `Signed by`.
- **Footer** holds "Questions? Write to" and `help@ferry.example`, as the skill requires.
- **Colours** restricted to the three values in the brief: #0B3D5C (text, button, rule lines), #F4F1EA (page background, button text), #E2572B (accent rules). No other colours are used anywhere in the CSS.
- **Type** body text at 18px; content column at most 640px wide.
- **Word count** of visible text is roughly 90 words, under the 120-word limit.
- **Excluded**: the `Internal` line and the codename Falcon. The word "users" and the banned feeling words do not appear.
- **Fonts**: Georgia for body and Arial for the button, both system fonts, so no font files are needed.

## Checks for a human

- The brief gives no page subtitle or meta description, so none was written.
- Contrast: cream text on navy button is high contrast. The orange accent is decorative only (rules and quote border), not used for text.
- The "What is new in Ferry 3.2" subheading is my wording; the brief names no section title. Change it if the team has a standard.
- No preview file was written: the page is a standalone HTML file that opens in a browser by itself.
- Only the brief was used as a source. No network or outside files were read.
