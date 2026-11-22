import html
import re
import sys

base = sys.argv[1]
changes_path = base + "/files/changes.md"
out_path = base + "/outputs/index.html"

HEADLINE = "Everything that changed in Ferry 4.0."
LINK = "https://ferry.example/4-0"
SUPPORT = "help@ferry.example"
DATE = "1 September 2027"
SIGNER = "Mara Lindqvist"

text = open(changes_path, encoding="utf-8").read()
blocks = re.split(r"^## ", text, flags=re.M)[1:]

items = []
for b in blocks:
    lines = b.strip("\n").split("\n")
    m = re.match(r"(\d+)\. (.+)$", lines[0])
    num, title = m.group(1), m.group(2).strip()
    area = re.match(r"Area: (.+)$", lines[1]).group(1).strip()
    desc = " ".join(l.strip() for l in lines[2:] if l.strip())
    items.append((num, title, area, desc))

assert len(items) == 180, len(items)

sections = []
for num, title, area, desc in items:
    sections.append(
        f'<section class="change" id="change-{num}">\n'
        f'  <h2><span class="num">{num}.</span> {html.escape(title)}</h2>\n'
        f'  <p class="area">Area: {html.escape(area)}</p>\n'
        f'  <p>{html.escape(desc)}</p>\n'
        f'</section>'
    )

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{HEADLINE}</title>
<style>
  body {{
    margin: 0;
    background: #F4F1EA;
    color: #0B3D5C;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    line-height: 1.6;
  }}
  main {{
    max-width: 640px;
    margin: 0 auto;
    padding: 48px 20px 32px;
  }}
  h1 {{
    font-size: 36px;
    line-height: 1.2;
    margin: 0 0 24px;
    color: #0B3D5C;
  }}
  h2 {{
    font-size: 20px;
    line-height: 1.3;
    margin: 0 0 6px;
    color: #0B3D5C;
  }}
  h2 .num {{
    color: #0B3D5C;
  }}
  p {{
    font-size: 18px;
    margin: 0 0 12px;
  }}
  .intro {{
    margin-bottom: 32px;
  }}
  .change {{
    border-top: 3px solid #E2572B;
    padding: 16px 0 20px;
  }}
  .area {{
    font-family: Arial, Helvetica, sans-serif;
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 6px;
  }}
  a {{
    color: #0B3D5C;
    text-decoration: underline;
  }}
  footer {{
    max-width: 640px;
    margin: 0 auto;
    padding: 24px 20px 48px;
    border-top: 3px solid #E2572B;
    font-size: 18px;
  }}
</style>
</head>
<body>
<main>
<h1>{HEADLINE}</h1>
<div class="intro">
<p>Ferry 4.0 is released on {DATE}. Below is every change in the release, in order, with the area each one touches.</p>
<p>Each change is on for everyone from the day Ferry 4.0 is released, with nothing to switch on. Read the full notes at <a href="{LINK}">{LINK}</a>.</p>
<p>{SIGNER}</p>
</div>
{chr(10).join(sections)}
</main>
<footer>
<p>Questions? Write to <a href="mailto:{SUPPORT}">{SUPPORT}</a></p>
</footer>
</body>
</html>
"""

open(out_path, "w", encoding="utf-8").write(page)
print("wrote", out_path, len(items), "changes")
