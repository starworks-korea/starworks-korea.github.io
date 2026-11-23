# 기술 영상(tech.html) · 홍보 영상(promo.html) · 이야기(stories.html) 페이지 만들기
# 사용: python3 _tools/make_videos.py   (videos.json → 세 페이지 × 영어(루트, 기본)·한국어(ko/) 다시 생성)
import html, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import i18n, latest_ui
from i18n import t, tr
D = json.load(open(os.path.join(HERE, "videos.json"), encoding="utf-8"))
F = "font-family: 'Noto Sans KR', sans-serif"
e = html.escape
VISC = {"공개": "#22C55E", "일부 공개": "#F59E0B"}
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
def lang_chips(lg, L):
    LS = i18n.LSTATE[L]
    if lg.get("none"):
        return f'<span class="lg lg-x" title="{t(L, "말소리·자막이 없는 영상", "No speech or subtitles")}">{t(L, "음성 없음", "No speech")}</span>'
    out = "".join(f'<span class="lg {LCLASS.get(lg.get(k, ""), "lg-n")}" title="{n}: {LS.get(lg.get(k, ""), LS[""])}">{n}</span>' for k, n in i18n.LANG_NAMES[L])
    names = [i18n.lang_name(L, x) for x in etc_names(lg)]; st = etc_state(lg)
    other = t(L, "기타", "Other")
    if names:
        label = t(L, f"기타 {len(names)}개", f"Other {len(names)}") if len(names) > 1 else f"{other} · {names[0]}"
        out += f'<span class="lg {LCLASS[st]}" title="{other} — {LS[st]}: {" · ".join(names)}">{label}</span>'
    else:
        out += f'<span class="lg lg-n" title="{other}: {LS[""]}">{other}</span>'
    return out
def card(name, color, v, L):
    vid, title, dur, date, vis, lg = v["id"], tr(v, "title", L), v["dur"], v["date"], v.get("vis", "공개"), v.get("lang", {"ko": "원본"})
    return f'''<a href="https://youtu.be/{vid}" target="_blank" rel="noopener" class="vcard" style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252">
<img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{e(title)} {t(L, "썸네일", "thumbnail")}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block">
<span style="position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; {F}; font-size: 12px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px"><span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 50%; background: {VISC.get(vis, '#9CA3AF')}; display: inline-block"></span>{i18n.VISLABEL[L].get(vis, vis)}</span>
<span style="position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px">{dur}</span>
</div>
<div style="padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px"><span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: {color}; border-radius: 999px">{e(name)}</span><time datetime="{date}" style="{F}; font-size: 13px; color: #5A6478">{t(L, "업로드", "Uploaded")} {i18n.date_fmt(L, date)}</time></div>
<h3 style="margin: 0; font-size: 17px; font-weight: 700; line-height: 1.45; color: #1E3252">{e(title)}</h3>
<div class="lgrow" aria-label="{t(L, "언어 버전", "Language versions")}">{lang_chips(lg, L)}</div>
<span style="margin-top: auto; padding-top: 4px; font-size: 14px; font-weight: 700; color: #0070C0">{t(L, "유튜브에서 보기", "Watch on YouTube")} ↗</span>
</div>
</a>'''

def features(P, L):
    """이야기 페이지 위쪽 특집: 영상 + 옆에 '게임 해 보기' (2026-11-22 대표 지시)"""
    A = i18n.asset(L); out = []
    for f in P.get("features", []):
        title, desc, note = tr(f, "title", L), tr(f, "desc", L), tr(f, "note", L)
        vid = (f.get("video_id_ko") if L == "ko" else "") or f.get("video_id", "")   # 한국어 페이지는 한국어판 영상 (2026-11-22)
        if vid:
            media = (f'<iframe src="https://www.youtube-nocookie.com/embed/{vid}" title="{e(title)}" loading="lazy" '
                     f'allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen '
                     f'style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0"></iframe>')
            yt = f'<a href="https://youtu.be/{vid}" target="_blank" rel="noopener" style="font-size: 14px; font-weight: 700; color: #0070C0">{t(L, "유튜브에서 보기", "Watch on YouTube")} ↗</a>'
        else:
            media = (f'<img src="{A}{f["image"]}" alt="{e(title)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block">'
                     f'<span style="position: absolute; left: 10px; top: 10px; padding: 4px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px">{t(L, "영상 준비 중", "Video coming soon")}</span>')
            yt = ""
        game = f'{A}{f["game"]}?lang={L}'
        out.append(f"""<article id="{f["key"]}" class="feat" style="scroll-margin-top: 16px; background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252">{media}</div>
<div style="padding: 24px 26px; display: flex; flex-direction: column; gap: 12px; justify-content: center">
<span style="align-self: flex-start; padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: #2f855a; border-radius: 999px">{t(L, "아들이 만든 게임", "A game my son made")}</span>
<h2 style="margin: 0; font-size: 24px; font-weight: 900; line-height: 1.35; color: #1E3252">{e(title)}</h2>
<p style="margin: 0; font-size: 15px; line-height: 1.7; color: #3A4558">{e(desc)}</p>
<p style="margin: 0; font-size: 13px; line-height: 1.6; color: #5A6478">💻 {e(note)}</p>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: 4px">
<a class="playbtn" href="{game}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 12px 24px; font-size: 17px; font-weight: 900; color: #FFFFFF; background: #0070C0; border-radius: 6px">▶ {t(L, "게임 해 보기", "Play the Game")}</a>
{yt}
</div>
</div>
</article>""")
    if not out: return ""
    return f"""<section aria-label="{t(L, "특집", "Featured")}" style="max-width: 1200px; margin: 0 auto; padding: 40px 24px 0">
{chr(10).join(out)}
</section>
"""

CSS = '''body{margin:0;background:#F4F6F9;word-break:keep-all;overflow-wrap:anywhere}
a{color:inherit;text-decoration:none}a:hover{color:#0070C0}
html{scroll-behavior:smooth}
.vcard{transition:box-shadow .15s,transform .15s}
.vcard:hover{box-shadow:0 6px 18px rgba(30,50,82,.14);transform:translateY(-2px);color:inherit}
.vcard:focus-visible{outline:3px solid #0070C0;outline-offset:2px}
.lgrow{display:flex;flex-wrap:wrap;gap:4px}
.lg{padding:2px 8px;font-size:12px;font-weight:700;border-radius:4px;line-height:1.5;border:1px solid transparent}
.lg-o{background:#1E3252;color:#FFFFFF;border-color:#1E3252}
.lg-d{background:#0070C0;color:#FFFFFF;border-color:#0070C0}
.lg-a{background:#FFFFFF;color:#0070C0;border-color:#0070C0}
.lg-n{background:#FFFFFF;color:#A0AEC0;border:1px dashed #CBD5E0}
.lg-x{background:#EDF2F7;color:#4A5568;border-color:#CBD5E0}
.playbtn:hover{background:#005a9c !important;color:#FFFFFF}
.playbtn:focus-visible{outline:3px solid #1E3252;outline-offset:2px}
@media (max-width:820px){.feat{grid-template-columns:1fr !important}}
@media (max-width:600px){h1{font-size:34px !important}}
''' + latest_ui.CSS

def build(P, L):
    FIELDS = [(f["key"], tr(f, "name", L), f["color"], tr(f, "desc", L)) for f in P["fields"]]
    V = {k: [] for k, *_ in FIELDS}
    for v in sorted((x for x in P["videos"] if not x.get("hide")), key=lambda x: x["date"], reverse=True):
        V[v["field"]].append(v)
    ALLV = [v for k,*_ in FIELDS for v in V[k]]
    total = len(ALLV)
    A = i18n.asset(L)
    cnt = lambda n: t(L, f"{n}편", f"{n} video" + ("" if n == 1 else "s"))
    chips = "\n".join(
     f'<a href="#{k}" style="display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 18px; {F}; font-size: 15px; font-weight: 700; border-radius: 999px; background: #FFFFFF; color: #1E3252; border: 1px solid #C9D3E0"><span aria-hidden="true" style="width: 10px; height: 10px; border-radius: 50%; background: {c}; display: inline-block"></span>{e(n)} <span style="font-weight: 500; color: #5A6478">{len(V[k])}</span></a>'
     for k,n,c,_ in FIELDS if V[k])
    sections=[]
    for k,n,c,desc in FIELDS:
        if not V[k]: continue
        cards="\n".join(card(n,c,v,L) for v in V[k])
        sections.append(f"""<section id="{k}" style="scroll-margin-top: 16px; margin-bottom: 48px">
<div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-left: 14px; border-left: 6px solid {c}">
<h2 style="margin: 0; font-size: 24px; font-weight: 900; color: #1E3252">{e(n)}</h2>
<span style="font-size: 14px; font-weight: 700; color: #0070C0">{cnt(len(V[k]))}</span>
<span style="font-size: 14px; color: #5A6478">{e(desc)}</span>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px">
{cards}
</div>
</section>""")
    # 위쪽 공개·회원 공개 목록과 언어 버전 요약은 없앰 (대표 지시 2026-11-24) — 카드마다 붙은 표기는 그대로
    # 맨 위 최신 영상 1편 (특집에 이미 있는 영상이면 넣지 않음)
    NAME = {k: (n, c) for k, n, c, _ in FIELDS}
    lv = latest_ui.pick(P["videos"])   # json 순서 그대로 (같은 날짜면 나중에 넣은 것)
    feat_ids = {x for f in P.get("features", []) for x in (f.get("video_id"), f.get("video_id_ko")) if x}
    latest_html = latest_ui.block(L, lv, *NAME[lv["field"]]) if lv and lv["id"] not in feat_ids else ""
    ptitle = tr(P, "title", L); sub = tr(P, "sub", L)
    title = t(L, f"스타웍스 {ptitle}", f"STAR Works — {ptitle}")
    desc = t(L, f"{sub} — 영상 {total}편 바로 가기", f"{sub} — {cnt(total)}")
    foot = "\n".join(f'<p style="margin: 0">{x}</p>' for x in i18n.footer_lines(L))
    return f"""<!doctype html>
<html lang="{L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{t(L, "스타웍스 STARWORKS", "STAR Works STARWORKS")}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{i18n.page_url(L, P["file"])}">
<meta property="og:image" content="https://starworks-korea.github.io/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{A}images/logo.svg" type="image/svg+xml">
{i18n.hreflang(P["file"])}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&amp;display=swap">
<style>
{CSS}
</style>
</head>
<body>
<div style="width: 100%; {F}; color: #1E3252; background: #F4F6F9">

<header style="background: #1E3252; border-bottom: 1px solid rgba(255,255,255,0.15)">
<div style="max-width: 1200px; margin: 0 auto; padding: 0 24px; min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap">
<a href="index.html" style="display: flex; align-items: center; gap: 10px; color: #FFFFFF">
<img src="{A}images/logo.svg" alt="STAR Works" style="height: 40px; width: auto; display: block">
</a>
<nav aria-label="{t(L, "주 메뉴", "Main menu")}" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
{i18n.nav(L, P["file"])}
</nav>
</div>
</header>

<section style="background: #1E3252; color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 64px 24px 56px; display: flex; flex-direction: column; gap: 14px">
<p style="margin: 0; {F}; font-size: 14px; letter-spacing: 2px; color: #9CC3E8">{e(P["eyebrow"])}</p>
<h1 style="margin: 0; font-size: 46px; font-weight: 900; letter-spacing: -1px">{e(ptitle)}</h1>
<p style="margin: 0; font-size: 18px; color: #C9D3E0">{e(sub)} · {t(L, f"영상 {total}편", cnt(total))}</p>
<p style="margin: 0; font-size: 14px; color: #9CC3E8">{t(L, "최근 갱신", "Last updated")} {D["updated"]} {t(L, "", "(KST)")}</p>
</div>
</section>

{features(P, L)}{latest_html}
<section style="max-width: 1200px; margin: 0 auto; padding: 32px 24px 24px">
<nav aria-label="{t(L, "분류 바로 가기", "Jump to a category")}" style="display: flex; flex-wrap: wrap; gap: 8px">
{chips}
</nav>
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 16px 24px 32px">
{chr(10).join(sections)}
</section>

<section style="background: #1E3252; color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 56px 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: space-between">
<h2 style="margin: 0; font-size: 28px; font-weight: 900">{t(L, "제작·해석이 필요하신가요?", "Need manufacturing or analysis?")}</h2>
<a href="contact.html" style="padding: 16px 28px; font-size: 16px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">{t(L, "문의하기", "Contact Us")}</a>
</div>
</section>

<footer style="background: #16263F; color: #C9D3E0">
<div style="max-width: 1200px; margin: 0 auto; padding: 40px 24px; display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between; font-size: 14px; line-height: 1.8">
<div>
<img src="{A}images/logo.svg" alt="STAR Works" style="height: 34px; width: auto; display: block; margin-bottom: 10px">
{foot}
</div>
<p style="margin: 0; align-self: flex-end">© STARWORKS</p>
</div>
</footer>

</div>
</body>
</html>
""", total

for P in D["pages"]:
    for L, path in (("en", os.path.join(ROOT, P["file"])), ("ko", os.path.join(ROOT, "ko", P["file"]))):
        out, n = build(P, L)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w", encoding="utf-8").write(out)
        print(L, P["file"], n)
