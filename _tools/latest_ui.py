# 영상 페이지 맨 위 「최신 영상」 1편 — make_lectures.py · make_videos.py 공통
# 2026-11-24 대표 지시: 가장 최근에 올린 영상을 제일 위에 크게, 아래는 지금까지 올린 영상 전부
#   - 페이지 위쪽 공개·회원 공개 목록과 언어 버전 요약은 없앰 (카드마다 붙은 표기는 그대로)
#   - 숨김(hide)·비공개 영상은 고르지 않음 (비공개는 json에 들어오지 않음)
#   - 한국어 페이지는 한국어판(ko_id)이 있으면 그 영상을 보여 줌 (특집과 같은 기준, 2026-11-22)
import html
import i18n
from i18n import t, tr

e = html.escape
F = "font-family: 'Noto Sans KR', sans-serif"
VISC = {"공개": "#22C55E", "일부 공개": "#F59E0B"}

CSS = (".latest{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr)}"
       ".ltbtn:hover{background:#005a9c !important;color:#FFFFFF}"
       ".ltbtn:focus-visible{outline:3px solid #1E3252;outline-offset:2px}"
       "@media (max-width:820px){.latest{grid-template-columns:1fr !important}}")


def pick(items):
    """가장 최근 업로드 1편 — 날짜가 같으면 json에서 뒤에 있는 항목(나중에 넣은 것)"""
    items = [v for v in items if not v.get("hide") and v.get("vis", "공개") in ("공개", "일부 공개")]
    if not items:
        return None
    return max(enumerate(items), key=lambda p: (p[1]["date"], p[0]))[1]


def block(L, v, name, color):
    """v: json 항목, name: 분류 이름(강의는 '분야 번호'), color: 분류 색"""
    vid = (v.get("ko_id") if L == "ko" else "") or v["id"]
    title = tr(v, "title", L)
    vis = v.get("vis", "공개")
    return f"""<section aria-label="{t(L, "최신 영상", "Latest video")}" style="max-width: 1200px; margin: 0 auto; padding: 40px 24px 0">
<article class="latest" style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252"><iframe src="https://www.youtube-nocookie.com/embed/{vid}" title="{e(title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0"></iframe></div>
<div style="padding: 24px 26px; display: flex; flex-direction: column; gap: 12px; justify-content: center">
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
<span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 900; color: #FFFFFF; background: #0070C0; border-radius: 4px">{t(L, "최신 영상", "LATEST")}</span>
<span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: {color}; border-radius: 999px">{e(name)}</span>
</div>
<h2 style="margin: 0; font-size: 24px; font-weight: 900; line-height: 1.35; color: #1E3252">{e(title)}</h2>
<p style="margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 14px; color: #5A6478"><time datetime="{v["date"]}">{t(L, "업로드", "Uploaded")} {i18n.date_fmt(L, v["date"])}</time><span style="display: inline-flex; align-items: center; gap: 6px"><span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 50%; background: {VISC.get(vis, '#9CA3AF')}; display: inline-block"></span>{i18n.VISLABEL[L].get(vis, vis)}</span><span>{e(v.get("dur", ""))}</span></p>
<a class="ltbtn" href="https://youtu.be/{vid}" target="_blank" rel="noopener" style="align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 12px 22px; font-size: 16px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 6px">{t(L, "유튜브에서 보기", "Watch on YouTube")} ↗</a>
</div>
</article>
</section>
"""
