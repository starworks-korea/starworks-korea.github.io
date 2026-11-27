# 플레이리스트 「강의」 탭 — lectures.json → 탭 내용 (2026-11-27 대표 지시: 영상 4페이지 → 플레이리스트 1페이지)
# 사용: python3 _tools/make_lectures.py   (= make_playlist.py — playlist.html 영어·한국어 다시 생성)
#   옛 lectures.html 은 playlist.html#lectures 로 가는 이동 페이지 (make_playlist.py가 만듦)
import html, sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import i18n, reviews_ui, latest_ui
from i18n import t, tr

D = json.load(open(os.path.join(HERE, "lectures.json"), encoding="utf-8"))
F = "font-family: 'Noto Sans KR', sans-serif"
e = html.escape
VISC = {"공개": "#22C55E", "일부 공개": "#F59E0B"}
LCLASS = {"원본": "lg-o", "더빙": "lg-d", "자동": "lg-a", "": "lg-n"}
ETC_ORDER = ["원본", "더빙", "자동"]
PFX = "lectures-"   # 한 페이지에 4탭이 모이므로 id 앞에 탭 이름
SERIES_KO, SERIES_EN = "AI 에이전트 유한요소 해석", "Finite Element Analysis with AI Agents"
REV = D.get("review_api", "").strip()   # 리뷰 저장소(앱스 스크립트 웹 앱) 주소 — 비면 리뷰 UI 없음

def etc_state(lg):
    etc = lg.get("etc") or {}
    for st in ETC_ORDER:
        if etc.get(st): return st
    return ""
def etc_names(lg):
    etc = lg.get("etc") or {}
    return [n for st in ETC_ORDER for n in etc.get(st, [])]

def build(L):
    FIELDS = [(f["key"], tr(f, "name", L), f["color"], tr(f, "desc", L)) for f in D["fields"]]
    V = {k: [] for k, *_ in FIELDS}
    for v in sorted(D["videos"], key=lambda x: x["num"]):
        V[v["field"]].append((v["id"], tr(v, "title", L), v["dur"], v["date"], v.get("vis", "공개"), v.get("lang", {"ko": "원본"})))
    EX = D.get("examples", {"title": "", "desc": "", "fields": [], "videos": []})
    EXF = [(f["key"], tr(f, "name", L), f["color"], tr(f, "desc", L)) for f in EX["fields"]]
    EV = {k: [] for k, *_ in EXF}
    for v in sorted(EX["videos"], key=lambda x: x["num"]):
        EV[v["field"]].append((v["id"], tr(v, "title", L), v["dur"], v["date"], v.get("vis", "공개"), v.get("lang", {"ko": "원본"})))
    total = sum(len(v) for v in V.values())
    extotal = sum(len(v) for v in EV.values())
    VL = i18n.VISLABEL[L]; LS = i18n.LSTATE[L]; LN = i18n.LANG_NAMES[L]
    A = i18n.asset(L)
    ln = lambda n: i18n.lang_name(L, n)
    cnt = lambda n: t(L, f"{n}편", f"{n} video" + ("" if n == 1 else "s"))

    def chip(k, n, c, num, dashed=False):
        bd = "1px dashed #8A96A8" if dashed else "1px solid #C9D3E0"
        return f'<a href="#{PFX}{k}" style="display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 18px; {F}; font-size: 15px; font-weight: 700; border-radius: 999px; background: #FFFFFF; color: #1E3252; border: {bd}"><span aria-hidden="true" style="width: 10px; height: 10px; border-radius: 50%; background: {c}; display: inline-block"></span>{e(n)} <span style="font-weight: 500; color: #5A6478">{num}</span></a>'
    chips = "\n".join(chip(k, n, c, len(V[k])) for k, n, c, _ in FIELDS if V[k])
    chips_ex = "\n".join(chip(k, n, c, len(EV[k]), True) for k, n, c, _ in EXF if EV[k])

    def lang_chips(lg):
        out = "".join(f'<span class="lg {LCLASS.get(lg.get(k, ""), "lg-n")}" title="{n}: {LS.get(lg.get(k, ""), LS[""])}">{n}</span>' for k, n in LN)
        names = [ln(x) for x in etc_names(lg)]; st = etc_state(lg)
        other = t(L, "기타", "Other")
        if names:
            label = t(L, f"기타 {len(names)}개", f"Other {len(names)}") if len(names) > 1 else f"{other} · {names[0]}"
            out += f'<span class="lg {LCLASS[st]}" title="{other} — {LS[st]}: {" · ".join(names)}">{label}</span>'
        else:
            out += f'<span class="lg lg-n" title="{other}: {LS[""]}">{other}</span>'
        return out

    def card(name, color, num, vid, title, dur, date, vis, lg):
        a = f'''<a href="https://youtu.be/{vid}" target="_blank" rel="noopener" class="vcard" style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column">
<div style="position: relative; aspect-ratio: 16 / 9; background: #1E3252">
<img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{e(name)} {num} {t(L, "썸네일", "thumbnail")}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block">
<span style="position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; {F}; font-size: 12px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px"><span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 50%; background: {VISC.get(vis, '#9CA3AF')}; display: inline-block"></span>{VL.get(vis, vis)}</span>
<span style="position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: rgba(0,0,0,0.78); border-radius: 4px">{dur}</span>
</div>
<div style="padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px"><span style="padding: 3px 10px; {F}; font-size: 13px; font-weight: 700; color: #FFFFFF; background: {color}; border-radius: 999px">{e(name)} {num}</span><time datetime="{date}" style="{F}; font-size: 13px; color: #5A6478">{t(L, "업로드", "Uploaded")} {i18n.date_fmt(L, date)}</time></div>
<h3 style="margin: 0; font-size: 17px; font-weight: 700; line-height: 1.45; color: #1E3252">{e(title)}</h3>
<div class="lgrow" aria-label="{t(L, "언어 버전", "Language versions")}">{lang_chips(lg)}</div>
<span style="margin-top: auto; padding-top: 4px; font-size: 14px; font-weight: 700; color: #0070C0">{t(L, "유튜브에서 보기", "Watch on YouTube")} ↗</span>
</div>
</a>'''
        if not REV: return a
        # 리뷰 버튼 (카드 아래) — 누르면 아래 rvdlg 창이 열림
        return f'''<div class="vitem">
{a}
<button type="button" class="rvbtn" data-vid="{vid}" data-title="{e(name)} {num} · {e(title)}" aria-haspopup="dialog"><span aria-hidden="true">💬</span> {t(L, "리뷰", "Reviews")} <span class="rvn"></span><span class="rvgo">{t(L, "쓰기", "Write")} ›</span></button>
</div>'''

    def section_list(fields, vids):
        out = []
        for k, n, c, desc in fields:
            if not vids[k]: continue
            cards = "\n".join(card(n, c, i + 1, *v) for i, v in enumerate(vids[k]))
            out.append(f'''<section id="{PFX}{k}" class="plsec" style="margin-bottom: 48px">
<div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-left: 14px; border-left: 6px solid {c}">
<h2 style="margin: 0; font-size: 24px; font-weight: 900; color: #1E3252">{e(n)}</h2>
<span style="font-size: 14px; font-weight: 700; color: #0070C0">{cnt(len(vids[k]))}</span>
<span style="font-size: 14px; color: #5A6478">{e(desc)}</span>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px">
{cards}
</div>
</section>''')
        return out
    sections = section_list(FIELDS, V)
    ex_sections = section_list(EXF, EV)

    # 위쪽 공개·회원 공개 목록과 언어 버전 요약은 없앰 (대표 지시 2026-11-24) — 카드마다 붙은 표기는 그대로
    # 맨 위 최신 영상 1편 (강의 + 해석 기초 예제 중 가장 최근 업로드)
    NAME = {k: (n, c) for k, n, c, _ in FIELDS + EXF}
    lv = latest_ui.pick(D["videos"] + EX["videos"])
    latest_html = latest_ui.block(L, lv, f'{NAME[lv["field"]][0]} {lv["num"]}', NAME[lv["field"]][1]) if lv else ""

    series = t(L, SERIES_KO, SERIES_EN)
    rv_css, rv_html = reviews_ui.ui(L, REV)
    intro = t(L, f"경북대학교 김영석 교수 · 스타웍스 신동우 · 강의 영상 {total}편 · 해석 기초 예제 {extotal}편",
              f"Prof. Young-Suk Kim, Kyungpook National University · Dong-Woo Shin, STAR Works · {total} lectures · {extotal} basic examples")
    body = f'''{latest_html}
<section style="max-width: 1200px; margin: 0 auto; padding: 32px 24px 24px">
<nav aria-label="{t(L, "분야 바로 가기", "Jump to a field")}" style="display: flex; flex-wrap: wrap; gap: 8px">
{chips}
{chips_ex}
</nav>
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 16px 24px 32px">
{chr(10).join(sections)}
</section>

<section id="{PFX}examples" class="plsec" style="max-width: 1200px; margin: 0 auto; padding: 0 24px 32px">
<div style="border-top: 1px solid #C9D3E0; padding-top: 32px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px">
<p style="margin: 0; {F}; font-size: 13px; letter-spacing: 2px; color: #5A6478">EXAMPLES</p>
<h2 style="margin: 0; font-size: 30px; font-weight: 900; color: #1E3252">{e(tr(EX, "title", L))}</h2>
<p style="margin: 0; font-size: 15px; color: #4A5568">{e(tr(EX, "desc", L))}</p>
</div>
{chr(10).join(ex_sections)}
</section>

<section style="max-width: 1200px; margin: 0 auto; padding: 0 24px 72px">
<div style="background: #FFFFFF; border: 1px solid #DCE1E8; border-radius: 8px; padding: 24px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between">
<div style="display: flex; flex-direction: column; gap: 6px">
<p style="margin: 0; {F}; font-size: 13px; letter-spacing: 2px; color: #5A6478">{t(L, "교재", "TEXTBOOK")}</p>
<h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #1E3252">{t(L, "「소성역학과 응용」 2nd Ed. (2023)", "Plasticity and Its Applications (「소성역학과 응용」), 2nd Ed. (2023)")}</h2>
<p style="margin: 0; font-size: 15px; color: #4A5568">{t(L, "김영석 지음 · 시그마프레스 · 영문판 출간 예정", "By Young-Suk Kim · Sigma Press · Korean edition — English edition coming soon")}</p>
</div>
<a href="https://ridibooks.com/books/2224000497" target="_blank" rel="noopener" style="padding: 14px 22px; font-size: 15px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">{t(L, "리디북스 전자책", "e-Book on RIDIBOOKS")} ↗</a>
</div>
</section>'''
    return {"key": "lectures", "tab": t(L, "강의", "Lectures"), "eyebrow": "LECTURES",
            "title": series, "intro": intro, "count": total + extotal, "body": body,
            "css": rv_css, "extra": rv_html, "updated": D["updated"]}


if __name__ == "__main__":
    import make_playlist
    make_playlist.main()
