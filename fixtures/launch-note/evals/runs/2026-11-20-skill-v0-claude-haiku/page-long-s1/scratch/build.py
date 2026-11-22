"""Build outputs/index.html (Ferry 4.0 changes page) from files/changes.md.

Usage: python3 -I build.py <changes.md> <index.html>
"""
import html
import os
import re
import sys

changes_path, out_path = sys.argv[1], sys.argv[2]

HEADLINE = "Everything that changed in Ferry 4.0."
RELEASE = "1 September 2027"
LINK = "https://ferry.example/4-0"
SUPPORT = "help@ferry.example"
SIGNER = "Mara Lindqvist"

with open(changes_path, encoding="utf-8") as f:
    lines = f.read().splitlines()

changes = []
current = None
for line in lines:
    m = re.match(r"^## (\d+)\. (.+)$", line)
    if m:
        current = {"num": m.group(1), "title": m.group(2).strip(), "area": "", "desc": []}
        changes.append(current)
        continue
    if current is None or not line.strip():
        continue
    if line.startswith("Area: "):
        current["area"] = line[len("Area: "):].strip()
    else:
        current["desc"].append(line.strip())

for c in changes:
    if not c["area"] or not c["desc"]:
        raise SystemExit(f"change {c['num']} is incomplete")

esc = html.escape

sections = []
for c in changes:
    sections.append(
        f'    <section class="change" id="change-{c["num"]}">\n'
        f'      <h2><span class="num">{esc(c["num"])}.</span> {esc(c["title"])}</h2>\n'
        f'      <p class="area">Area: {esc(c["area"])}</p>\n'
        + "".join(f"      <p>{esc(p)}</p>\n" for p in c["desc"])
        + "    </section>\n"
    )

STYLE = """
    body {
      margin: 0;
      background: #F4F1EA;
      color: #0B3D5C;
      font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 18px;
      line-height: 1.6;
    }
    .column {
      max-width: 640px;
      margin: 0 auto;
      padding: 48px 20px 32px;
    }
    h1 {
      font-size: 36px;
      line-height: 1.2;
      margin: 0 0 24px;
      padding-bottom: 16px;
      border-bottom: 4px solid #E2572B;
    }
    h2 {
      font-size: 20px;
      line-height: 1.35;
      margin: 0 0 6px;
    }
    .num {
      font-weight: 700;
    }
    p {
      margin: 0 0 12px;
    }
    .lede {
      margin-bottom: 12px;
    }
    .signer {
      font-weight: 700;
      margin-bottom: 40px;
    }
    .area {
      font-style: italic;
      margin-bottom: 8px;
    }
    .change {
      border-left: 4px solid #E2572B;
      padding: 4px 0 4px 16px;
      margin: 0 0 28px;
    }
    a {
      color: #0B3D5C;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    a:focus-visible {
      outline: 3px solid #E2572B;
      outline-offset: 2px;
    }
    footer {
      background: #0B3D5C;
      color: #F4F1EA;
      font-size: 18px;
    }
    footer .column {
      padding: 24px 20px;
    }
    footer p {
      margin: 0;
    }
    footer a {
      color: #F4F1EA;
    }
"""

page = f"""<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(HEADLINE)}</title>
  <style>{STYLE}  </style>
</head>
<body>
  <main class="column">
    <h1>{esc(HEADLINE)}</h1>
    <p class="lede">Ferry 4.0 is released on {esc(RELEASE)}. Each change below is on for everyone from that day, with nothing to switch on. Each change was asked for by people who run more than one location.</p>
    <p class="lede">The changes are listed in order, each with its number, title, area and full description. Read the release at <a href="{esc(LINK)}">{esc(LINK)}</a>.</p>
    <p class="signer">{esc(SIGNER)}</p>

{"".join(sections)}  </main>
  <footer>
    <div class="column">
      <p>Questions? Write to <a href="mailto:{esc(SUPPORT)}">{esc(SUPPORT)}</a></p>
    </div>
  </footer>
</body>
</html>
"""

os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    f.write(page)
print(f"wrote {out_path} with {len(changes)} changes")
