import re,html
t=open('files/changes.md').read()
items=re.findall(r'^## (\d+)\. (.+)\nArea: (.+)\n(.+)$',t,re.M)
assert len(items)==180
e=html.escape
lis=''.join(f'<li id="c{n}"><h2><span class="n">{n}</span> {e(ti)}</h2><p class="area">Area: {e(a)}</p><p>{e(d)}</p></li>\n' for n,ti,a,d in items)
page=f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Everything that changed in Ferry 4.0.</title>
<style>
body{{margin:0;background:#F4F1EA;color:#0B3D5C;font:18px/1.55 Georgia,serif}}
main,footer{{max-width:640px;margin:0 auto;padding:0 20px}}
.eyebrow{{margin:40px 0 0;font-weight:bold;border-left:6px solid #E2572B;padding-left:10px}}
h1{{font-size:2rem;line-height:1.2;margin:12px 0 16px}}
h2{{font-size:1.1rem;margin:0 0 4px}}
.n{{display:inline-block;min-width:2.2em;color:#0B3D5C;border-bottom:3px solid #E2572B}}
ol{{list-style:none;margin:32px 0;padding:0}}
li{{padding:16px 0;border-top:1px solid #0B3D5C}}
li p{{margin:4px 0}}
.area{{font-size:.9rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}}
footer{{background:#0B3D5C;color:#F4F1EA;max-width:none;padding:24px 20px}}
footer p{{max-width:600px;margin:0 auto}}
footer a{{color:#F4F1EA}}
</style></head><body>
<main>
<p class="eyebrow">Ferry 4.0 &middot; 1 September 2027</p>
<h1>Everything that changed in Ferry 4.0.</h1>
<p>Ferry 4.0 has 180 changes, listed below in order. Each one is on for everyone from release day, with nothing to switch on.</p>
<ol>
{lis}</ol>
</main>
<footer><p>Questions? Write to <a href="mailto:help@ferry.example">help@ferry.example</a></p></footer>
</body></html>'''
open('outputs/index.html','w').write(page)
