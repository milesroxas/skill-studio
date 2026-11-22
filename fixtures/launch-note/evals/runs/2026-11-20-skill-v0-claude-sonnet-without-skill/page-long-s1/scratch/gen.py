import re,html
src=open('files/changes.md').read()
items=re.findall(r'^## (\d+)\. (.+)\nArea: (.+)\n(.+)$',src,re.M)
assert len(items)==180
e=html.escape
rows=''.join(f'<li id="c{n}"><span class="n">{n}</span><div><h2>{e(t)}</h2><p class="area">Area: {e(a)}</p><p>{e(d)}</p></div></li>\n' for n,t,a,d in items)
page=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changes in Ferry 4.0</title>
<style>
:root{{--navy:#0B3D5C;--cream:#F4F1EA;--orange:#E2572B}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--cream);color:#1d2a33;font:17px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}}
header{{background:var(--navy);color:var(--cream);padding:56px 20px 44px}}
.w{{max-width:760px;margin:0 auto}}
header p{{margin:0 0 8px;letter-spacing:.08em;text-transform:uppercase;font-size:.8rem;color:#f3b49f}}
h1{{margin:0 0 12px;font-size:2.4rem;line-height:1.15}}
header .meta{{text-transform:none;letter-spacing:0;font-size:1rem;color:var(--cream)}}
header a{{color:var(--cream)}}
main{{padding:28px 20px 20px}}
ol{{list-style:none;margin:0;padding:0}}
li{{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid #d9d3c4}}
.n{{flex:none;min-width:3.2ch;font-weight:700;font-size:1.1rem;color:var(--orange);font-variant-numeric:tabular-nums}}
h2{{margin:0 0 2px;font-size:1.15rem;color:var(--navy)}}
li p{{margin:4px 0 0}}
.area{{font-size:.85rem;font-weight:600;color:var(--navy);margin-top:0}}
footer{{padding:24px 20px 56px}}
footer a{{color:var(--navy)}}
a:focus-visible{{outline:3px solid var(--orange);outline-offset:2px}}
@media(max-width:480px){{h1{{font-size:1.9rem}}li{{gap:10px}}}}
</style></head><body>
<header><div class="w"><p>Ferry 4.0 &middot; Released 1 September 2027</p>
<h1>Everything that changed in Ferry 4.0.</h1>
<p class="meta">{len(items)} changes, listed in order. <a href="https://ferry.example/4-0">ferry.example/4-0</a></p></div></header>
<main><div class="w"><ol>
{rows}</ol></div></main>
<footer><div class="w"><p>Questions? Write to <a href="mailto:help@ferry.example">help@ferry.example</a>.</p><p>Mara Lindqvist</p></div></footer>
</body></html>'''
open('outputs/index.html','w').write(page)
