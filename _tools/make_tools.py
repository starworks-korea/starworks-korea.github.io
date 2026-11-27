# 툴 페이지 — tools.html(영어, 기본) + ko/tools.html(한국어)
# 2026-11-27 대표 지시: 툴은 CAD · CAM 두 분류, 여러 프로그램을 골라 쓰기 좋게
#   CAD: DXF 뷰어 · 3D CAD 뷰어 (대표 PC 원본을 tools/ 에 복사해 둠)
#   CAM: 시편 설계·견적(coupon-tool.html, 따로 둔 페이지) · 조각기 CAM(coupon-tool/cam.html)
#   위에서 프로그램을 누르면 아래 창에서 바로 실행 — 한 번 연 프로그램은 바꿔도 그대로 남음(열어 둔 도면 유지)
# 사용: python3 _tools/make_tools.py
#   - tools.html · ko/tools.html 생성
#   - coupon-tool.html · ko/coupon-tool.html 메뉴(툴 굵게)와 embed 모드(툴 페이지 안에서는 사이트 머리글 숨김) 맞춤
# 뷰어 원본이 바뀌면: D:\Dropbox\00-유투브제작\dxf_viewer\dxf_viewer.html → tools/dxf_viewer.html,
#                     D:\Dropbox\00-유투브제작\cad_viewer.html → tools/cad_viewer.html 로 복사 후 push
import os, re, sys, json, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import i18n, page_shell as PS
from i18n import t

e = html.escape
F = PS.F
FILE = "tools.html"

GROUPS = [
    {"key": "cad", "name": "CAD", "sub": ("도면·3D 보기", "Drawings & 3D")},
    {"key": "cam", "name": "CAM", "sub": ("조각기 시편", "Router specimens")},
]
# src: 루트 기준 경로, both: 영어·한국어 폴더에 같은 이름 파일이 있음(한국어 페이지에서 ../ 안 붙임)
PROGRAMS = [
    {"key": "dxf", "group": "cad", "name": ("DXF 뷰어", "DXF Viewer"),
     "desc": ("2D 도면 · 치수 강조 · 도면 중첩", "2D drawings · dims · KR UI"),
     "src": "tools/dxf_viewer.html"},
    {"key": "cad3d", "group": "cad", "name": ("3D CAD 뷰어", "3D CAD Viewer"),
     "desc": ("STEP · IGES · STL · 어셈블리 · 분해도", "STEP · IGES · STL · KR UI"),
     "src": "tools/cad_viewer.html"},
    {"key": "coupon", "group": "cam", "name": ("시편 설계·견적", "Specimen Design"),
     "desc": ("물성 예상 · 재단 배치 · 주문", "Properties · nesting · order"),
     "src": "coupon-tool.html", "embed": "?embed=1", "both": True},
    {"key": "cam", "group": "cam", "name": ("조각기 CAM", "Router CAM"),
     "desc": ("RichAuto 시편 가공 · NC · 시뮬레이션", "RichAuto · NC · simulation"),
     "src": "coupon-tool/cam.html"},
]

CSS = """body{margin:0;background:#F4F6F9;word-break:keep-all;overflow-wrap:anywhere}
a{color:inherit;text-decoration:none}
.hub{display:flex;flex-direction:column;height:100vh;height:100dvh}
.tbar{background:#FFFFFF;border-bottom:1px solid #DCE1E8;flex:none}
.tbar-in{max-width:1200px;margin:0 auto;padding:10px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px}
.tgrp{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tgl{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;padding-right:2px}
.tgl b{font-size:15px;font-weight:900;letter-spacing:1px;color:#1E3252}
.tgl small{font-size:11px;color:#5A6478}
.tsep{width:1px;align-self:stretch;background:#DCE1E8}
.tprog{display:inline-flex;flex-direction:column;justify-content:center;min-height:48px;padding:6px 16px;border:1px solid #C9D3E0;border-radius:8px;background:#FFFFFF;color:#1E3252;cursor:pointer}
.tprog .tpn{font-size:15px;font-weight:700;white-space:nowrap}
.tprog .tpd{font-size:12px;color:#5A6478;white-space:nowrap}
.tprog:hover{border-color:#0070C0;color:#0070C0}
.tprog[aria-selected="true"]{background:#1E3252;border-color:#1E3252;color:#FFFFFF}
.tprog[aria-selected="true"] .tpd{color:#C9D3E0}
.tprog:focus-visible,.topen:focus-visible{outline:3px solid #0070C0;outline-offset:2px}
.topen{margin-left:auto;display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;font-size:14px;font-weight:700;color:#0070C0;border:1px solid #0070C0;border-radius:8px;white-space:nowrap}
.topen:hover{background:#0070C0;color:#FFFFFF}
.stage{flex:1;min-height:0;position:relative;background:#0B1120}
.stage .tload{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:15px}
.tframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:transparent}
.tframe.on{display:block}
.nojs{padding:24px;color:#FFFFFF}
.nojs a{color:#9CC3E8;text-decoration:underline}
@media (max-width:820px){.hub{height:auto}.stage{flex:none;height:86vh;height:86dvh}.tbar-in{padding:8px 12px;gap:6px}.tgrp{width:100%;display:grid;grid-template-columns:64px 1fr 1fr;gap:6px}.tprog{min-height:40px;padding:6px 8px;align-items:center;text-align:center}.tprog .tpn{font-size:14px;white-space:normal}.tprog .tpd{display:none}.tsep{display:none}.topen{min-height:34px;padding:4px 12px;font-size:13px}}
"""

JS = """<script>
(function(){
var PR=@PR@, KEYS=Object.keys(PR), DEF=KEYS[0], cur=null, made={};
var stage=document.getElementById('stage'), open=document.getElementById('topen'), base=document.title;
@KEEP@
function show(k){
  if(!PR[k]) k=DEF; if(cur===k) return; cur=k;
  if(!made[k]){var f=document.createElement('iframe');f.className='tframe';f.title=PR[k].name;f.src=PR[k].src;
    f.setAttribute('allow','fullscreen; clipboard-read; clipboard-write');f.setAttribute('allowfullscreen','');stage.appendChild(f);made[k]=f}
  for(var x in made) made[x].classList.toggle('on',x===k);
  for(var i=0;i<KEYS.length;i++){var b=document.getElementById('tp-'+KEYS[i]),on=KEYS[i]===k;b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1}
  open.href=PR[k].open; document.title=PR[k].name+' · '+base; swHash(k);
  try{localStorage.setItem('swTool',k)}catch(_){}
}
function route(){
  var h=decodeURIComponent(location.hash.slice(1)), k=h;
  if(!PR[k]){try{k=localStorage.getItem('swTool')}catch(_){k=null}}
  show(PR[k]?k:DEF);
}
window.addEventListener('hashchange',route);
document.getElementById('tbar').addEventListener('keydown',function(ev){
  var i=KEYS.indexOf(cur),n=null;
  if(ev.target.className.indexOf('tprog')<0) return;
  if(ev.key==='ArrowRight') n=KEYS[(i+1)%KEYS.length]; else if(ev.key==='ArrowLeft') n=KEYS[(i+KEYS.length-1)%KEYS.length];
  if(n){ev.preventDefault();location.hash=n;document.getElementById('tp-'+n).focus()}
});
route();
})();
</script>"""


def src(L, p, embed=True):
    s = p["src"] if p.get("both") else i18n.asset(L) + p["src"]
    return s + (p.get("embed", "") if embed else "")


def build(L):
    ix = 0 if L == "ko" else 1
    groups = []
    for g in GROUPS:
        btns = "\n".join(
            f'<a href="#{p["key"]}" id="tp-{p["key"]}" class="tprog" role="tab" aria-selected="false" tabindex="-1" aria-controls="stage">'
            f'<span class="tpn">{e(p["name"][ix])}</span><span class="tpd">{e(p["desc"][ix])}</span></a>'
            for p in PROGRAMS if p["group"] == g["key"])
        groups.append(f'<div class="tgrp" role="group" aria-label="{g["name"]}"><span class="tgl"><b>{g["name"]}</b><small>{e(g["sub"][ix])}</small></span>\n{btns}\n</div>')
    bar = '\n<span class="tsep" aria-hidden="true"></span>\n'.join(groups)
    pr = {p["key"]: {"name": p["name"][ix], "src": src(L, p), "open": src(L, p, False)} for p in PROGRAMS}
    nojs = " · ".join(f'<a href="{src(L, p, False)}">{e(p["name"][ix])}</a>' for p in PROGRAMS)
    title = t(L, "스타웍스 툴", "STAR Works — Tools")
    desc = t(L, "CAD: DXF 뷰어 · 3D CAD 뷰어 / CAM: 시편 설계·견적 · 조각기 CAM — 설치 없이 브라우저에서 바로",
             "CAD: DXF viewer · 3D CAD viewer / CAM: specimen design & quote · router CAM — right in your browser, no install")
    js = JS.replace("@PR@", json.dumps(pr, ensure_ascii=False)).replace("@KEEP@", PS.KEEP_HASH_JS)
    return PS.head(L, FILE, title, desc, CSS, robots="") + f"""
<body>
<div style="width: 100%; {F}; color: #1E3252; background: #F4F6F9">
<div class="hub">
{PS.header(L, FILE)}
<div class="tbar" id="tbar">
<div class="tbar-in" role="tablist" aria-label="{t(L, "프로그램 선택", "Choose a program")}">
{bar}
<a class="topen" id="topen" href="{src(L, PROGRAMS[0], False)}" target="_blank" rel="noopener">{t(L, "새 창으로 열기", "Open in new window")} ↗</a>
</div>
</div>
<main class="stage" id="stage" aria-live="polite">
<div class="tload">{t(L, "프로그램을 불러오는 중…", "Loading the program…")}</div>
<noscript><div class="nojs" style="position: relative">{nojs}</div></noscript>
</main>
</div>
{PS.footer(L)}
</div>
{js}
</body>
</html>
"""


EMBED = ('<script>if(/[?&]embed=1/.test(location.search))document.documentElement.classList.add("embed")</script>\n'
         '<style>.embed body>header{display:none}</style>\n')


def fix_coupon(L):
    """시편 설계 페이지: 메뉴는 「툴」 굵게, 툴 페이지 안(embed=1)에서는 사이트 머리글 숨김"""
    p = os.path.join(ROOT, "coupon-tool.html") if L == "en" else os.path.join(ROOT, "ko", "coupon-tool.html")
    s = open(p, encoding="utf-8").read()
    s = re.sub(r'(<nav aria-label=")[^"]*("[^>]*>).*?(</nav>)',
               lambda m: m.group(1) + t(L, "주 메뉴", "Main menu") + m.group(2) + "\n" + i18n.nav(L, FILE, "coupon-tool.html") + "\n" + m.group(3),
               s, count=1, flags=re.S)
    if 'classList.add("embed")' not in s:
        s = s.replace("</head>", EMBED + "</head>", 1)
    open(p, "w", encoding="utf-8").write(s)


def main():
    for L, path in (("en", os.path.join(ROOT, FILE)), ("ko", os.path.join(ROOT, "ko", FILE))):
        open(path, "w", encoding="utf-8").write(build(L))
        fix_coupon(L)
        print(L, path.replace(ROOT, "").lstrip("/"), "ok")


if __name__ == "__main__":
    main()
