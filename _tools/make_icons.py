# 사이트 아이콘 만들기 — 바탕화면 바로가기·브라우저 탭·휴대폰 홈 화면에 스타웍스 로고가 나오게
# 2026-11-27 대표 지시. 원본은 images/logo.svg (별 마크 + STAR Works 글자) — 그 경로를 그대로 씀
# 사용: python3 _tools/make_icons.py   (playwright + 크롬, Pillow 필요 — 로고가 바뀔 때만 다시 실행)
#   images/icons/icon.svg                 작은 것(별 마크만) 벡터 — 브라우저 탭
#   images/icons/icon-48 · 64.png         작은 것
#   images/icons/icon-96 … 512.png        큰 것(별 마크 + STAR Works) — 바탕화면·시작 메뉴
#   images/icons/maskable-192 · 512.png   안드로이드용(가장자리가 잘려도 로고가 남게 여백 넓힘)
#   images/icons/apple-touch-icon.png     아이폰용 180 (모서리는 아이폰이 둥글림)
#   favicon.ico                           16 · 32 · 48 (아이콘 줄이 없는 페이지도 이 파일로 표시됨)
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
        await b.close()
    ims = [Image.open(os.path.join(OUT, f"icon-{n}.png")).convert("RGBA") for n in (16, 32, 48)]
    ims[2].save(os.path.join(ROOT, "favicon.ico"), format="ICO", append_images=ims[:2], sizes=[(16, 16), (32, 32), (48, 48)])
    os.remove(os.path.join(OUT, "icon-16.png"))
    print("favicon.ico 16·32·48")


if __name__ == "__main__":
    asyncio.run(main())
