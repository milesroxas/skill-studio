# Notes: Ferry 3.2 launch page

Deliverable: `outputs/index.html` (a single page, styles inline, no script, no outside files). No preview.html: a plain HTML page opens in a browser by itself.

## Choices

- **Headline vs. product name rule.** The skill says to open with the Headline word for word and also to start with the product name and version before anything else. I used both: the `<title>` reads "Ferry 3.2: Bookings now confirm themselves.", a small visible kicker reads "Ferry 3.2" as the first text on the page, and the single `<h1>` holds only the headline, unchanged.
- **Word count.** Visible text is roughly 80 words, under the 120-word limit.
- **Price.** Shown as "12 USD a month", with the currency code.
- **Numbers.** Only numbers from the brief appear: 3.2, 4 March 2027, 12 USD, 60 seconds. No figures were added.
- **Quote.** Used word for word with the brief's attribution: "Ferry cut our booking calls in half." Dana Okafor, Tidewater Kayaks.
- **Features.** The three features from the brief, with their wording unchanged.
- **Button and link.** The "Book a demo" button links to the brief's `Link` (https://ferry.example/3-2). The brief gives no separate demo URL, so I reused the release link. Check this.
- **Sign-off.** "Mara Lindqvist" appears below the button. The brief gives no title, so none is shown.
- **Footer.** Reads "Questions? Write to help@ferry.example", with a mailto link.
- **Colours.** Only #0B3D5C, #F4F1EA and #E2572B are used. The button uses dark blue text on cream, with the orange accent on rules and the kicker. Orange text on cream (the kicker) has low contrast, roughly 2.5:1 for the small kicker text. Consider a darker treatment if accessibility matters.
- **Type and width.** Body text is 18px, and the content column is capped at 640px, per the skill. Fonts are system serif and sans-serif stacks, with no web fonts.
- **Banned words.** None of exciting, thrilled, delighted or proud appear.
- **Codename.** "Falcon" does not appear anywhere in the page.

## Checks for the team

- Confirm the demo button should go to the release link.
- Confirm the sign-off needs no job title.
- Confirm the orange kicker contrast is acceptable.
- The release date is 4 March 2027, which is after today's date (2026-11-20). The page is written as an upcoming release.
