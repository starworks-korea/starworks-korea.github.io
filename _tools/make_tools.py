# 툴 페이지 — tools.html(영어, 기본) + ko/tools.html(한국어)
# 2026-11-27 대표 지시: 여러 프로그램을 골라 쓰기 좋게 — 분류 3개 (18:01 시편 주문과 CAM을 따로 구분)
#   CAD: CAD 뷰어 (2D DWG·DXF + 3D STEP·IGES·STL 통합, DWG 엔진은 tools/dwg/ (LibreDWG, GPL-3.0), 대표 PC 원본 sw_viewer.html 을 tools/ 에 복사해 둠)
#        17:59 지시: 도면은 큰 화면에서 → 아래 창에 끼우지 않고 눌러서 새 창(새 탭)으로 엶 (PROGRAMS 의 "launch")
#   시편 주문: 시편 설계·견적(coupon-tool.html, 따로 둔 페이지)
#   CAM: 조각기 CAM(coupon-tool/cam.html)
#   시편 주문·CAM 은 위에서 누르면 아래 창에서 바로 실행 — 한 번 연 프로그램은 바꿔도 그대로 남음
# 사용: python3 _tools/make_tools.py
#   - tools.html · ko/tools.html 생성
#   - coupon-tool.html · ko/coupon-tool.html 메뉴(툴 굵게)와 embed 모드(툴 페이지 안에서는 사이트 머리글 숨김) 맞춤
# 뷰어 원본이 바뀌면: D:\Dropbox\00-유투브제작\sw_viewer\sw_viewer.html → tools/sw_viewer.html 로 복사 후 push
#   (옛 tools/dxf_viewer.html · tools/cad_viewer.html 은 sw_viewer.html 로 가는 이동 페이지)
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
    {"key": "cad", "name": ("CAD", "CAD"), "sub": ("도면·3D 보기", "Drawings & 3D")},
    {"key": "order", "name": ("시편 주문", "Specimens"), "sub": ("설계·견적·주문", "Design · quote · order")},
    {"key": "cam", "name": ("CAM", "CAM"), "sub": ("조각기 가공", "Router machining")},
]
# src: 루트 기준 경로, both: 영어·한국어 폴더에 같은 이름 파일이 있음(한국어 페이지에서 ../ 안 붙임)
PROGRAMS = [
    # 2026-11-27 대표 지시: DXF 뷰어 + 3D CAD 뷰어 → 통합 「CAD 뷰어」 1개 (원본: 대표 PC 00-유투브제작\\sw_viewer)
    {"key": "viewer", "group": "cad", "name": ("CAD 뷰어 (2D·3D)", "CAD Viewer (2D·3D)"),
     "desc": ("DWG · DXF · STEP · IGES · STL", "DWG · DXF · STEP · IGES · STL"),
     "src": "tools/sw_viewer.html", "launch": True,
     "video": ("https://youtu.be/RU6GZ8yLlcY", "https://youtu.be/diJ3_QjG0ag"),   # 소개 영상(한국어판, 영어판) 2026-11-27
     "points": (("다운로드 · 카카오톡 폴더에서 바로 열기", "여러 장 도면: 시트별 확대", "끝점 기준 치수 재기"),
                ("Open straight from the Downloads folder", "Multi-sheet drawings: jump sheet to sheet", "Endpoint-snap measuring"))},
    {"key": "coupon", "group": "order", "name": ("시편 설계·견적", "Specimen Design"),
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
.tprog .tpx{font-weight:400;margin-left:4px}
.tprog:focus-visible,.topen:focus-visible,.tl-go:focus-visible,.tl-here:focus-visible{outline:3px solid #0070C0;outline-offset:2px}
.topen{margin-left:auto;display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;font-size:14px;font-weight:700;color:#0070C0;border:1px solid #0070C0;border-radius:8px;white-space:nowrap}
.topen:hover{background:#0070C0;color:#FFFFFF}
.stage{flex:1;min-height:0;position:relative;background:#0B1120}
.stage .tload{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:15px}
.tframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:transparent}
.tframe.on{display:block}
.tlaunch{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;overflow:auto;background:#0B1120}
.tlaunch.on{display:flex}
.tl-in{width:100%;max-width:560px;background:#FFFFFF;border-radius:14px;padding:36px 32px;text-align:center;box-sizing:border-box}
.tl-eye{margin:0;font-size:13px;font-weight:900;letter-spacing:2px;color:#0070C0}
.tl-in h1{margin:6px 0 4px;font-size:28px;line-height:1.25;color:#1E3252}
.tl-fmt{margin:0 0 22px;font-size:15px;color:#5A6478}
.tl-go{display:flex;align-items:center;justify-content:center;min-height:64px;padding:10px 20px;border-radius:10px;background:#1E3252;color:#FFFFFF;font-size:20px;font-weight:700}
.tl-go:hover{background:#0070C0}
.tl-here{margin-top:10px;width:100%;min-height:44px;padding:8px 16px;border:1px solid #C9D3E0;border-radius:10px;background:#FFFFFF;color:#1E3252;font:inherit;font-size:15px;cursor:pointer}
.tl-here:hover{border-color:#0070C0;color:#0070C0}
.tl-vid{display:flex;align-items:center;justify-content:center;margin-top:10px;min-height:44px;padding:8px 16px;border-radius:10px;background:#EAF3FB;color:#0B4F8A;font-size:15px;font-weight:700}
.tl-vid:hover{background:#D5E8F8}
.tl-pts{margin:22px 0 0;padding:16px 0 0;border-top:1px solid #DCE1E8;list-style:none;font-size:14px;line-height:1.9;color:#5A6478}
.nojs{padding:24px;color:#FFFFFF}
.nojs a{color:#9CC3E8;text-decoration:underline}
@media (max-width:820px){.hub{height:auto}.stage{flex:none;height:86vh;height:86dvh}.tbar-in{padding:8px 12px;gap:6px}.tbar-in{display:grid;grid-template-columns:repeat(3,1fr);align-items:stretch}.tgrp{flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:4px;min-width:0}.tgl{flex-direction:row;align-items:baseline;gap:6px;padding:0}.tgl b{font-size:13px;white-space:nowrap}.tgl small{display:none}.tprog{flex:1;min-height:44px;padding:6px 6px;align-items:center;text-align:center}.tprog .tpn{font-size:14px;white-space:normal}.tprog .tpd{display:none}.tsep{display:none}.topen{grid-column:1/-1;justify-self:end;margin-left:0;min-height:34px;padding:4px 12px;font-size:13px}.tlaunch{padding:14px;align-items:flex-start}.tl-in{padding:26px 18px}.tl-in h1{font-size:23px}.tl-go{font-size:18px}}
"""

JS = """<script>
(function(){
var PR=@PR@, KEYS=Object.keys(PR), DEF=KEYS[0], cur=null, made={};
var stage=document.getElementById('stage'), open=document.getElementById('topen'), base=document.title;
@KEEP@
function frame(k){var f=document.createElement('iframe');f.className='tframe';f.title=PR[k].name;f.src=PR[k].src;
  f.setAttribute('allow','fullscreen; clipboard-read; clipboard-write');f.setAttribute('allowfullscreen','');stage.appendChild(f);return f}
function show(k){
  if(!PR[k]) k=DEF; if(cur===k) return; cur=k;
  if(!made[k]) made[k]=PR[k].launch?document.getElementById('tl-'+k):frame(k);   // launch: 새 창으로 여는 프로그램 — 아래 창에는 여는 화면
  for(var x in made) made[x].classList.toggle('on',x===k);
  for(var i=0;i<KEYS.length;i++){var b=document.getElementById('tp-'+KEYS[i]),on=KEYS[i]===k;b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1}
  open.href=PR[k].open; open.style.display=PR[k].launch&&made[k].className.indexOf('tlaunch')>=0?'none':'';   // 여는 화면에 큰 버튼이 있으면 오른쪽 버튼은 숨김
  document.title=PR[k].name+' · '+base; swHash(k);
  try{localStorage.setItem('swTool',k)}catch(_){}
}
function route(){
  var OLD={dxf:'viewer',cad3d:'viewer'};   // 옛 주소 #dxf · #cad3d → 통합 뷰어
  var h=decodeURIComponent(location.hash.slice(1)), k=OLD[h]||h;
  if(!PR[k]){try{k=localStorage.getItem('swTool');k=OLD[k]||k}catch(_){k=null}}
  show(PR[k]?k:DEF);
}
window.addEventListener('hashchange',route);
// 새 창으로 여는 프로그램: 위 버튼은 링크(target=_blank)가 새 창을 열고, 여기서는 아래 여는 화면만 맞춤
document.getElementById('tbar').addEventListener('click',function(ev){
  var a=ev.target.closest?ev.target.closest('.tprog[data-launch]'):null; if(a) location.hash=a.id.slice(3);
});
stage.addEventListener('click',function(ev){
  var b=ev.target.closest?ev.target.closest('[data-embed]'):null; if(!b) return;
  var k=b.getAttribute('data-embed'), f=frame(k); made[k].classList.remove('on'); made[k]=f; if(cur===k) f.classList.add('on'); open.style.display='';
});
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
        btns = []
        for p in PROGRAMS:
            if p["group"] != g["key"]:
                continue
            if p.get("launch"):   # 새 창으로 여는 프로그램: 버튼 자체가 새 창 링크
                btns.append(
                    f'<a href="{src(L, p, False)}" target="_blank" rel="noopener" data-launch id="tp-{p["key"]}" class="tprog" role="tab" aria-selected="false" tabindex="-1" aria-controls="stage" title="{t(L, "새 창으로 열기", "Opens in a new window")}">'
                    f'<span class="tpn">{e(p["name"][ix])}<span class="tpx" aria-hidden="true">↗</span></span><span class="tpd">{e(p["desc"][ix])}</span></a>')
            else:
                btns.append(
                    f'<a href="#{p["key"]}" id="tp-{p["key"]}" class="tprog" role="tab" aria-selected="false" tabindex="-1" aria-controls="stage">'
                    f'<span class="tpn">{e(p["name"][ix])}</span><span class="tpd">{e(p["desc"][ix])}</span></a>')
        btns = "\n".join(btns)
        groups.append(f'<div class="tgrp" role="group" aria-label="{e(g["name"][ix])}"><span class="tgl"><b>{e(g["name"][ix])}</b><small>{e(g["sub"][ix])}</small></span>\n{btns}\n</div>')
    gname = {g["key"]: g["name"][ix] for g in GROUPS}
    launch = "\n".join(
        f'<section class="tlaunch" id="tl-{p["key"]}" aria-label="{e(p["name"][ix])}"><div class="tl-in">'
        f'<p class="tl-eye">{e(gname[p["group"]])}</p><h1>{e(p["name"][ix])}</h1><p class="tl-fmt">{e(p["desc"][0])}</p>'
        f'<a class="tl-go" href="{src(L, p, False)}" target="_blank" rel="noopener">{t(L, "새 창에서 크게 열기", "Open full size in a new window")} ↗</a>'
        f'<button type="button" class="tl-here" data-embed="{p["key"]}">{t(L, "이 화면에서 열기", "Open here instead")}</button>'
        + (f'<a class="tl-vid" href="{p["video"][ix]}" target="_blank" rel="noopener">▶ {t(L, "무료 · 소개 영상 보기 (3분) · 설치 방법", "Free · watch the 3-minute intro · how to install")}</a>' if p.get("video") else "") +
        f'<ul class="tl-pts">' + "".join(f"<li>{e(x)}</li>" for x in p.get("points", ((), ()))[ix]) + '</ul>'
        f'</div></section>'
        for p in PROGRAMS if p.get("launch"))
    bar = '\n<span class="tsep" aria-hidden="true"></span>\n'.join(groups)
    pr = {p["key"]: {"name": p["name"][ix], "src": src(L, p), "open": src(L, p, False), **({"launch": 1} if p.get("launch") else {})} for p in PROGRAMS}
    nojs = " · ".join(f'<a href="{src(L, p, False)}">{e(p["name"][ix])}</a>' for p in PROGRAMS)
    title = t(L, "스타웍스 툴", "STAR Works — Tools")
    desc = t(L, "CAD: 2D·3D 통합 뷰어(DWG · DXF · STEP · IGES · STL) / 시편 주문: 설계·견적 / CAM: 조각기 CAM — 설치 없이 브라우저에서 바로",
             "CAD: 2D/3D viewer (DWG · DXF · STEP · IGES · STL) / Specimens: design, quote & order / CAM: router CAM — right in your browser, no install")
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
{launch}
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
    s = i18n.set_icons(s, L)   # 아이콘·매니페스트 줄 (공통)
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
