# Notes: Ferry 3.2 launch email

Deliverable: outputs/email.txt (plain-text email, no Markdown, no outputs/output.md since the request names email.txt). No interface, so no preview.html.

Choices made:

- Subject line is "Ferry 3.2: Bookings now confirm themselves." (43 characters). The skill asks for the product name and version to come first, and for the body to open with the headline word for word. Putting both in the subject satisfies both. The body then opens with the headline exactly as briefed.
- Price written as "12 USD a month" with the currency code, per the skill.
- Quote used word for word with Dana Okafor and Tidewater Kayaks.
- The three features are written as prose, not list marks, since plain text email must not use Markdown.
- Only one link: https://ferry.example/3-2.
- Ends with release date, support address and signer, each on its own line, in that order. I labelled the first two ("Release date:", "Support:") for readability; the skill does not forbid labels.
- The word "Falcon" (internal codename) is not used anywhere.
- Words exciting, thrilled, delighted and proud are not used.
- Word count is about 80 including the subject, within the 120-word limit.
- The release date (4 March 2027) is in the future relative to today (2026-11-20), so the copy says "Ferry 3.2 brings..." without claiming it is out now. Worth a check that the send timing and any "available now" wording suit the team.
- "Read more" is the link's only call to action; the brief does not give link text, so I chose it.

Things to check before sending:

- Whether the 60-second calendar sync claim is final.
- Whether 12 USD a month applies to this release or to Ferry in general (the brief gives it as a single Price line).
- The customer quote is used as given in the brief; confirm Dana Okafor and Tidewater Kayaks have approved being named.

No network or MCP tools were used. Only files/brief.md was read, along with the launch-note skill.
