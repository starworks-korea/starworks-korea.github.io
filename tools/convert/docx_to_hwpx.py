# -*- coding: utf-8 -*-
"""
docx_to_hwpx.py — Stage 1: 0-토큰 고정밀 DOCX(OOXML) → HWPX(KS X 6101) 컴파일러
[02_분석_워드_한글_조판구조_및_불일치_원인정밀분석.md]의 8대 조판 변환 수식 구현:
  1. 단위 정확 환산 (1 Twip = 5 HWPUNIT, 1 Half-pt = 50 HWPUNIT, 1 EMU = 1/127 HWPUNIT)
  2. 페이지 여백 + 머리말/꼬리말 합산 보정 (HWP_top + HWP_header == Word_top)
  3. 스타일 상속 완전 전개 (docDefaults -> styles -> pPr/rPr)
  4. fontTools OpenType 메트릭 실측 기반 행간(FIXED / 역산 PERCENT) 계산
  5. 자간(Twips -> %) · 장평(%) · autoSpace=0 · 글자단위 줄바꿈(BREAK_WORD)
  6. 들여쓰기 / 내어쓰기(intent) · 문단 위아래 간격
  7. 표 열폭(gridCol/tcW) · 셀 안여백(tcMar 상하 0 포함) · 행 높이 · 가로/세로 병합 · 테두리/음영
  8. 인라인 이미지(BinData) + Stage 2 폐루프 보정 파라미터(cal) 수용
  9. (2026-11-28 검토 보완) 자동 번호·글머리표(numbering.xml) → 번호 글자로 전개,
     쪽 나눔(w:br type=page · pageBreakBefore) → 한글 쪽 나눔,
     하이퍼링크·변경추적 삽입(w:ins)·필드·콘텐츠 컨트롤 안의 글자 누락 수정 (삭제 w:del 은 제외)
"""
import io
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape as xml_esc

from lxml import etree
from PIL import Image

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
W = f"{{{W_NS}}}"
R = f"{{{R_NS}}}"
A = f"{{{A_NS}}}"
WP = f"{{{WP_NS}}}"

# 영문 폰트명 -> 한국어/한컴 공용 폰트명 정규화
FONT_ALIAS = {
    "malgun gothic": "맑은 고딕",
    "batang": "바탕",
    "gulim": "굴림",
    "dotum": "돋움",
    "gungsuh": "궁서",
    "nanumgothic": "나눔고딕",
    "nanummyeongjo": "나눔명조",
    "hcr batangs": "함초롬바탕",
    "hcr dotum": "함초롬돋움",
}

# OpenType OS/2 기본 1줄 높이 비율 K_font = (winAscent + winDescent) / UPM
_FONT_METRIC_CACHE: Dict[str, float] = {}


def get_font_line_ratio(font_name: str) -> float:
    key = (font_name or "맑은 고딕").strip().lower()
    if key in _FONT_METRIC_CACHE:
        return _FONT_METRIC_CACHE[key]

    ratio = 1.33 if ("malgun" in key or "맑은" in key) else 1.25
    try:
        from fontTools.ttLib import TTFont

        win_fonts = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
        candidates = {
            "맑은 고딕": ["malgun.ttf"],
            "malgun gothic": ["malgun.ttf"],
            "바탕": ["batang.ttc"],
            "batang": ["batang.ttc"],
            "굴림": ["gulim.ttc"],
            "돋움": ["gulim.ttc"],
        }.get(key, [])
        for fn in candidates:
            fp = win_fonts / fn
            if fp.is_file():
                tt = TTFont(str(fp), fontNumber=0 if fp.suffix.lower() == ".ttc" else -1, lazy=True)
                upm = float(tt["head"].unitsPerEm)
                os2 = tt["OS/2"]
                k = (float(os2.usWinAscent) + float(os2.usWinDescent)) / upm
                tt.close()
                if 0.9 <= k <= 1.8:
                    ratio = k
                break
    except Exception:
        pass

    _FONT_METRIC_CACHE[key] = ratio
    return ratio


def _norm_font(name: Optional[str]) -> str:
    if not name:
        return "맑은 고딕"
    low = name.strip().lower()
    return FONT_ALIAS.get(low, name.strip())


def _w_int(el, attr: str, default: int = 0) -> int:
    if el is None:
        return default
    v = el.get(W + attr) or el.get(attr)
    if v is None:
        return default
    try:
        return int(float(v))
    except Exception:
        return default


def _w_str(el, attr: str, default: str = "") -> str:
    if el is None:
        return default
    return el.get(W + attr) or el.get(attr) or default


def _border_mm(sz_eighth_pt: int) -> str:
    # Word w:sz = 1/8 pt. HWPX 허용 규격 문자열로 가장 가까운 표준값 매핑
    mm = sz_eighth_pt * 0.044097
    if mm <= 0.01:
        return "0.12 mm"
    standards = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0]
    best = min(standards, key=lambda s: abs(s - mm))
    return f"{best:g} mm"


class StyleRegistry:
    """HWPX header.xml의 fontfaces / borderFills / charPr / paraPr 중복 제거 등록기"""

    def __init__(self):
        self.fonts: List[str] = ["맑은 고딕", "함초롬바탕"]
        self.font_idx: Dict[str, int] = {f: i for i, f in enumerate(self.fonts)}

        # borderFill id=1 (투명/선없음), id=2 (기본 얇은 테두리)
        self.border_fills: List[Tuple[int, str]] = []
        self.bf_map: Dict[Tuple, int] = {}
        self._init_default_border_fills()

        self.char_prs: List[Tuple[int, Dict[str, Any]]] = []
        self.cp_map: Dict[Tuple, int] = {}

        self.para_prs: List[Tuple[int, Dict[str, Any]]] = []
        self.pp_map: Dict[Tuple, int] = {}

        # 기본 charPr id=0, paraPr id=0 보장
        self.get_char_pr({"font": "맑은 고딕", "height": 1000, "bold": False, "italic": False, "underline": False, "color": "#000000", "ratio": 100, "spacing": 0})
        self.get_para_pr({"align": "LEFT", "left": 0, "right": 0, "intent": 0, "prev": 0, "next": 0, "ls_type": "PERCENT", "ls_val": 160})

    def _init_default_border_fills(self):
        bf1 = (
            '<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
            '<hh:slash type="NONE" Crooked="0" isCounter="0"/>'
            '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
            '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>'
            '<hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>'
            '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>'
            '<hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>'
            '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>'
            "</hh:borderFill>"
        )
        bf2 = (
            '<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
            '<hh:slash type="NONE" Crooked="0" isCounter="0"/>'
            '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
            '<hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/>'
            '<hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/>'
            '<hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/>'
            '<hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/>'
            '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>'
            "</hh:borderFill>"
        )
        self.border_fills.append((1, bf1))
        self.border_fills.append((2, bf2))

    def get_font_id(self, name: str) -> int:
        nf = _norm_font(name)
        if nf not in self.font_idx:
            self.font_idx[nf] = len(self.fonts)
            self.fonts.append(nf)
        return self.font_idx[nf]

    def get_border_fill(self, borders: Dict[str, Tuple[str, str, str]], fill_hex: str = "") -> int:
        key = (
            borders.get("left", ("SOLID", "0.12 mm", "#000000")),
            borders.get("right", ("SOLID", "0.12 mm", "#000000")),
            borders.get("top", ("SOLID", "0.12 mm", "#000000")),
            borders.get("bottom", ("SOLID", "0.12 mm", "#000000")),
            fill_hex.upper(),
        )
        if key in self.bf_map:
            return self.bf_map[key]
        bf_id = len(self.border_fills) + 1
        self.bf_map[key] = bf_id

        def btag(side: str, tag: str) -> str:
            t, w, c = borders.get(side, ("SOLID", "0.12 mm", "#000000"))
            return f'<hh:{tag} type="{t}" width="{w}" color="{c}"/>'

        fill_xml = ""
        if fill_hex:
            fill_xml = (
                "<hc:fillBrush>"
                f'<hc:winBrush faceColor="#{fill_hex.lstrip("#")}" hatchColor="#999999" alpha="0"/>'
                "</hc:fillBrush>"
            )
        xml = (
            f'<hh:borderFill id="{bf_id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
            '<hh:slash type="NONE" Crooked="0" isCounter="0"/>'
            '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
            + btag("left", "leftBorder")
            + btag("right", "rightBorder")
            + btag("top", "topBorder")
            + btag("bottom", "bottomBorder")
            + '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>'
            + fill_xml
            + "</hh:borderFill>"
        )
        self.border_fills.append((bf_id, xml))
        return bf_id

    def get_char_pr(self, props: Dict[str, Any]) -> int:
        fid = self.get_font_id(props.get("font", "맑은 고딕"))
        h = max(400, int(round(props.get("height", 1000))))
        bold = bool(props.get("bold", False))
        italic = bool(props.get("italic", False))
        underline = bool(props.get("underline", False))
        color = props.get("color", "#000000") or "#000000"
        if not color.startswith("#"):
            color = "#" + color
        ratio = max(50, min(200, int(round(props.get("ratio", 100)))))
        spacing = max(-50, min(50, int(round(props.get("spacing", 0)))))
        key = (fid, h, bold, italic, underline, color.upper(), ratio, spacing)
        if key in self.cp_map:
            return self.cp_map[key]
        cid = len(self.char_prs)
        self.cp_map[key] = cid
        self.char_prs.append((cid, {
            "fid": fid, "height": h, "bold": bold, "italic": italic,
            "underline": underline, "color": color, "ratio": ratio, "spacing": spacing,
        }))
        return cid

    def get_para_pr(self, props: Dict[str, Any]) -> int:
        align = props.get("align", "LEFT")
        left = max(0, int(round(props.get("left", 0))))
        right = max(0, int(round(props.get("right", 0))))
        intent = int(round(props.get("intent", 0)))
        prev = max(0, int(round(props.get("prev", 0))))
        nxt = max(0, int(round(props.get("next", 0))))
        ls_type = props.get("ls_type", "PERCENT")
        ls_val = max(50, int(round(props.get("ls_val", 160))))
        key = (align, left, right, intent, prev, nxt, ls_type, ls_val)
        if key in self.pp_map:
            return self.pp_map[key]
        pid = len(self.para_prs)
        self.pp_map[key] = pid
        self.para_prs.append((pid, {
            "align": align, "left": left, "right": right, "intent": intent,
            "prev": prev, "next": nxt, "ls_type": ls_type, "ls_val": ls_val,
        }))
        return pid

    def build_header_xml(self) -> str:
        langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
        ff_blocks = []
        for lang in langs:
            f_items = "".join(
                f'<hh:font id="{i}" face="{xml_esc(name)}" type="TTF" isEmbedded="0">'
                '<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>'
                "</hh:font>"
                for i, name in enumerate(self.fonts)
            )
            ff_blocks.append(f'<hh:fontface lang="{lang}" fontCnt="{len(self.fonts)}">{f_items}</hh:fontface>')

        cp_blocks = []
        for cid, c in self.char_prs:
            fid = c["fid"]
            r = c["ratio"]
            sp = c["spacing"]
            b_xml = "<hh:bold/>" if c["bold"] else ""
            i_xml = "<hh:italic/>" if c["italic"] else ""
            u_xml = '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>' if c["underline"] else '<hh:underline type="NONE" shape="SOLID" color="#000000"/>'
            cp_blocks.append(
                f'<hh:charPr id="{cid}" height="{c["height"]}" textColor="{c["color"]}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">'
                f'<hh:fontRef hangul="{fid}" latin="{fid}" hanja="{fid}" japanese="{fid}" other="{fid}" symbol="{fid}" user="{fid}"/>'
                f'<hh:ratio hangul="{r}" latin="{r}" hanja="{r}" japanese="{r}" other="{r}" symbol="{r}" user="{r}"/>'
                f'<hh:spacing hangul="{sp}" latin="{sp}" hanja="{sp}" japanese="{sp}" other="{sp}" symbol="{sp}" user="{sp}"/>'
                '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
                '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
                f"{b_xml}{i_xml}{u_xml}"
                '<hh:strikeout shape="NONE" color="#000000"/>'
                '<hh:outline type="NONE"/>'
                '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>'
                "</hh:charPr>"
            )

        pp_blocks = []
        for pid, p in self.para_prs:
            # HWPX paraPr margin은 1/2 HWPUNIT(= 1pt = 200) 스케일로 해석되는 한컴 규격 반영 (*2 보정)
            # 단, calibrate 시 정확 검증 가능하도록 unit="HWPUNIT" 명시
            m_left = p["left"] * 2
            m_right = p["right"] * 2
            m_intent = p["intent"] * 2
            m_prev = p["prev"] * 2
            m_next = p["next"] * 2
            ls_val = p["ls_val"] * 2 if p["ls_type"] in ("FIXED", "AT_LEAST") else p["ls_val"]
            pp_blocks.append(
                f'<hh:paraPr id="{pid}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0">'
                f'<hh:align horizontal="{p["align"]}" vertical="BASELINE"/>'
                '<hh:heading type="NONE" idRef="0" level="0"/>'
                '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
                '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>'
                '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">'
                '<hh:margin>'
                f'<hc:intent value="{p["intent"]}" unit="HWPUNIT"/>'
                f'<hc:left value="{p["left"]}" unit="HWPUNIT"/>'
                f'<hc:right value="{p["right"]}" unit="HWPUNIT"/>'
                f'<hc:prev value="{p["prev"]}" unit="HWPUNIT"/>'
                f'<hc:next value="{p["next"]}" unit="HWPUNIT"/>'
                "</hh:margin>"
                f'<hh:lineSpacing type="{p["ls_type"]}" value="{p["ls_val"]}" unit="HWPUNIT"/>'
                "</hp:case><hp:default>"
                '<hh:margin>'
                f'<hc:intent value="{m_intent}" unit="HWPUNIT"/>'
                f'<hc:left value="{m_left}" unit="HWPUNIT"/>'
                f'<hc:right value="{m_right}" unit="HWPUNIT"/>'
                f'<hc:prev value="{m_prev}" unit="HWPUNIT"/>'
                f'<hc:next value="{m_next}" unit="HWPUNIT"/>'
                "</hh:margin>"
                f'<hh:lineSpacing type="{p["ls_type"]}" value="{ls_val}" unit="HWPUNIT"/>'
                "</hp:default></hp:switch>"
                '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
                "</hh:paraPr>"
            )

        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<hh:head xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
            'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
            'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
            'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">'
            '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
            "<hh:refList>"
            f'<hh:fontfaces itemCnt="{len(langs)}">{"".join(ff_blocks)}</hh:fontfaces>'
            f'<hh:borderFills itemCnt="{len(self.border_fills)}">{"".join(x for _, x in self.border_fills)}</hh:borderFills>'
            f'<hh:charProperties itemCnt="{len(self.char_prs)}">{"".join(cp_blocks)}</hh:charProperties>'
            '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
            '<hh:numberings itemCnt="1"><hh:numbering id="1" start="1"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead></hh:numbering></hh:numberings>'
            f'<hh:paraProperties itemCnt="{len(self.para_prs)}">{"".join(pp_blocks)}</hh:paraProperties>'
            '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>'
            "</hh:refList>"
            '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>'
            "</hh:head>"
        )


def convert_docx_to_hwpx(docx_path: Path, hwpx_path: Path, cal: Optional[Dict[str, Any]] = None) -> Path:
    """
    DOCX -> HWPX 고정밀 변환.
    cal (Stage 2 폐루프 자동 보정 파라미터):
      - margin_top_delta_hwp: int (상단 여백 미세 보정)
      - line_spacing_scale: float (행간 배율 보정, 기본 1.0)
      - char_spacing_delta: int (전역 자간 미세 보정 %, 기본 0)
      - char_ratio_scale: float (전역 장평 배율 보정, 기본 1.0)
      - table_col_widths_hwp: Optional[List[int]] (Ref.pdf 실측 열폭 직접 주입)
      - table_vmargin_delta_hwp: int (표 셀 상하 안여백 보정)
    """
    cal = cal or {}
    margin_top_delta = int(cal.get("margin_top_delta_hwp", 0))
    ls_scale = float(cal.get("line_spacing_scale", 1.0))
    sp_delta = int(cal.get("char_spacing_delta", 0))
    ratio_scale = float(cal.get("char_ratio_scale", 1.0))
    table_vmargin_delta = int(cal.get("table_vmargin_delta_hwp", 0))
    forced_col_widths = cal.get("table_col_widths_hwp")

    reg = StyleRegistry()
    bin_items: List[Tuple[str, str, bytes]] = []  # (id, zip_path, bytes)
    rid_to_img: Dict[str, Tuple[str, int, int]] = {}  # rId -> (bin_id, px_w, px_h)

    with zipfile.ZipFile(str(docx_path), "r") as zf:
        names = set(zf.namelist())

        # 1) rels 파싱 (이미지, 머리말, 꼬리말)
        rels: Dict[str, Tuple[str, str]] = {}
        if "word/_rels/document.xml.rels" in names:
            r_root = etree.fromstring(zf.read("word/_rels/document.xml.rels"))
            for rel in r_root:
                rid = rel.get("Id")
                target = rel.get("Target", "")
                rtype = rel.get("Type", "")
                if rid and target:
                    tpath = target.lstrip("/") if target.startswith("/") else ("word/" + target)
                    rels[rid] = (tpath, rtype)

        img_seq = 0
        for rid, (tpath, rtype) in rels.items():
            if "/image" in rtype and tpath in names:
                img_seq += 1
                raw = zf.read(tpath)
                ext = Path(tpath).suffix.lower().lstrip(".") or "png"
                bid = f"image{img_seq}"
                bpath = f"BinData/{bid}.{ext}"
                try:
                    im = Image.open(io.BytesIO(raw))
                    pw, ph = im.size
                except Exception:
                    pw, ph = 320, 180
                bin_items.append((bid, bpath, raw))
                rid_to_img[rid] = (bid, pw, ph)

        # 2) styles.xml docDefaults & 스타일 상속 맵
        def_rpr = {"font": "맑은 고딕", "sz_half": 20, "bold": False, "italic": False, "underline": False, "color": "#000000", "ratio": 100, "spacing_twip": 0}
        def_ppr = {"align": "LEFT", "left": 0, "right": 0, "firstLine": 0, "hanging": 0, "before": 0, "after": 0, "line": 240, "lineRule": "auto"}
        style_map: Dict[str, Dict[str, Any]] = {}

        def parse_rpr_el(rpr_el, base: Dict[str, Any]) -> Dict[str, Any]:
            out = dict(base)
            if rpr_el is None:
                return out
            rf = rpr_el.find(W + "rFonts")
            if rf is not None:
                fn = rf.get(W + "eastAsia") or rf.get(W + "ascii") or rf.get(W + "hAnsi")
                if fn:
                    out["font"] = _norm_font(fn)
            sz = rpr_el.find(W + "sz")
            if sz is not None:
                out["sz_half"] = _w_int(sz, "val", out["sz_half"])
            b = rpr_el.find(W + "b")
            if b is not None:
                out["bold"] = _w_str(b, "val", "1") not in ("0", "false")
            it = rpr_el.find(W + "i")
            if it is not None:
                out["italic"] = _w_str(it, "val", "1") not in ("0", "false")
            u = rpr_el.find(W + "u")
            if u is not None:
                out["underline"] = _w_str(u, "val", "single") != "none"
            clr = rpr_el.find(W + "color")
            if clr is not None:
                cv = _w_str(clr, "val")
                if cv and cv.lower() != "auto":
                    out["color"] = "#" + cv.lstrip("#")
            w_el = rpr_el.find(W + "w")
            if w_el is not None:
                out["ratio"] = _w_int(w_el, "val", 100)
            sp_el = rpr_el.find(W + "spacing")
            if sp_el is not None:
                out["spacing_twip"] = _w_int(sp_el, "val", 0)
            return out

        def parse_ppr_el(ppr_el, base: Dict[str, Any]) -> Dict[str, Any]:
            out = dict(base)
            if ppr_el is None:
                return out
            jc = ppr_el.find(W + "jc")
            if jc is not None:
                amap = {"left": "LEFT", "center": "CENTER", "right": "RIGHT", "both": "JUSTIFY", "distribute": "DISTRIBUTE"}
                out["align"] = amap.get(_w_str(jc, "val").lower(), out["align"])
            ind = ppr_el.find(W + "ind")
            if ind is not None:
                if ind.get(W + "left") is not None:
                    out["left"] = _w_int(ind, "left", 0)
                if ind.get(W + "right") is not None:
                    out["right"] = _w_int(ind, "right", 0)
                if ind.get(W + "firstLine") is not None:
                    out["firstLine"] = _w_int(ind, "firstLine", 0)
                    out["hanging"] = 0
                if ind.get(W + "hanging") is not None:
                    out["hanging"] = _w_int(ind, "hanging", 0)
                    out["firstLine"] = 0
            npr = ppr_el.find(W + "numPr")
            if npr is not None:
                nid = npr.find(W + "numId")
                lvl = npr.find(W + "ilvl")
                if nid is not None:
                    out["numId"] = _w_str(nid, "val", "0")
                if lvl is not None:
                    out["ilvl"] = _w_int(lvl, "val", 0)
            pbb = ppr_el.find(W + "pageBreakBefore")
            if pbb is not None:
                out["pageBreakBefore"] = _w_str(pbb, "val", "1").lower() not in ("0", "false", "off")
            sp = ppr_el.find(W + "spacing")
            if sp is not None:
                if sp.get(W + "before") is not None:
                    out["before"] = _w_int(sp, "before", 0)
                if sp.get(W + "after") is not None:
                    out["after"] = _w_int(sp, "after", 0)
                if sp.get(W + "line") is not None:
                    out["line"] = _w_int(sp, "line", 240)
                    out["lineRule"] = _w_str(sp, "lineRule", "auto")
            return out

        if "word/styles.xml" in names:
            s_root = etree.fromstring(zf.read("word/styles.xml"))
            dd = s_root.find(W + "docDefaults")
            if dd is not None:
                rdef = dd.find(W + "rPrDefault")
                if rdef is not None:
                    def_rpr = parse_rpr_el(rdef.find(W + "rPr"), def_rpr)
                pdef = dd.find(W + "pPrDefault")
                if pdef is not None:
                    def_ppr = parse_ppr_el(pdef.find(W + "pPr"), def_ppr)
            for st in s_root.findall(W + "style"):
                sid = _w_str(st, "styleId")
                if sid:
                    style_map[sid] = {
                        "basedOn": _w_str(st.find(W + "basedOn"), "val"),
                        "pPr": st.find(W + "pPr"),
                        "rPr": st.find(W + "rPr"),
                    }

        def resolve_style(sid: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
            chain = []
            cur = sid
            seen = set()
            while cur and cur in style_map and cur not in seen:
                seen.add(cur)
                chain.append(style_map[cur])
                cur = style_map[cur]["basedOn"]
            p = dict(def_ppr)
            r = dict(def_rpr)
            for st in reversed(chain):
                p = parse_ppr_el(st["pPr"], p)
                r = parse_rpr_el(st["rPr"], r)
            return p, r

        # 2-b) numbering.xml — 자동 번호·글머리표 (번호 글자로 전개해 문단 앞에 넣음)
        abstract_nums: Dict[str, Dict[int, Dict[str, Any]]] = {}
        num_map: Dict[str, Tuple[str, Dict[int, int]]] = {}
        if "word/numbering.xml" in names:
            n_root = etree.fromstring(zf.read("word/numbering.xml"))
            for an in n_root.findall(W + "abstractNum"):
                levels: Dict[int, Dict[str, Any]] = {}
                for lv in an.findall(W + "lvl"):
                    il = _w_int(lv, "ilvl", 0)
                    levels[il] = {
                        "start": _w_int(lv.find(W + "start"), "val", 1) if lv.find(W + "start") is not None else 1,
                        "fmt": _w_str(lv.find(W + "numFmt"), "val", "decimal") if lv.find(W + "numFmt") is not None else "decimal",
                        "text": _w_str(lv.find(W + "lvlText"), "val", "") if lv.find(W + "lvlText") is not None else "",
                        "suff": _w_str(lv.find(W + "suff"), "val", "tab") if lv.find(W + "suff") is not None else "tab",
                        "restart": _w_int(lv.find(W + "lvlRestart"), "val", -1) if lv.find(W + "lvlRestart") is not None else -1,
                        "pPr": lv.find(W + "pPr"),
                        "rPr": lv.find(W + "rPr"),
                    }
                abstract_nums[_w_str(an, "abstractNumId")] = levels
            for nm in n_root.findall(W + "num"):
                aid = _w_str(nm.find(W + "abstractNumId"), "val") if nm.find(W + "abstractNumId") is not None else ""
                ovr: Dict[int, int] = {}
                for lo in nm.findall(W + "lvlOverride"):
                    so = lo.find(W + "startOverride")
                    if so is not None:
                        ovr[_w_int(lo, "ilvl", 0)] = _w_int(so, "val", 1)
                num_map[_w_str(nm, "numId")] = (aid, ovr)
        num_counters: Dict[str, Dict[int, int]] = {}

        _BULLET_MAP = {"\uf0b7": "•", "\uf0a7": "▪", "\uf0d8": "➢", "\uf076": "❖", "\uf0fc": "✓", "\uf06e": "■",
                       "\uf0a8": "□", "\uf09f": "•", "\uf0e0": "➢", "\uf0d7": "▸", "\uf06c": "●", "\uf075": "◆"}

        def _roman(n: int) -> str:
            vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
            out = ""
            for v, t in vals:
                while n >= v:
                    out += t
                    n -= v
            return out or str(n)

        def _letters(n: int, base: str) -> str:
            k = len(base)
            return base[(n - 1) % k] * ((n - 1) // k + 1) if n > 0 else str(n)

        def _fmt_num(n: int, fmt: str) -> str:
            f = (fmt or "decimal").lower()
            if f in ("decimal", "ordinal", "cardinaltext", "ordinaltext"):
                return str(n)
            if f == "decimalzero":
                return f"{n:02d}"
            if f == "upperroman":
                return _roman(n)
            if f == "lowerroman":
                return _roman(n).lower()
            if f == "upperletter":
                return _letters(n, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
            if f == "lowerletter":
                return _letters(n, "abcdefghijklmnopqrstuvwxyz")
            if f == "decimalenclosedcircle":
                return chr(0x2460 + n - 1) if 1 <= n <= 20 else f"({n})"
            if f == "decimalenclosedparen":
                return chr(0x2474 + n - 1) if 1 <= n <= 20 else f"({n})"
            if f == "decimalenclosedfullstop":
                return chr(0x2488 + n - 1) if 1 <= n <= 20 else f"{n}."
            if f in ("ganada", "koreandigital2"):
                return _letters(n, "가나다라마바사아자차카타파하") if f == "ganada" else str(n)
            if f == "chosung":
                return _letters(n, "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ")
            if f in ("koreandigital", "ideographdigital", "japanesecounting", "chinesecounting"):
                digs = "영일이삼사오육칠팔구" if f == "koreandigital" else "〇一二三四五六七八九"
                return "".join(digs[int(c)] for c in str(n))
            if f == "koreancounting":
                words = ["하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열"]
                return words[n - 1] if 1 <= n <= 10 else str(n)
            return str(n)

        def numbering_label(num_id: str, ilvl: int) -> Tuple[str, Optional[Any], Optional[Any]]:
            """(번호 글자, 수준 pPr, 수준 rPr) — 번호 없음이면 ("", None, None)"""
            if not num_id or num_id == "0" or num_id not in num_map:
                return "", None, None
            aid, ovr = num_map[num_id]
            levels = abstract_nums.get(aid, {})
            lv = levels.get(ilvl)
            if lv is None:
                return "", None, None
            cnt = num_counters.setdefault(num_id, {})
            start = ovr.get(ilvl, lv["start"])
            cnt[ilvl] = cnt.get(ilvl, start - 1) + 1
            for deeper in list(cnt.keys()):   # 상위 수준이 올라가면 하위 수준은 처음부터
                if deeper > ilvl:
                    dl = levels.get(deeper, {})
                    if dl.get("restart", -1) != 0:
                        del cnt[deeper]
            fmt = lv["fmt"].lower()
            if fmt == "none":
                return "", lv["pPr"], lv["rPr"]
            if fmt == "bullet":
                txt = "".join(_BULLET_MAP.get(c, "•" if 0xF000 <= ord(c) <= 0xF0FF else c) for c in (lv["text"] or "•"))
            else:
                txt = lv["text"]
                for k in range(9):
                    if f"%{k + 1}" in txt:
                        kl = levels.get(k, {"start": 1, "fmt": "decimal"})
                        val = cnt.get(k, ovr.get(k, kl.get("start", 1)))
                        txt = txt.replace(f"%{k + 1}", _fmt_num(val, kl.get("fmt", "decimal")))
            if lv["suff"] != "nothing":
                txt += " "
            return txt, lv["pPr"], lv["rPr"]

        _RUN_WRAPPERS = {"hyperlink", "ins", "smartTag", "fldSimple", "customXml", "sdt", "sdtContent", "moveTo", "dir", "bdo"}

        def collect_runs(container) -> List[Any]:
            """문단 안의 글자 묶음(w:r) — 하이퍼링크·삽입·필드·콘텐츠 컨트롤 안까지 (삭제 w:del · moveFrom 제외)"""
            found: List[Any] = []
            for ch in container:
                ln = etree.QName(ch).localname if isinstance(ch.tag, str) else ""
                if ln == "r":
                    found.append(ch)
                elif ln in _RUN_WRAPPERS:
                    found.extend(collect_runs(ch))
            return found

        # 3) document.xml 본문 및 sectPr 해석
        doc_root = etree.fromstring(zf.read("word/document.xml"))
        body = doc_root.find(W + "body")
        sect_pr = body.find(W + "sectPr")

        # 페이지 크기 & 여백+머리말/꼬리말 정밀 보정 (02 MD §2.1)
        pg_w_twip, pg_h_twip = 11906, 16838
        m_top, m_bottom, m_left, m_right, m_hdr, m_ftr, m_gutter = 1417, 1134, 1134, 1134, 567, 567, 0
        has_header = False
        has_footer = False
        hdr_xml_content = ""
        ftr_xml_content = ""

        if sect_pr is not None:
            pg_sz = sect_pr.find(W + "pgSz")
            if pg_sz is not None:
                pg_w_twip = _w_int(pg_sz, "w", pg_w_twip)
                pg_h_twip = _w_int(pg_sz, "h", pg_h_twip)
            pg_mar = sect_pr.find(W + "pgMar")
            if pg_mar is not None:
                m_top = _w_int(pg_mar, "top", m_top)
                m_bottom = _w_int(pg_mar, "bottom", m_bottom)
                m_left = _w_int(pg_mar, "left", m_left)
                m_right = _w_int(pg_mar, "right", m_right)
                m_hdr = _w_int(pg_mar, "header", m_hdr)
                m_ftr = _w_int(pg_mar, "footer", m_ftr)
                m_gutter = _w_int(pg_mar, "gutter", 0)

            for href in sect_pr.findall(W + "headerReference"):
                if _w_str(href, "type", "default") == "default":
                    rid = href.get(R + "id")
                    if rid in rels and rels[rid][0] in names:
                        has_header = True
                        hdr_xml_content = zf.read(rels[rid][0])
            for fref in sect_pr.findall(W + "footerReference"):
                if _w_str(fref, "type", "default") == "default":
                    rid = fref.get(R + "id")
                    if rid in rels and rels[rid][0] in names:
                        has_footer = True
                        ftr_xml_content = zf.read(rels[rid][0])

        # 핵심 여백 공식: HWP_top + HWP_header == Word_top * 5
        if has_header:
            hwp_top = max(0, m_hdr * 5 + margin_top_delta)
            hwp_hdr = max(0, (m_top - m_hdr) * 5)
        else:
            hwp_top = max(0, m_top * 5 + margin_top_delta)
            hwp_hdr = 0
        if has_footer:
            hwp_bottom = max(0, m_ftr * 5)
            hwp_ftr = max(0, (m_bottom - m_ftr) * 5)
        else:
            hwp_bottom = max(0, m_bottom * 5)
            hwp_ftr = 0

        obj_id_counter = [100000]

        def next_id() -> int:
            obj_id_counter[0] += 1
            return obj_id_counter[0]

        def make_hwp_para_pr(p_props: Dict[str, Any], dom_font: str, dom_sz_half: int) -> int:
            font_pt = max(6.0, dom_sz_half / 2.0)
            lr = p_props["lineRule"]
            lv = p_props["line"]

            # 02 MD §2.2: 행간 정밀 수식 매핑
            if lr == "exact":
                ls_type = "FIXED"
                ls_val = int(round(lv * 5 * ls_scale))
            elif lr == "atLeast":
                ls_type = "AT_LEAST"
                ls_val = int(round(lv * 5 * ls_scale))
            else:
                # Word auto: H_line = font_pt * K_font * (lv / 240)
                k_font = get_font_line_ratio(dom_font)
                h_line_pt = font_pt * k_font * (lv / 240.0) * ls_scale
                ls_type = "FIXED"
                ls_val = int(round(h_line_pt * 100.0))

            # 02 MD §2.4: 들여쓰기 / 내어쓰기 좌표 정밀 보정
            # Word: hanging -> 1행 = left - hanging, 2행+ = left
            # HWP:  intent < 0 -> 1행 = left, 2행+ = left + |intent|
            if p_props["hanging"] > 0:
                h_left = max(0, (p_props["left"] - p_props["hanging"]) * 5)
                h_intent = -p_props["hanging"] * 5
            else:
                h_left = p_props["left"] * 5
                h_intent = p_props["firstLine"] * 5

            return reg.get_para_pr({
                "align": p_props["align"],
                "left": h_left,
                "right": p_props["right"] * 5,
                "intent": h_intent,
                "prev": p_props["before"] * 5,
                "next": p_props["after"] * 5,
                "ls_type": ls_type,
                "ls_val": ls_val,
            })

        def make_hwp_char_pr(r_props: Dict[str, Any]) -> int:
            sz_half = r_props["sz_half"]
            # Word w:spacing (twips) -> HWP spacing (% of em)
            sp_pct = int(round((r_props["spacing_twip"] / max(1.0, sz_half * 10.0)) * 100.0)) + sp_delta
            ratio = int(round(r_props["ratio"] * ratio_scale))
            return reg.get_char_pr({
                "font": r_props["font"],
                "height": sz_half * 50,
                "bold": r_props["bold"],
                "italic": r_props["italic"],
                "underline": r_props["underline"],
                "color": r_props["color"],
                "ratio": ratio,
                "spacing": sp_pct,
            })

        def convert_paragraph(p_el, extra_prefix_xml: str = "", inside_table: bool = False) -> str:
            ppr_el = p_el.find(W + "pPr")
            pstyle_el = ppr_el.find(W + "pStyle") if ppr_el is not None else None
            base_p, base_r = resolve_style(_w_str(pstyle_el, "val"))
            p_props = parse_ppr_el(ppr_el, base_p)
            # 자동 번호: 스타일 또는 문단의 numPr → 번호 글자 + 번호 수준 들여쓰기(문단 직접 지정이 우선)
            num_label, lvl_ppr, lvl_rpr = numbering_label(str(p_props.get("numId", "0")), int(p_props.get("ilvl", 0)))
            if lvl_ppr is not None:
                p_props = parse_ppr_el(ppr_el, parse_ppr_el(lvl_ppr, base_p))
            if inside_table:
                # 표 셀 내부 기본 문단 여백 팽창 방지
                if ppr_el is None or ppr_el.find(W + "spacing") is None:
                    p_props["before"] = 0
                    p_props["after"] = 0

            # 문단 내 지배적 글자 크기·폰트 파악 (행간 계산 기준)
            runs = collect_runs(p_el)
            dom_sz = base_r["sz_half"]
            dom_font = base_r["font"]
            has_img = False
            for r_el in runs:
                rp = parse_rpr_el(r_el.find(W + "rPr"), base_r)
                if rp["sz_half"] > dom_sz:
                    dom_sz = rp["sz_half"]
                dom_font = rp["font"]
                if r_el.find(W + "drawing") is not None:
                    has_img = True

            if has_img and p_props["lineRule"] == "auto":
                # 그림이 들어있는 문단은 FIXED 행간을 쓰면 그림이 잘릴 수 있으므로 PERCENT 100% 사용
                ppr_id = reg.get_para_pr({
                    "align": p_props["align"], "left": p_props["left"] * 5, "right": p_props["right"] * 5,
                    "intent": 0, "prev": p_props["before"] * 5, "next": p_props["after"] * 5,
                    "ls_type": "PERCENT", "ls_val": 100,
                })
            else:
                ppr_id = make_hwp_para_pr(p_props, dom_font, dom_sz)

            run_xmls = []
            if extra_prefix_xml:
                run_xmls.append(f'<hp:run charPrIDRef="0">{extra_prefix_xml}</hp:run>')
            if num_label:
                first_rpr = runs[0].find(W + "rPr") if runs else None
                np_ = parse_rpr_el(first_rpr, base_r)
                if lvl_rpr is not None:
                    np_ = parse_rpr_el(lvl_rpr, np_)
                    if (np_.get("font") or "").lower() in ("symbol", "wingdings", "courier new"):
                        np_["font"] = parse_rpr_el(first_rpr, base_r)["font"]
                run_xmls.append(f'<hp:run charPrIDRef="{make_hwp_char_pr(np_)}"><hp:t>{xml_esc(num_label)}</hp:t></hp:run>')
            page_segments: List[List[str]] = []   # 쪽 나눔(w:br type=page)에서 끊은 앞 문단들

            for r_el in runs:
                rp = parse_rpr_el(r_el.find(W + "rPr"), base_r)
                cpr_id = make_hwp_char_pr(rp)
                parts = []
                for ch in r_el:
                    tag = etree.QName(ch).localname
                    if tag == "t":
                        txt = ch.text or ""
                        if txt:
                            parts.append(f"<hp:t>{xml_esc(txt)}</hp:t>")
                    elif tag == "tab":
                        parts.append("<hp:t><hp:tab/></hp:t>")
                    elif tag == "br":
                        if _w_str(ch, "type", "").lower() == "page" and not inside_table:
                            # 쪽 나눔: 여기까지를 한 문단으로 끊고, 다음 내용은 새 쪽(pageBreak="1") 문단으로
                            if parts:
                                run_xmls.append(f'<hp:run charPrIDRef="{cpr_id}">{"".join(parts)}</hp:run>')
                                parts = []
                            page_segments.append(run_xmls)
                            run_xmls = []
                        else:
                            parts.append("<hp:t><hp:lineBreak/></hp:t>")
                    elif tag == "drawing":
                        ext_el = ch.find(".//" + WP + "extent")
                        blip_el = ch.find(".//" + A + "blip")
                        if blip_el is not None:
                            emb = blip_el.get(R + "embed") or ""
                            if emb in rid_to_img:
                                bid, pw, ph = rid_to_img[emb]
                                cx_emu = int(ext_el.get("cx", "3600000")) if ext_el is not None else 3600000
                                cy_emu = int(ext_el.get("cy", "1800000")) if ext_el is not None else 1800000
                                w_hwp = max(100, int(round(cx_emu / 127.0)))
                                h_hwp = max(100, int(round(cy_emu / 127.0)))
                                pid = next_id()
                                parts.append(
                                    f'<hp:pic id="{pid}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="{pid}" reverse="0">'
                                    '<hp:offset x="0" y="0"/>'
                                    f'<hp:orgSz width="{w_hwp}" height="{h_hwp}"/>'
                                    f'<hp:curSz width="{w_hwp}" height="{h_hwp}"/>'
                                    '<hp:flip horizontal="0" vertical="0"/>'
                                    '<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/>'
                                    '<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'
                                    f'<hc:img binaryItemIDRef="{bid}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
                                    f'<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="{w_hwp}" y="0"/><hc:pt2 x="{w_hwp}" y="{h_hwp}"/><hc:pt3 x="0" y="{h_hwp}"/></hp:imgRect>'
                                    f'<hp:imgClip left="0" right="{w_hwp}" top="0" bottom="{h_hwp}"/>'
                                    '<hp:inMargin left="0" right="0" top="0" bottom="0"/>'
                                    f'<hp:imgDim dimwidth="{w_hwp}" dimheight="{h_hwp}"/>'
                                    '<hp:effects/>'
                                    f'<hp:sz width="{w_hwp}" widthRelTo="ABSOLUTE" height="{h_hwp}" heightRelTo="ABSOLUTE" protect="0"/>'
                                    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
                                    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
                                    "</hp:pic>"
                                )
                if parts:
                    run_xmls.append(f'<hp:run charPrIDRef="{cpr_id}">{"".join(parts)}</hp:run>')

            out_ps: List[str] = []
            first_break = "1" if (p_props.get("pageBreakBefore") and not inside_table) else "0"
            for k, seg in enumerate(page_segments + [run_xmls]):
                if not seg:
                    if k < len(page_segments):   # 쪽 나눔 앞이 빈 문단이면 만들지 않음 (다음 문단이 새 쪽에서 시작)
                        continue
                    seg = [f'<hp:run charPrIDRef="0"><hp:t/></hp:run>']
                brk = first_break if k == 0 else "1"
                out_ps.append(f'<hp:p id="{next_id()}" paraPrIDRef="{ppr_id}" styleIDRef="0" pageBreak="{brk}" columnBreak="0" merged="0">{"".join(seg)}</hp:p>')
            return "".join(out_ps)

        def parse_border_side(el, fallback_side=("SOLID", "0.12 mm", "#000000")) -> Tuple[str, str, str]:
            if el is None:
                return fallback_side
            val = _w_str(el, "val", "single").lower()
            if val in ("none", "nil"):
                return ("NONE", "0.1 mm", "#000000")
            sz = _w_int(el, "sz", 4)
            clr = _w_str(el, "color", "000000")
            if clr.lower() == "auto":
                clr = "000000"
            return ("SOLID", _border_mm(sz), "#" + clr.lstrip("#"))

        def convert_table(tbl_el) -> str:
            tbl_pr = tbl_el.find(W + "tblPr")
            tbl_grid = tbl_el.find(W + "tblGrid")

            # 열 폭 계산
            col_widths_twip = [_w_int(gc, "w", 1800) for gc in (tbl_grid.findall(W + "gridCol") if tbl_grid is not None else [])]
            if not col_widths_twip:
                col_widths_twip = [2400, 2400]
            if forced_col_widths and len(forced_col_widths) == len(col_widths_twip):
                col_widths_hwp = [int(w) for w in forced_col_widths]
            else:
                col_widths_hwp = [w * 5 for w in col_widths_twip]
            total_w_hwp = sum(col_widths_hwp)

            # 표 기본 테두리 & 셀 안여백 (02 MD §2.5)
            tbl_borders = {}
            tb_el = tbl_pr.find(W + "tblBorders") if tbl_pr is not None else None
            if tb_el is not None:
                for s in ("top", "left", "bottom", "right", "insideH", "insideV"):
                    tbl_borders[s] = parse_border_side(tb_el.find(W + s))
            else:
                for s in ("top", "left", "bottom", "right", "insideH", "insideV"):
                    tbl_borders[s] = ("SOLID", "0.12 mm", "#000000")

            # Word 기본 셀 안여백: 좌우 108 twip(540 HWPUNIT), 상하 0
            cm_l, cm_r, cm_t, cm_b = 540, 540, 0, 0
            tcm = tbl_pr.find(W + "tblCellMar") if tbl_pr is not None else None
            if tcm is not None:
                cm_l = _w_int(tcm.find(W + "left"), "w", 108) * 5
                cm_r = _w_int(tcm.find(W + "right"), "w", 108) * 5
                cm_t = max(0, _w_int(tcm.find(W + "top"), "w", 0) * 5 + table_vmargin_delta)
                cm_b = max(0, _w_int(tcm.find(W + "bottom"), "w", 0) * 5 + table_vmargin_delta)

            trs = tbl_el.findall(W + "tr")
            n_rows = len(trs)
            n_cols = len(col_widths_hwp)
            repeat_hdr = "0"

            # 1차 셀 그리드 구축 (gridSpan + vMerge 해석)
            grid_rows: List[List[Dict[str, Any]]] = []
            row_heights_hwp: List[int] = []

            for r_idx, tr in enumerate(trs):
                tr_pr = tr.find(W + "trPr")
                rh_el = tr_pr.find(W + "trHeight") if tr_pr is not None else None
                rh_hwp = _w_int(rh_el, "val", 360) * 5
                row_heights_hwp.append(max(200, rh_hwp))
                if tr_pr is not None and tr_pr.find(W + "tblHeader") is not None:
                    repeat_hdr = "1"

                row_cells = []
                col_cursor = 0
                for tc in tr.findall(W + "tc"):
                    tc_pr = tc.find(W + "tcPr")
                    cs = _w_int(tc_pr.find(W + "gridSpan") if tc_pr is not None else None, "val", 1)
                    vm_el = tc_pr.find(W + "vMerge") if tc_pr is not None else None
                    vm_val = (_w_str(vm_el, "val") or "continue") if vm_el is not None else ""
                    shd_el = tc_pr.find(W + "shd") if tc_pr is not None else None
                    fill = _w_str(shd_el, "fill") if shd_el is not None else ""
                    if fill.lower() in ("auto", "ffffff"):
                        fill = ""
                    va_el = tc_pr.find(W + "vAlign") if tc_pr is not None else None
                    va_map = {"top": "TOP", "center": "CENTER", "bottom": "BOTTOM"}
                    va = va_map.get(_w_str(va_el, "val", "top").lower(), "TOP")

                    row_cells.append({
                        "col": col_cursor, "row": r_idx, "colspan": cs, "rowspan": 1,
                        "vm": vm_val, "fill": fill, "va": va, "tc": tc, "skip": False,
                    })
                    col_cursor += cs
                grid_rows.append(row_cells)

            # vMerge 세로 병합 결합
            for r_idx in range(n_rows):
                for cell in grid_rows[r_idx]:
                    if cell["vm"] == "continue" and r_idx > 0:
                        for up in range(r_idx - 1, -1, -1):
                            master = next((c for c in grid_rows[up] if c["col"] == cell["col"] and not c["skip"]), None)
                            if master is not None:
                                master["rowspan"] += 1
                                cell["skip"] = True
                                break

            # 2차 HWPX <hp:tr><hp:tc> 생성
            tr_xmls = []
            for r_idx, row_cells in enumerate(grid_rows):
                tc_xmls = []
                for cell in row_cells:
                    if cell["skip"]:
                        continue
                    c0, r0 = cell["col"], cell["row"]
                    cs, rs = cell["colspan"], cell["rowspan"]
                    cw = sum(col_widths_hwp[c0: min(n_cols, c0 + cs)])
                    ch = sum(row_heights_hwp[r0: min(n_rows, r0 + rs)])

                    cborders = {
                        "left": tbl_borders["left"] if c0 == 0 else tbl_borders["insideV"],
                        "right": tbl_borders["right"] if (c0 + cs >= n_cols) else tbl_borders["insideV"],
                        "top": tbl_borders["top"] if r0 == 0 else tbl_borders["insideH"],
                        "bottom": tbl_borders["bottom"] if (r0 + rs >= n_rows) else tbl_borders["insideH"],
                    }
                    bf_id = reg.get_border_fill(cborders, cell["fill"])

                    p_xmls = [convert_paragraph(p, inside_table=True) for p in cell["tc"].findall(W + "p")]
                    if not p_xmls:
                        p_xmls = [f'<hp:p id="{next_id()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p>']

                    tc_xmls.append(
                        f'<hp:tc name="" header="{"1" if r0 == 0 and repeat_hdr == "1" else "0"}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="{bf_id}">'
                        f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="{cell["va"]}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                        + "".join(p_xmls)
                        + "</hp:subList>"
                        + f'<hp:cellAddr colAddr="{c0}" rowAddr="{r0}"/>'
                        + f'<hp:cellSpan colSpan="{cs}" rowSpan="{rs}"/>'
                        + f'<hp:cellSz width="{cw}" height="{ch}"/>'
                        + f'<hp:cellMargin left="{cm_l}" right="{cm_r}" top="{cm_t}" bottom="{cm_b}"/>'
                        + "</hp:tc>"
                    )
                tr_xmls.append("<hp:tr>" + "".join(tc_xmls) + "</hp:tr>")

            total_h_hwp = sum(row_heights_hwp)
            tid = next_id()
            tbl_xml = (
                f'<hp:tbl id="{tid}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="{repeat_hdr}" rowCnt="{n_rows}" colCnt="{n_cols}" cellSpacing="0" borderFillIDRef="1" noAdjust="0">'
                f'<hp:sz width="{total_w_hwp}" widthRelTo="ABSOLUTE" height="{total_h_hwp}" heightRelTo="ABSOLUTE" protect="0"/>'
                '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
                '<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
                f'<hp:inMargin left="{cm_l}" right="{cm_r}" top="{cm_t}" bottom="{cm_b}"/>'
                + "".join(tr_xmls)
                + "</hp:tbl>"
            )
            # 표를 감싸는 문단은 여백 0, 행간 100%로 고정해 불필요한 상하 공백 차단
            tbl_ppr = reg.get_para_pr({"align": "LEFT", "left": 0, "right": 0, "intent": 0, "prev": 0, "next": 0, "ls_type": "PERCENT", "ls_val": 100})
            return f'<hp:p id="{next_id()}" paraPrIDRef="{tbl_ppr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">{tbl_xml}</hp:run></hp:p>'

        # 4) secPr + 머리말/꼬리말 컨트롤 조립
        sec_pr_xml = (
            '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">'
            '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
            '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
            '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
            '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
            f'<hp:pagePr landscape="WIDELY" width="{pg_w_twip * 5}" height="{pg_h_twip * 5}" gutterType="LEFT_ONLY">'
            f'<hp:margin header="{hwp_hdr}" footer="{hwp_ftr}" gutter="{m_gutter * 5}" left="{m_left * 5}" right="{m_right * 5}" top="{hwp_top}" bottom="{hwp_bottom}"/>'
            "</hp:pagePr>"
            '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>'
            '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>'
            '<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>'
            "</hp:secPr>"
            '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>'
        )

        if has_header and hdr_xml_content:
            h_root = etree.fromstring(hdr_xml_content)
            h_ps = "".join(convert_paragraph(p) for p in h_root.findall(W + "p"))
            sec_pr_xml += f'<hp:ctrl><hp:header id="{next_id()}" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{h_ps}</hp:subList></hp:header></hp:ctrl>'
        if has_footer and ftr_xml_content:
            f_root = etree.fromstring(ftr_xml_content)
            f_ps = "".join(convert_paragraph(p) for p in f_root.findall(W + "p"))
            sec_pr_xml += f'<hp:ctrl><hp:footer id="{next_id()}" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{f_ps}</hp:subList></hp:footer></hp:ctrl>'

        # 5) 본문 순회 변환
        sec_blocks: List[str] = []
        first_para_done = False
        for child in body:
            tag = etree.QName(child).localname
            if tag == "p":
                prefix = sec_pr_xml if not first_para_done else ""
                first_para_done = True
                sec_blocks.append(convert_paragraph(child, extra_prefix_xml=prefix))
            elif tag == "tbl":
                if not first_para_done:
                    first_para_done = True
                    sec_blocks.append(f'<hp:p id="{next_id()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">{sec_pr_xml}<hp:t/></hp:run></hp:p>')
                sec_blocks.append(convert_table(child))

        if not first_para_done:
            sec_blocks.append(f'<hp:p id="{next_id()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">{sec_pr_xml}<hp:t/></hp:run></hp:p>')

    section0_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<hs:sec xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
        'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
        'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" '
        'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">'
        + "".join(sec_blocks)
        + "</hs:sec>"
    )
    header_xml = reg.build_header_xml()

    # 패키징 파일들 (KS X 6101 필수 메타)
    version_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>'
    container_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'
    manifest_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'

    bin_manifest = "".join(
        f'<opf:item id="{bid}" href="{bpath}" media-type="image/{Path(bpath).suffix.lstrip(".")}" isEmbeded="1"/>'
        for bid, bpath, _ in bin_items
    )
    content_hpf = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">'
        '<opf:metadata><opf:title/><opf:language>ko</opf:language></opf:metadata>'
        "<opf:manifest>"
        '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
        '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
        f"{bin_manifest}"
        "</opf:manifest>"
        '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>'
        "</opf:package>"
    )

    hwpx_path = Path(hwpx_path)
    hwpx_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(str(hwpx_path), "w") as out_zf:
        # KS X 6101 규격: mimetype은 반드시 첫 번째 항목 + 무압축(ZIP_STORED)
        out_zf.writestr("mimetype", "application/hwp+zip", compress_type=zipfile.ZIP_STORED)
        out_zf.writestr("version.xml", version_xml, compress_type=zipfile.ZIP_DEFLATED)
        out_zf.writestr("META-INF/container.xml", container_xml, compress_type=zipfile.ZIP_DEFLATED)
        out_zf.writestr("META-INF/manifest.xml", manifest_xml, compress_type=zipfile.ZIP_DEFLATED)
        out_zf.writestr("Contents/content.hpf", content_hpf, compress_type=zipfile.ZIP_DEFLATED)
        out_zf.writestr("Contents/header.xml", header_xml, compress_type=zipfile.ZIP_DEFLATED)
        out_zf.writestr("Contents/section0.xml", section0_xml, compress_type=zipfile.ZIP_DEFLATED)
        for _, bpath, raw in bin_items:
            out_zf.writestr(bpath, raw, compress_type=zipfile.ZIP_DEFLATED)

    return hwpx_path


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("사용법: python docx_to_hwpx.py <입력.docx> <출력.hwpx>")
        sys.exit(1)
    out = convert_docx_to_hwpx(Path(sys.argv[1]), Path(sys.argv[2]))
    print("HWPX 변환 완료:", out)
