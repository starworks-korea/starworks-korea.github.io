# 사이트 아이콘 만들기 — 바탕화면 바로가기·브라우저 탭·휴대폰 홈 화면에 스타웍스 로고가 나오게
# 2026-11-27 대표 지시. 원본은 images/logo.svg (별 마크 + STAR Works 글자) — 그 경로를 그대로 씀
# 사용: python3 _tools/make_icons.py   (playwright + 크롬, Pillow 필요 — 로고가 바뀔 때만 다시 실행)
#   images/icons/icon.svg                 작은 것(별 마크만) 벡터 — 브라우저 탭
#   images/icons/icon-48 · 64.png         작은 것
#   images/icons/icon-96 … 512.png        큰 것(별 마크 + STAR Works) — 바탕화면·시작 메뉴
#   images/icons/maskable-192 · 512.png   안드로이드용(가장자리가 잘려도 로고가 남게 여백 넓힘)
#   images/icons/apple-touch-icon.png     아이폰용 180 (모서리는 아이폰이 둥글림)
#   favicon.ico                           16 · 32 · 48 (아이콘 줄이 없는 페이지도 이 파일로 표시됨)
#   제품 설치 아이콘(PRODUCTS 표) = 스타웍스 로고 + 아래 띠(제품 글자·색)
#     tools/icons/viewer-*.png              CAD 뷰어 — 하늘 띠 "CAD" (2026-11-27 대표 지시: 설치해도 스타웍스 로고가 보이게)
#     tools/office/web/icons/doc-*.png      오피스 뷰어 — 초록 띠 "OFFICE" (2026-11-28 대표 지시: CAD 와 헷갈리지 않게)
#     CAM(주황)·CAE(보라)·CAD-PRO(금색 띠 + 남색 글자, 안티그래비티 개발 중)는 예약 — 프로그램이 생기면 PRODUCTS 의 출력 폴더만 채움
import asyncio, io, os, re
from playwright.async_api import async_playwright
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "images", "icons")
NAVY = "#1E3252"
SRC = open(os.path.join(ROOT, "images", "logo.svg"), encoding="utf-8").read()
STAR_T, WORKS_T, MARK = [x if x.endswith("/>") else x[:-1] + "/>" for x in re.findall(r"<path[^>]*?>", SRC)]
MB = (342.8, 0.0, 170.0, 167.26)       # 별 마크가 차지하는 칸 (logo.svg 좌표)
TB = (3.14, 43.88, 297.38, 146.83)     # STAR + Works 글자가 차지하는 칸


def place(inner, bb, x, y, w):
    s = w / bb[2]
    return f'<g transform="translate({x - bb[0] * s:.3f} {y - bb[1] * s:.3f}) scale({s:.5f})" fill="#FFFFFF">{inner}</g>'


def icon(kind, rx=92, k=1.0):
    """kind A = 별 마크만, B = 별 마크 + STAR Works. rx = 모서리 둥글기(0 = 각짐), k = 로고 크기 비율"""
    bg = f'<rect width="512" height="512" rx="{rx}" fill="{NAVY}"/>'
    if kind == "A":
        w = 330 * k
        body = place(MARK, MB, (512 - w) / 2, (512 - w * MB[3] / MB[2]) / 2, w)
    else:
        mw, tw, gap = 200 * k, 300 * k, 26 * k
        mh, th = mw * MB[3] / MB[2], tw * TB[3] / TB[2]
        top = (512 - (mh + gap + th)) / 2
        body = place(MARK, MB, (512 - mw) / 2, top, mw) + place(STAR_T + WORKS_T, TB, (512 - tw) / 2, top + mh + gap, tw)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{bg}{body}</svg>'


# 제품군 설치 아이콘 = 스타웍스 로고 + 아래 띠(제품 글자·색) — 2026-11-28 대표 지시: CAD·OFFICE·CAM·CAE 가 서로 헷갈리지 않게
#   새 프로그램 = 아래 표에 한 줄. 띠 색은 색상 계열이 겹치지 않게 고름 (기획서: 홈페이지_오피스뷰어_이름·아이콘_v1.md)
PRODUCTS = [  # (띠 글자, 띠 색, 출력 폴더(루트 기준), 파일 앞이름) — 출력 폴더가 None 이면 예약(아직 프로그램 없음)
    ("CAD", "#0EA5E9", "tools/icons", "viewer"),               # CAD 뷰어 (하늘)
    ("OFFICE", "#16A34A", "tools/office/web/icons", "doc"),    # 오피스 뷰어 (초록)
    ("CAM", "#F97316", None, "cam"),                           # 예약 (주황)
    ("CAE", "#9333EA", None, "cae"),                           # 예약 (보라)
    ("CAD-PRO", "#FACC15", None, "cadpro"),                    # 예약 (금색 띠 + 남색 글자) — 2026-11-28 안티그래비티에서 개발 중
]
TEXT_COLOR = {"CAD-PRO": NAVY}   # 띠 글자색 (없으면 흰색) — CAD-PRO 는 금색 띠라 남색 글자로 CAD 와 확실히 구분


def product_icon(label="CAD", color="#0EA5E9", rx=92, k=1.0):
    """제품 설치 아이콘: 스타웍스 로고(별 마크 + STAR Works) + 아래 띠(label, color)"""
    mw, tw, gap = 150 * k, 250 * k, 18 * k
    mh, th = mw * MB[3] / MB[2], tw * TB[3] / TB[2]
    band = 112 * k
    by = 256 + (512 * (1 if rx else k) / 2) - band if rx else 256 + 256 * k - band     # 띠 위쪽 y
    top = (256 - (256 if rx else 256 * k)) + ((by - (256 - (256 if rx else 256 * k))) - (mh + gap + th)) / 2
    body = place(MARK, MB, (512 - mw) / 2, top, mw) + place(STAR_T + WORKS_T, TB, (512 - tw) / 2, top + mh + gap, tw)
    n = len(label)
    if rx:   # 둥근 모서리 안쪽에만 띠가 보이게 잘라 냄
        clip = f'<clipPath id="c"><rect width="512" height="512" rx="{rx}"/></clipPath>'
        bandsvg = f'<g clip-path="url(#c)"><rect x="0" y="{by:.1f}" width="512" height="{512 - by:.1f}" fill="{color}"/></g>'
        ty, fs = by + band * 0.72, band * 0.66
        fs = min(fs, 430 / (n * 0.80))
    else:    # 안드로이드용: 가장자리가 잘리므로 띠를 안전 영역 안의 알약 모양으로 (긴 글자는 조금 넓히고 글자를 줄임)
        clip = ""
        bw = (250 if n <= 3 else 300) * k
        bandsvg = f'<rect x="{(512 - bw) / 2:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{band * 0.8:.1f}" rx="{band * 0.4:.1f}" fill="{color}"/>'
        fs = min(band * 0.8 * 0.66, bw * 0.84 / (n * 0.80))
        ty = by + band * 0.8 * 0.74 if n <= 3 else by + band * 0.8 / 2 + fs * 0.36   # 3글자(CAD)는 예전 위치 그대로
    text = f'<text x="256" y="{ty:.1f}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="{fs:.1f}" letter-spacing="{fs * 0.08:.1f}" fill="{TEXT_COLOR.get(label, "#FFFFFF")}">{label}</text>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{clip}</defs>'
            f'<rect width="512" height="512" rx="{rx}" fill="{NAVY}"/>{body}{bandsvg}{text}</svg>')


def viewer_icon(rx=92, k=1.0):   # 옛 이름 (CAD 뷰어)
    return product_icon("CAD", "#0EA5E9", rx, k)


JOBS = [  # (파일, 종류, 크기, 모서리, 로고 비율)
    ("icon-16.png", "A", 16, 92, 1.06), ("icon-32.png", "A", 32, 92, 1.03),
    ("icon-48.png", "A", 48, 92, 1.0), ("icon-64.png", "A", 64, 92, 1.0),
    ("icon-96.png", "B", 96, 92, 1.0), ("icon-128.png", "B", 128, 92, 1.0), ("icon-192.png", "B", 192, 92, 1.0),
    ("icon-256.png", "B", 256, 92, 1.0), ("icon-512.png", "B", 512, 92, 1.0),
    ("maskable-192.png", "B", 192, 0, 0.8), ("maskable-512.png", "B", 512, 0, 0.8),
    ("apple-touch-icon.png", "B", 180, 0, 0.92),
]


async def main():
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8").write(icon("A") + "\n")
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for name, kind, px, rx, k in JOBS:
            p = await b.new_page(viewport={"width": px, "height": px})
            await p.set_content(f'<body style="margin:0;background:transparent"><div style="width:{px}px;height:{px}px;display:block;line-height:0">{icon(kind, rx, k)}</div></body>')
            png = await p.screenshot(omit_background=True)
            await p.close()
            Image.open(io.BytesIO(png)).save(os.path.join(OUT, name), optimize=True)
            print(name, px)
        for label, color, folder, stem in PRODUCTS:
            if not folder:
                continue
            VOUT = os.path.join(ROOT, folder)
            os.makedirs(VOUT, exist_ok=True)
            for suf, px, rx, k in (("-192.png", 192, 92, 1.0), ("-512.png", 512, 92, 1.0), ("-maskable-512.png", 512, 0, 0.74)):
                p = await b.new_page(viewport={"width": px, "height": px})
                await p.set_content(f'<body style="margin:0;background:transparent"><div style="width:{px}px;height:{px}px;display:block;line-height:0">{product_icon(label, color, rx, k)}</div></body>')
                png = await p.screenshot(omit_background=True)
                await p.close()
                Image.open(io.BytesIO(png)).save(os.path.join(VOUT, stem + suf), optimize=True)
                print(folder + "/" + stem + suf, px)
        await b.close()
    ims = [Image.open(os.path.join(OUT, f"icon-{n}.png")).convert("RGBA") for n in (16, 32, 48)]
    ims[2].save(os.path.join(ROOT, "favicon.ico"), format="ICO", append_images=ims[:2], sizes=[(16, 16), (32, 32), (48, 48)])
    os.remove(os.path.join(OUT, "icon-16.png"))
    print("favicon.ico 16·32·48")


if __name__ == "__main__":
    asyncio.run(main())
