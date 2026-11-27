# 생성 페이지 공통 머리·머리글·바닥글 — make_playlist.py · make_tools.py 가 씀 (2026-11-27)
import html
import i18n
from i18n import t

e = html.escape
F = "font-family: 'Noto Sans KR', sans-serif"
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&amp;display=swap">'


def head(L, file, title, desc, css, robots="noindex, nofollow", early_js=""):
    A = i18n.asset(L)
    rb = f'<meta name="robots" content="{robots}">\n' if robots else ""
    return f"""<!doctype html>
<html lang="{L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{rb}<meta property="og:type" content="website">
<meta property="og:site_name" content="{t(L, "스타웍스 STARWORKS", "STAR Works STARWORKS")}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{i18n.page_url(L, file)}">
<meta property="og:image" content="https://starworks-korea.github.io/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
{i18n.icon_links(L)}
{i18n.hreflang(file)}
{FONT}
{early_js}<style>
{css}
</style>
</head>"""


def header(L, active, file=None):
    A = i18n.asset(L)
    return f"""<header style="background: #1E3252; border-bottom: 1px solid rgba(255,255,255,0.15)">
<div style="max-width: 1200px; margin: 0 auto; padding: 0 24px; min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap">
<a href="index.html" style="display: flex; align-items: center; gap: 10px; color: #FFFFFF">
<img src="{A}images/logo.svg" alt="STAR Works" style="height: 40px; width: auto; display: block">
</a>
<nav aria-label="{t(L, "주 메뉴", "Main menu")}" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
{i18n.nav(L, active, file)}
</nav>
</div>
</header>"""


def cta(L, ko="제작·해석이 필요하신가요?", en="Need manufacturing or analysis?", bko="문의하기", ben="Contact Us"):
    return f"""<section style="background: #1E3252; color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 56px 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: space-between">
<h2 style="margin: 0; font-size: 28px; font-weight: 900">{t(L, ko, en)}</h2>
<a href="contact.html" style="padding: 16px 28px; font-size: 16px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">{t(L, bko, ben)}</a>
</div>
</section>"""


def footer(L):
    A = i18n.asset(L)
    foot = "\n".join(f'<p style="margin: 0">{x}</p>' for x in i18n.footer_lines(L))
    return f"""<footer style="background: #16263F; color: #C9D3E0">
<div style="max-width: 1200px; margin: 0 auto; padding: 40px 24px; display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between; font-size: 14px; line-height: 1.8">
<div>
<img src="{A}images/logo.svg" alt="STAR Works" style="height: 34px; width: auto; display: block; margin-bottom: 10px">
{foot}
</div>
<p style="margin: 0; align-self: flex-end">© STARWORKS</p>
</div>
</footer>"""


def redirect(L, target, label, mapjs):
    """옛 주소 → 새 주소 이동 페이지. mapjs: 옛 해시(h)를 새 해시로 바꾸는 JS 식"""
    return f"""<!doctype html>
<html lang="{L}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>{e(label)}</title>
<script>var h=decodeURIComponent(location.hash.slice(1));location.replace("{target}#"+({mapjs}));</script>
<meta http-equiv="refresh" content="0; url={target}">
</head>
<body style="font-family: 'Noto Sans KR', sans-serif; padding: 40px">
<p><a href="{target}">{e(label)} →</a></p>
</body>
</html>
"""


# 언어 버튼(🌐)에 지금 보고 있는 탭·프로그램(#해시)을 붙임 — 다른 언어로 가도 같은 화면
KEEP_HASH_JS = ("function swHash(k){var a=document.querySelector('nav a[hreflang]');"
                "if(a){a.setAttribute('href',a.getAttribute('href').split('#')[0]+(k?'#'+k:''))}}")
