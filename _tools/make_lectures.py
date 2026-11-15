import html, sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lectures.html")
import json, os, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "lectures.json"), encoding="utf-8"))
FIELDS = [(f["key"], f["name"], f["color"], f["desc"]) for f in D["fields"]]
V = {k: [] for k, *_ in FIELDS}
for v in sorted(D["videos"], key=lambda x: x["num"]):
    V[v["field"]].append((v["id"], v["title"], v["dur"], v["date"]))
# 해석 기초 예제 (강의 시리즈 밖 — 예약 작업이 videos를 바꿔도 그대로 둠)
EX = D.get("examples", {"title": "", "desc": "", "fields": [], "videos": []})
EXF = [(f["key"], f["name"], f["color"], f["desc"]) for f in EX["fields"]]
EV = {k: [] for k, *_ in EXF}
for v in sorted(EX["videos"], key=lambda x: x["num"]):
    EV[v["field"]].append((v["id"], v["title"], v["dur"], v["date"]))
F = "font-family: 'Noto Sans KR', sans-serif"
e = html.escape
total = sum(len(v) for v in V.values())
extotal = sum(len(v) for v in EV.values())
nav_items = [("index.html","회사소개"),("projects.html","프로젝트"),("lectures.html","강의 영상"),("contact.html","연락처")]
def nav(active):
    s=[]
    for href,label in nav_items:
        if href==active:
            s.append(f'<a href="{href}" aria-current="page" style="padding: 12px 14px; font-size: 15px; font-weight: 700; color: #FFFFFF; border-bottom: 2px solid #FFFFFF">{label}</a>')
        else:
            s.append(f'<a href="{href}" style="padding: 12px 14px; font-size: 15px; color: #C9D3E0">{label}</a>')
    s.append('<a href="contact.html" style="margin-left: 8px; padding: 12px 18px; font-size: 14px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">제작 문의</a>')
    return "\n".join(s)

chips = "\n".join(
 f'<a href="#{k}" style="display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 18px; {F}; font-size: 15px; font-weight: 700; border-radius: 999px; background: #FFFFFF; color: #1E3252; border: 1px solid #C9D3E0"><span aria-hidden="true" style="width: 10px; height: 10px; border-radius: 50%; background: {c}; display: inline-block"></span>{n} <span style="font-weight: 500; color: #5A6478">{len(V[k])}</span></a>'
 for k,n,c,_ in FIELDS if V[k])
chips_ex = "\n".join(
 f'<a href="#{k}" style="display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 18px; {F}; font-size: 15px; font-weight: 700; border-radius: 999px; background: #FFFFFF; color: #1E3252; border: 1px dashed #8A96A8"><span aria-hidden="true" style="width: 10px; height: 10px; border-radius: 50%; background: {c}; display: inline-block"></span>{n} <span style="font-weight: 500; color: #5A6478">{len(EV[k])}</span></a>'
 for k,n,c,_ in EXF if EV[k])

def card(name,color,num,vid,title,dur,date):
    ds=date.replace("-",". ")+"."
    url=f"https://youtu.be/{vid}"
    return f'''<a href="{url}" target="_blank" rel="noopener" class="vcard" style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252">
<img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{e(name)} {num} 썸네일" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block">
<span style="position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px">{dur}</span>
</div>
<div style="padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px"><span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: {color}; border-radius: 999px">{e(name)} {num}</span><time datetime="{date}" style="{F}; font-size: 13px; color: #5A6478">업로드 {ds}</time></div>
<h3 style="margin: 0; font-size: 17px; font-weight: 700; line-height: 1.45; color: #1E3252">{e(title)}</h3>
<span style="margin-top: auto; padding-top: 4px; font-size: 14px; font-weight: 700; color: #0070C0">유튜브에서 보기 ↗</span>
</div>
</a>'''

def section_list(fields, vids):
  out=[]
  for k,n,c,desc in fields:
    if not vids[k]: continue
    cards="\n".join(card(n,c,i+1,*v) for i,v in enumerate(vids[k]))
    out.append(f'''<section id="{k}" style="scroll-margin-top: 16px; margin-bottom: 48px">
<div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-left: 14px; border-left: 6px solid {c}">
<h2 style="margin: 0; font-size: 24px; font-weight: 900; color: #1E3252">{n}</h2>
<span style="font-size: 14px; font-weight: 700; color: #0070C0">{len(vids[k])}편</span>
<span style="font-size: 14px; color: #5A6478">{desc}</span>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px">
{cards}
</div>
</section>''')
  return out
sections = section_list(FIELDS, V)
ex_sections = section_list(EXF, EV)

desc_meta = f"김영석 교수(경북대학교)와 함께하는 「AI 에이전트 유한요소 해석」 강의 영상 {total}편 바로 가기 — 스타웍스"
page=f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>스타웍스 강의 영상 — AI 에이전트 유한요소 해석</title>
<meta name="description" content="{desc_meta}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="스타웍스 STARWORKS">
<meta property="og:title" content="스타웍스 강의 영상 — AI 에이전트 유한요소 해석">
<meta property="og:description" content="{desc_meta}">
<meta property="og:url" content="https://starworks-korea.github.io/lectures.html">
<meta property="og:image" content="https://starworks-korea.github.io/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="images/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&amp;display=swap">
<style>
body{{margin:0;background:#F4F6F9;word-break:keep-all;overflow-wrap:anywhere}}
a{{color:inherit;text-decoration:none}}a:hover{{color:#0070C0}}
html{{scroll-behavior:smooth}}
.cf{{background-color:#1E3252}}
.grid-bg{{background-color:#1E3252}}
.vcard{{transition:box-shadow .15s,transform .15s}}
.vcard:hover{{box-shadow:0 6px 18px rgba(30,50,82,.14);transform:translateY(-2px);color:inherit}}
.vcard:focus-visible{{outline:3px solid #0070C0;outline-offset:2px}}
</style>
</head>
<body>
<div style="width: 100%; {F}; color: #1E3252; background: #F4F6F9">

<header style="background: #1E3252; border-bottom: 1px solid rgba(255,255,255,0.15)">
<div style="max-width: 1200px; margin: 0 auto; padding: 0 24px; min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap">
<a href="index.html" style="display: flex; align-items: center; gap: 10px; color: #FFFFFF">
<img src="images/logo.svg" alt="STAR Works" style="height: 40px; width: auto; display: block">
</a>
<nav aria-label="주 메뉴" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
{nav("lectures.html")}
</nav>
</div>
</header>

<section class="grid-bg" style="color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 64px 24px 56px; display: flex; flex-direction: column; gap: 14px">
<p style="margin: 0; {F}; font-size: 14px; letter-spacing: 2px; color: #9CC3E8">LECTURES</p>
<h1 style="margin: 0; font-size: 46px; font-weight: 900; letter-spacing: -1px">AI 에이전트 유한요소 해석</h1>
<p style="margin: 0; font-size: 18px; color: #C9D3E0">경북대학교 김영석 교수 · 스타웍스 신동우 · 강의 영상 {total}편 · 해석 기초 예제 {extotal}편</p>
<p style="margin: 0; font-size: 14px; color: #9CC3E8">최근 갱신 {D["updated"]}</p>
</div>
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 40px 24px 24px">
<nav aria-label="분야 바로 가기" style="display: flex; flex-wrap: wrap; gap: 8px">
{chips}
{chips_ex}
</nav>
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 16px 24px 32px">
{chr(10).join(sections)}
</section>

<section id="examples" style="max-width: 1200px; margin: 0 auto; padding: 0 24px 32px">
<div style="border-top: 1px solid #C9D3E0; padding-top: 32px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px">
<p style="margin: 0; {F}; font-size: 13px; letter-spacing: 2px; color: #5A6478">EXAMPLES</p>
<h2 style="margin: 0; font-size: 30px; font-weight: 900; color: #1E3252">{e(EX["title"])}</h2>
<p style="margin: 0; font-size: 15px; color: #4A5568">{e(EX["desc"])}</p>
</div>
{chr(10).join(ex_sections)}
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 0 24px 72px">
<div style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; padding: 24px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between">
<div style="display: flex; flex-direction: column; gap: 6px">
<p style="margin: 0; {F}; font-size: 13px; letter-spacing: 2px; color: #5A6478">교재</p>
<h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #1E3252">「소성역학과 응용」 2nd Ed. (2023)</h2>
<p style="margin: 0; font-size: 15px; color: #4A5568">김영석 지음 · 시그마프레스 · 영문판 출간 예정</p>
</div>
<a href="https://ridibooks.com/books/2224000497" target="_blank" rel="noopener" style="padding: 14px 22px; font-size: 15px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">리디북스 전자책 ↗</a>
</div>
</section>

<section class="cf" style="color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 56px 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: space-between">
<h2 style="margin: 0; font-size: 28px; font-weight: 900">해석이 필요하신가요?</h2>
<a href="contact.html" style="padding: 16px 28px; font-size: 16px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">해석 문의하기</a>
</div>
</section>

<footer style="background: #16263F; color: #C9D3E0">
<div style="max-width: 1200px; margin: 0 auto; padding: 40px 24px; display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between; font-size: 14px; line-height: 1.8">
<div>
<img src="images/logo.svg" alt="STAR Works" style="height: 34px; width: auto; display: block; margin-bottom: 10px">
<p style="margin: 0">스타웍스 · 대표 신동우</p>
<p style="margin: 0">경북 경산시 남매공원로2길 10, 1층</p>
<p style="margin: 0">Tel 010-4401-7115 · shindongwoo@gmail.com</p>
</div>
<p style="margin: 0; align-self: flex-end">© STARWORKS</p>
</div>
</footer>

</div>
</body>
</html>
'''
open(OUT,"w",encoding="utf-8").write(page)
print("cards", total, "examples", extotal)
