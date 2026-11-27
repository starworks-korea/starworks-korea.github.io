# 플레이리스트 페이지 — playlist.html(영어, 기본) + ko/playlist.html(한국어)
# 2026-11-27 대표 지시: 영상 페이지 4개(강의·기술·이야기·홍보)를 「플레이리스트」 1개로 —
#   위에서 탭을 고르면 아래 창만 바뀜
# 사용: python3 _tools/make_playlist.py  (make_lectures.py · make_videos.py 로 실행해도 같음)
#   내용: lectures.json(강의 탭) + videos.json(기술·이야기·홍보 탭) — json 형식은 그대로
#   옛 주소 lectures.html · tech.html · stories.html · promo.html (영어·한국어)는
#   playlist.html#탭 으로 가는 이동 페이지로 다시 씀 (유튜브 설명란 옛 링크 보호)
import os, sys, json, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import i18n, page_shell as PS
from i18n import t

e = html.escape
F = PS.F
FILE = "playlist.html"
ORDER = ["lectures", "tech", "stories", "promo"]   # 대표 지시 순서: 강의 · 기술 · 이야기 · 홍보
OLD = {"lectures": "lectures.html", "tech": "tech.html", "stories": "stories.html", "promo": "promo.html"}

TAB_CSS = """
.pltabs{position:sticky;top:0;z-index:30;background:rgba(244,246,249,.96);backdrop-filter:blur(6px);border-bottom:1px solid #DCE1E8}
.pltabs-in{max-width:1200px;margin:0 auto;padding:12px 24px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.pltabs-in::-webkit-scrollbar{display:none}
.pltab{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:10px 22px;border-radius:999px;border:1px solid #C9D3E0;background:#FFFFFF;color:#1E3252;font-size:17px;font-weight:700;white-space:nowrap;cursor:pointer}
.pltab-c{font-size:13px;font-weight:700;color:#5A6478;background:#EDF2F7;border-radius:999px;padding:1px 9px}
.pltab:hover{border-color:#0070C0;color:#0070C0}
.pltab[aria-selected="true"]{background:#1E3252;border-color:#1E3252;color:#FFFFFF}
.pltab[aria-selected="true"] .pltab-c{background:rgba(255,255,255,.18);color:#FFFFFF}
.pltab:focus-visible{outline:3px solid #0070C0;outline-offset:2px}
.js .plpanel:not(.on){display:none}
.plsec{scroll-margin-top:88px}
.plintro{max-width:1200px;margin:0 auto;padding:36px 24px 0;display:flex;flex-direction:column;gap:8px}
@media (max-width:600px){.pltabs-in{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px 12px}.pltab{justify-content:center;gap:5px;padding:8px 4px;font-size:15px;min-height:44px}.pltab-c{font-size:11px;padding:0 6px}.plintro h2{font-size:26px !important}}
"""

JS = """<script>
(function(){
var KEYS=@KEYS@, DEF=KEYS[0], cur=null;
var bar=document.getElementById('pltabs');
function P(k){return document.getElementById('panel-'+k)}
function T(k){return document.getElementById('tab-'+k)}
@KEEP@
function frames(p){var f=p.querySelectorAll('iframe[data-src]');for(var i=0;i<f.length;i++){f[i].src=f[i].getAttribute('data-src');f[i].removeAttribute('data-src')}}
function show(k){
  if(KEYS.indexOf(k)<0) k=DEF; if(cur===k) return; cur=k;
  for(var i=0;i<KEYS.length;i++){var x=KEYS[i],on=x===k,p=P(x),b=T(x);p.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1}
  frames(P(k)); swHash(k);
}
function toBar(){var y=bar.getBoundingClientRect().top+window.pageYOffset;if(window.pageYOffset>y+1) window.scrollTo(0,y)}
function route(user){
  var h=decodeURIComponent(location.hash.slice(1));
  if(KEYS.indexOf(h)>=0){show(h); if(user) toBar(); return}
  var el=h&&document.getElementById(h), p=el&&el.closest?el.closest('.plpanel'):null;
  if(p){show(p.getAttribute('data-key')); el.scrollIntoView(); return}
  show(DEF);
}
window.addEventListener('hashchange',function(){route(true)});
bar.addEventListener('keydown',function(ev){
  var i=KEYS.indexOf(cur),n=null;
  if(ev.key==='ArrowRight') n=KEYS[(i+1)%KEYS.length]; else if(ev.key==='ArrowLeft') n=KEYS[(i+KEYS.length-1)%KEYS.length];
  else if(ev.key==='Home') n=KEYS[0]; else if(ev.key==='End') n=KEYS[KEYS.length-1];
  if(n){ev.preventDefault();location.hash=n;T(n).focus()}
});
route(false);
})();
</script>"""


def tabs_and_panels(L):
    import make_lectures as ML, make_videos as MV
    parts = {"lectures": ML.build(L)}
    for P in MV.D["pages"]:
        parts[P["key"]] = MV.build(P, L)
    order = [k for k in ORDER if k in parts] + [k for k in parts if k not in ORDER]
    return order, parts


def build(L):
    import make_videos as MV
    order, parts = tabs_and_panels(L)
    total = sum(parts[k]["count"] for k in order)
    updated = max(parts[k]["updated"] for k in order)
    tabs = "\n".join(
        f'<a href="#{k}" role="tab" id="tab-{k}" class="pltab" aria-controls="panel-{k}" aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}">'
        f'<span>{e(parts[k]["tab"])}</span><span class="pltab-c">{parts[k]["count"]}</span></a>'
        for i, k in enumerate(order))
    panels = []
    for i, k in enumerate(order):
        p = parts[k]
        body = p["body"].replace('<iframe src="', '<iframe data-src="')   # 유튜브 창은 탭을 열 때 불러옴
        panels.append(f"""<div id="panel-{k}" class="plpanel{" on" if i == 0 else ""}" role="tabpanel" aria-labelledby="tab-{k}" data-key="{k}">
<section class="plintro">
<p style="margin: 0; {F}; font-size: 13px; letter-spacing: 2px; color: #5A6478">{e(p["eyebrow"])}</p>
<h2 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -0.5px; color: #1E3252">{e(p["title"])}</h2>
<p style="margin: 0; font-size: 16px; color: #4A5568">{e(p["intro"])}</p>
</section>
{body}
</div>""")
    names = " · ".join(parts[k]["tab"] for k in order)
    cnt = t(L, f"영상 {total}편", f"{total} videos")
    title = t(L, "스타웍스 플레이리스트", "STAR Works — Playlist")
    desc = t(L, f"{names} — {cnt}", f"{names} — {cnt}")
    css = MV.CSS + """.cf{background-color:#1E3252}.grid-bg{background-color:#1E3252}\n""" + TAB_CSS + \
        "".join(parts[k]["css"] + "\n" for k in order if parts[k]["css"])
    extra = "".join(parts[k]["extra"] + "\n" for k in order if parts[k]["extra"])
    js = JS.replace("@KEYS@", json.dumps(order)).replace("@KEEP@", PS.KEEP_HASH_JS)
    page = PS.head(L, FILE, title, desc, css, early_js="<script>document.documentElement.classList.add('js')</script>\n") + f"""
<body>
<div style="width: 100%; {F}; color: #1E3252; background: #F4F6F9">

{PS.header(L, FILE)}

<section style="background: #1E3252; color: #FFFFFF">
<div style="max-width: 1200px; margin: 0 auto; padding: 48px 24px 40px; display: flex; flex-direction: column; gap: 12px">
<p style="margin: 0; {F}; font-size: 14px; letter-spacing: 2px; color: #9CC3E8">PLAYLIST</p>
<h1 style="margin: 0; font-size: 46px; font-weight: 900; letter-spacing: -1px">{t(L, "플레이리스트", "Playlist")}</h1>
<p style="margin: 0; font-size: 18px; color: #C9D3E0">{e(names)} · {cnt}</p>
<p style="margin: 0; font-size: 14px; color: #9CC3E8">{t(L, "최근 갱신", "Last updated")} {updated} {t(L, "", "(KST)")}</p>
</div>
</section>

<div class="pltabs" id="pltabs">
<div class="pltabs-in" role="tablist" aria-label="{t(L, "플레이리스트 분류", "Playlist categories")}">
{tabs}
</div>
</div>

{chr(10).join(panels)}

{PS.cta(L)}

{PS.footer(L)}

</div>
{extra}{js}
</body>
</html>
"""
    return page, {k: parts[k]["count"] for k in order}


def old_pages(L):
    """옛 영상 페이지 → playlist.html#탭 (옛 분류 해시 #rubber → #lectures-rubber)"""
    for k, f in OLD.items():
        label = t(L, "스타웍스 플레이리스트", "STAR Works — Playlist")
        mapjs = f'h?"{k}-"+h:"{k}"'
        out = PS.redirect(L, FILE, label, mapjs)
        path = os.path.join(ROOT, f) if L == "en" else os.path.join(ROOT, "ko", f)
        open(path, "w", encoding="utf-8").write(out)


def main():
    for L, path in (("en", os.path.join(ROOT, FILE)), ("ko", os.path.join(ROOT, "ko", FILE))):
        page, counts = build(L)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w", encoding="utf-8").write(page)
        old_pages(L)
        print(L, path.replace(ROOT, "").lstrip("/"), counts)


if __name__ == "__main__":
    main()
