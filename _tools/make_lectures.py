import html, sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lectures.html")
import json, os, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "lectures.json"), encoding="utf-8"))
FIELDS = [(f["key"], f["name"], f["color"], f["desc"]) for f in D["fields"]]
V = {k: [] for k, *_ in FIELDS}
for v in sorted(D["videos"], key=lambda x: x["num"]):
    V[v["field"]].append((v["id"], v["title"], v["dur"], v["date"], v.get("vis", "공개"), v.get("lang", {"ko": "원본"})))
# 해석 기초 예제 (강의 시리즈 밖 — 예약 작업이 videos를 바꿔도 그대로 둠)
EX = D.get("examples", {"title": "", "desc": "", "fields": [], "videos": []})
EXF = [(f["key"], f["name"], f["color"], f["desc"]) for f in EX["fields"]]
EV = {k: [] for k, *_ in EXF}
for v in sorted(EX["videos"], key=lambda x: x["num"]):
    EV[v["field"]].append((v["id"], v["title"], v["dur"], v["date"], v.get("vis", "공개"), v.get("lang", {"ko": "원본"})))
F = "font-family: 'Noto Sans KR', sans-serif"
e = html.escape
total = sum(len(v) for v in V.values())
extotal = sum(len(v) for v in EV.values())
nav_items = [("index.html","회사소개"),("projects.html","프로젝트"),("lectures.html","강의 영상"),("tech.html","기술 영상"),("promo.html","홍보 영상"),("stories.html","이야기"),("contact.html","연락처")]
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

VISC = {"공개": "#22C55E", "일부 공개": "#F59E0B"}
VISLABEL = {"공개": "공개", "일부 공개": "회원 공개"}
LANGS = [("ko", "한국어"), ("en", "영어"), ("ja", "일본어"), ("es", "스페인어")]
LSTATE = {"원본": "원본 음성", "더빙": "직접 만든 더빙·자막", "자동": "유튜브 자동 더빙", "": "준비 중"}
LCLASS = {"원본": "lg-o", "더빙": "lg-d", "자동": "lg-a", "": "lg-n"}
ETC_ORDER = ["원본", "더빙", "자동"]
def etc_state(lg):
    etc = lg.get("etc") or {}
    for st in ETC_ORDER:
        if etc.get(st): return st
    return ""
def etc_names(lg):
    etc = lg.get("etc") or {}
    return [n for st in ETC_ORDER for n in etc.get(st, [])]
def lang_chips(lg):
    out = "".join(f'<span class="lg {LCLASS.get(lg.get(k, ""), "lg-n")}" title="{n}: {LSTATE.get(lg.get(k, ""), "준비 중")}">{n}</span>' for k, n in LANGS)
    names = etc_names(lg); st = etc_state(lg)
    if names:
        label = f"기타 {len(names)}개" if len(names) > 1 else f"기타 · {names[0]}"
        out += f'<span class="lg {LCLASS[st]}" title="기타 {LSTATE[st]}: {" · ".join(names)}">{label}</span>'
    else:
        out += '<span class="lg lg-n" title="기타: 준비 중">기타</span>'
    return out
def card(name,color,num,vid,title,dur,date,vis,lg):
    ds=date.replace("-",". ")+"."
    url=f"https://youtu.be/{vid}"
    return f'''<a href="{url}" target="_blank" rel="noopener" class="vcard" style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252">
<img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{e(name)} {num} 썸네일" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block">
<span style="position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; {F}; font-size: 12px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px"><span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 50%; background: {VISC.get(vis, '#9CA3AF')}; display: inline-block"></span>{VISLABEL.get(vis, vis)}</span>
<span style="position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px">{dur}</span>
</div>
<div style="padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px"><span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: {color}; border-radius: 999px">{e(name)} {num}</span><time datetime="{date}" style="{F}; font-size: 13px; color: #5A6478">업로드 {ds}</time></div>
<h3 style="margin: 0; font-size: 17px; font-weight: 700; line-height: 1.45; color: #1E3252">{e(title)}</h3>
<div class="lgrow" aria-label="언어 버전">{lang_chips(lg)}</div>
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

# 공개 범위 요약 (페이지 위쪽)
def vis_rows(vis):
    rows=[]
    for fields, vids in ((FIELDS, V), (EXF, EV)):
        for k,n,c,_ in fields:
            for i,(vid,title,dur,date,vv,_lg) in enumerate(vids[k]):
                if vv!=vis: continue
                ds=date.replace("-",". ")+"."
                rows.append(f'''<li style="border-top: 1px solid #DCE1E8"><a class="vrow" href="https://youtu.be/{vid}" target="_blank" rel="noopener"><span class="b" style="background: {c}">{e(n)} {i+1}</span><span class="t">{e(title)}</span><span class="d">{ds}</span></a></li>''')
    return rows
VIS_INFO = [("공개", "누구나 검색해서 볼 수 있는 영상"), ("일부 공개", "링크를 받은 분께만 공개하는 영상")]
vis_panels=[]
for vis, note in VIS_INFO:
    rows=vis_rows(vis)
    if not rows: continue
    vis_panels.append(f'''<div style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; padding: 20px 22px 12px">
<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px">
<span aria-hidden="true" style="width: 12px; height: 12px; border-radius: 50%; background: {VISC[vis]}; display: inline-block"></span>
<h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #1E3252">{VISLABEL.get(vis, vis)} 영상</h2>
<span style="font-size: 15px; font-weight: 700; color: #0070C0">{len(rows)}편</span>
<span style="font-size: 14px; color: #5A6478">{note}</span>
</div>
<ul style="margin: 0; padding: 0; list-style: none">
{chr(10).join(rows)}
</ul>
</div>''')
vis_html = chr(10).join(vis_panels)

# 언어 버전 요약
ALLV = [v for fv in (V, EV) for lst in fv.values() for v in lst]
def lcount(k, st): return sum(1 for v in ALLV if v[5].get(k, "") == st)
lang_boxes=[]
for k, n in LANGS:
    parts=[]
    for st, lab in (("원본", "원본"), ("더빙", "직접 더빙"), ("자동", "자동 더빙"), ("", "준비 중")):
        c=lcount(k, st)
        if c: parts.append(f'<span class="lg {LCLASS[st]}">{lab} {c}</span>')
    lang_boxes.append(f'''<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid #DCE1E8; border-radius: 8px; background: #F8FAFC">
<p style="margin: 0; font-size: 17px; font-weight: 900; color: #1E3252">{n}</p>
<div class="lgrow">{"".join(parts)}</div>
</div>''')
# 기타 언어 상자
from collections import Counter
etc_cnt = Counter(n for v in ALLV for n in etc_names(v[5]))
etc_parts=[]
for st, lab in (("원본", "원본"), ("더빙", "직접 더빙"), ("자동", "자동 더빙"), ("", "준비 중")):
    c=sum(1 for v in ALLV if etc_state(v[5]) == st)
    if c: etc_parts.append(f'<span class="lg {LCLASS[st]}">{lab} {c}</span>')
top = etc_cnt.most_common()
main = [f"{n} {c}편" for n, c in top if c > 1]
rest = [n for n, c in top if c == 1]
etc_note = " · ".join(main)
etc_note = e(etc_note)
if rest: etc_note += (" · " if etc_note else "") + f'<span title="{e(" · ".join(rest))}" style="text-decoration: underline dotted">그 밖의 {len(rest)}개 언어 1편</span>'
lang_boxes.append(f'''<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid #DCE1E8; border-radius: 8px; background: #F8FAFC">
<p style="margin: 0; font-size: 17px; font-weight: 900; color: #1E3252">기타 언어</p>
<div class="lgrow">{"".join(etc_parts)}</div>
<p style="margin: 0; font-size: 12px; line-height: 1.5; color: #5A6478">{etc_note}</p>
</div>''')
lang_html = f'''<div style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; padding: 20px 22px">
<div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 14px">
<h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #1E3252">언어 버전</h2>
<span style="font-size: 14px; color: #5A6478">한국어 · 영어 · 일본어 · 스페인어 · 기타 — 영상 수</span>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px">
{chr(10).join(lang_boxes)}
</div>
<div class="lgrow" style="margin-top: 14px; align-items: center; font-size: 13px; color: #5A6478; gap: 6px 14px">
<span><span class="lg lg-o">원본</span> 원본 음성</span>
<span><span class="lg lg-d">직접 더빙</span> 직접 만든 더빙·자막</span>
<span><span class="lg lg-a">자동 더빙</span> 유튜브 자동 더빙</span>
<span><span class="lg lg-n">준비 중</span> 제작 예정</span>
<span>음성 언어 바꾸기: 유튜브 ⚙ 설정 → 오디오 트랙</span>
</div>
</div>'''
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
.lgrow{{display:flex;flex-wrap:wrap;gap:4px}}
.lg{{padding:2px 8px;font-size:12px;font-weight:700;border-radius:4px;line-height:1.5;border:1px solid transparent}}
.lg-o{{background:#1E3252;color:#FFFFFF;border-color:#1E3252}}
.lg-d{{background:#0070C0;color:#FFFFFF;border-color:#0070C0}}
.lg-a{{background:#FFFFFF;color:#0070C0;border-color:#0070C0}}
.lg-n{{background:#FFFFFF;color:#A0AEC0;border:1px dashed #CBD5E0}}
.vrow{{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:baseline;padding:10px 2px;font-size:15px;line-height:1.45}}
.vrow .b{{padding:2px 9px;font-size:12px;font-weight:700;color:#FFFFFF;border-radius:999px;white-space:nowrap}}
.vrow .t{{color:#1E3252}}
.vrow .d{{font-size:13px;color:#5A6478;white-space:nowrap}}
.vrow:hover .t{{color:#0070C0}}
@media (max-width:600px){{.vrow{{grid-template-columns:auto 1fr}}.vrow .d{{justify-self:end}}.vrow .t{{grid-column:1 / -1;grid-row:2}}}}
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

<section id="visibility" aria-label="공개 범위" style="max-width: 1200px; margin: 0 auto; padding: 40px 24px 8px">
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; align-items: start">
{vis_html}
</div>
<div style="margin-top: 20px">
{lang_html}
</div>
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 32px 24px 24px">
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
