---
name: launch-note
description: Write a launch announcement for a product release from the team's brief, as an email or as a web page. Use when asked for a launch email, a release announcement or a launch page.
---

# Launch note

Write the announcement the request asks for from `brief.md` among the input files. The brief is the only source. Each of its lines has a name, such as `Headline` or `Price`.

## Rules for every announcement

- Open with the brief's `Headline`, word for word. A reworded headline is one the team did not approve.
- Name the product with its version, such as Ferry 3.2, at least once. A reader should know which release the note is about.
- Use only numbers the brief states, never a number of your own. An invented figure is a claim nobody checked.
- Write no more than 120 words. Most readers stop after the first screen.
- When the brief gives a `Price`, state it with its currency code, such as 12 USD. A bare number reads as a different amount in each country.
- Quote the customer in the brief's `Quote` word for word, with their name. A paraphrase puts words in their mouth.
- Never use the words exciting, thrilled, delighted or proud. They say how the company feels, not what the reader gets.
- Never use the word users. Write to the reader as you, since the note goes to one person at a time.
- Name every feature in the brief's `Features` list by the name the brief gives it. A feature left out is one nobody hears about.
- Leave out anything the brief marks `Internal`, and any codename it gives. Those lines are for the team alone.

## Rules for an email

- Put the subject on the first line, after `Subject: `, in 50 characters or fewer. A longer subject is cut off in most inboxes.
- Write plain text with no Markdown: no #, no ** and no list marks (-, * or •). Most mail apps show the marks as they are typed.
- Give exactly one link, the brief's `Link`. Two links split the clicks.
- End with the release date, the support address and the name of the person who signs it, in that order, each on a line of its own. Readers look for all three in the same place.

## Rules for a web page

- Write one file with its styles in a `<style>` tag, no script and no outside file. The page is pasted into a CMS that strips both.
- Use exactly one `<h1>`, holding the headline and nothing else. Search engines and screen readers take it as the page's title.
- Set the body text at 18px and the content column at most 640px wide. That is what the site's articles use.
- Use only the colours in the brief's `Colours` list. Any other colour is off brand.
- End the page with a footer that holds the line "Questions? Write to" and the support address. A reader who scrolls to the end is looking for a way to ask.
