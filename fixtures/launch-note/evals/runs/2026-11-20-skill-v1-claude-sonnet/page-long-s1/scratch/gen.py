import re,html
t=open('files/changes.md').read().split('\n## ')[1:]
items=[]
for b in t:
    l=b.strip().split('\n')
    m=re.match(r'(\d+)\. (.*)',l[0])
    area=l[1].replace('Area: ','')
    items.append((m.group(1),m.group(2),area,' '.join(l[2:]).strip()))
e=html.escape
lis=''.join(f'<li><h2><span class="n">{n}</span> {e(ti)}</h2><p class="area">Area: {e(a)}</p><p>{e(d)}</p></li>\n' for n,ti,a,d in items)
open('outputs/index.html','w').write(f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Everything that changed in Ferry 4.0.</title>
<style>
body{{margin:0;background:#F4F1EA;color:#0B3D5C;font:18px/1.55 Georgia,serif}}
main,footer{{max-width:640px;margin:0 auto;padding:0 20px}}
h1{{font-size:2rem;line-height:1.2;margin:40px 0 12px}}
.intro{{border-bottom:3px solid #E2572B;padding-bottom:20px}}
ol{{list-style:none;padding:0;margin:0}}
li{{padding:18px 0;border-bottom:1px solid #0B3D5C}}
h2{{font-size:1.1rem;margin:0 0 4px}}
.n{{color:#E2572B}}
.area{{font-weight:bold;margin:0 0 4px}}
li p{{margin:0}}
footer{{padding-top:24px;padding-bottom:40px}}
</style></head><body>
<main>
<h1>Everything that changed in Ferry 4.0.</h1>
<p class="intro">Ferry 4.0 is out on 1 September 2027. Here are all {len(items)} changes, in order. <a href="https://ferry.example/4-0" style="color:#E2572B">Read more</a>.</p>
<ol>
{lis}</ol>
</main>
<footer><p>Questions? Write to help@ferry.example</p></footer>
</body></html>''')
