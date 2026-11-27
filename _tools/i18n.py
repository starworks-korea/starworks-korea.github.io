# 홈페이지 두 언어 공통 — 영어(루트, 기본) / 한국어(ko/)
# 2026-11-15 대표 지시: 홈페이지도 영어 기본
SITE = "https://starworks-korea.github.io/"

# 2026-11-27 대표 지시: 영상 4개 → 「플레이리스트」 1개(강의·기술·이야기·홍보 탭), 툴 → 「툴」 1개(CAD·CAM)
NAV = [
    ("index.html", "회사소개", "About"),
    ("projects.html", "프로젝트", "Projects"),
    ("playlist.html", "플레이리스트", "Playlist"),
    ("tools.html", "툴", "Tools"),
    ("contact.html", "연락처", "Contact"),
]
CTA = {"ko": "제작 문의", "en": "Request a Quote"}

def t(lang, ko, en):
    return en if lang == "en" else ko

def asset(lang):
    """이미지 등 루트 자원 앞에 붙일 경로"""
    return "" if lang == "en" else "../"

def page_url(lang, file):
    f = "" if file == "index.html" else file
    return SITE + ("ko/" if lang == "ko" else "") + f

def hreflang(file):
    return (f'<link rel="alternate" hreflang="en" href="{page_url("en", file)}">\n'
            f'<link rel="alternate" hreflang="ko" href="{page_url("ko", file)}">\n'
            f'<link rel="alternate" hreflang="x-default" href="{page_url("en", file)}">')

def switch_link(lang, file):
    """같은 페이지의 다른 언어로 가는 버튼"""
    if lang == "en":
        href, label, code = "ko/" + file, "한국어", "ko"
    else:
        href, label, code = "../" + file, "English", "en"
    return (f'<a href="{href}" hreflang="{code}" lang="{code}" title="{t(lang, "영어 페이지", "Korean version")}" '
            f'style="margin-left: 4px; padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; '
            f'border: 1px solid rgba(255,255,255,0.45); border-radius: 999px">🌐 {label}</a>')

def nav(lang, active, file=None):
    """active: 메뉴에서 굵게 보일 항목, file: 이 페이지 파일(언어 버튼용 — 없으면 active)"""
    s = []
    for href, ko, en in NAV:
        label = t(lang, ko, en)
        if href == active:
            s.append(f'<a href="{href}" aria-current="page" style="padding: 12px 14px; font-size: 15px; font-weight: 700; color: #FFFFFF; border-bottom: 2px solid #FFFFFF">{label}</a>')
        else:
            s.append(f'<a href="{href}" style="padding: 12px 14px; font-size: 15px; color: #C9D3E0">{label}</a>')
    s.append(f'<a href="contact.html" style="margin-left: 8px; padding: 12px 18px; font-size: 14px; font-weight: 700; color: #FFFFFF; background: #0070C0; border-radius: 4px">{CTA[lang]}</a>')
    s.append(switch_link(lang, file or active))
    return "\n".join(s)

def footer_lines(lang):
    if lang == "en":
        return ["STAR Works · CEO Dong-Woo Shin",
                "1F, 10 Nammaegongwon-ro 2-gil, Gyeongsan-si, Gyeongsangbuk-do, Korea",
                "Tel +82-10-4401-7115 · shindongwoo@gmail.com"]
    return ["스타웍스 · 대표 신동우",
            "경북 경산시 남매공원로2길 10, 1층",
            "Tel 010-4401-7115 · shindongwoo@gmail.com"]

# 영상 페이지 공통 표기
VISLABEL = {"ko": {"공개": "공개", "일부 공개": "회원 공개"},
            "en": {"공개": "Public", "일부 공개": "Unlisted"}}
LANG_NAMES = {"ko": [("ko", "한국어"), ("en", "영어"), ("ja", "일본어"), ("es", "스페인어")],
              "en": [("ko", "Korean"), ("en", "English"), ("ja", "Japanese"), ("es", "Spanish")]}
LSTATE = {"ko": {"원본": "원본 음성", "더빙": "직접 만든 더빙·자막", "자동": "유튜브 자동 더빙", "": "준비 중"},
          "en": {"원본": "original audio", "더빙": "our own dub & subtitles", "자동": "YouTube auto-dub", "": "coming soon"}}
LSHORT = {"ko": {"원본": "원본", "더빙": "직접 더빙", "자동": "자동 더빙", "": "준비 중"},
          "en": {"원본": "Original", "더빙": "Our dub", "자동": "Auto dub", "": "Coming soon"}}
LANG_EN = {"한국어": "Korean", "영어": "English", "일본어": "Japanese", "스페인어": "Spanish",
           "인도네시아어": "Indonesian", "아랍어": "Arabic", "벵골어": "Bengali", "독일어": "German",
           "프랑스어": "French", "힌디어": "Hindi", "이탈리아어": "Italian", "히브리어": "Hebrew",
           "말라얄람어": "Malayalam", "네덜란드어": "Dutch", "펀자브어": "Punjabi", "폴란드어": "Polish",
           "포르투갈어": "Portuguese", "러시아어": "Russian", "타밀어": "Tamil", "텔루구어": "Telugu",
           "우크라이나어": "Ukrainian", "중국어": "Chinese", "베트남어": "Vietnamese", "태국어": "Thai",
           "터키어": "Turkish"}

def lang_name(lang, ko_name):
    return LANG_EN.get(ko_name, ko_name) if lang == "en" else ko_name

def tr(obj, key, lang):
    """json 항목에서 언어별 값 (영어가 없으면 한국어)"""
    if lang == "en" and obj.get(key + "_en"):
        return obj[key + "_en"]
    return obj.get(key, "")

def date_fmt(lang, d):
    if lang == "en":
        y, m, dd = d.split("-")
        mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(m) - 1]
        return f"{mon} {int(dd)}, {y}"
    return d.replace("-", ". ") + "."
