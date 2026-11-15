# 고정 페이지(회사소개·프로젝트·연락처) 두 언어 만들기
# 원본: ko/index.html · ko/projects.html · ko/contact.html (한국어, 손으로 고침)
# 사용: python3 _tools/make_static.py
#   1) ko/ 파일의 메뉴·언어 버튼·hreflang을 맞춤
#   2) 아래 번역표로 영어판을 루트에 만듦 (index.html 등)
#   3) 영어판에 한글이 남으면 그 문장을 출력하고 실패 → 번역표에 추가
import os, re, sys, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import i18n

FILES = ["index.html", "projects.html", "contact.html"]

# 화면 글·속성값 정확히 같을 때만 바꿈 (부분 치환 없음)
TX = {
 # 공통
 "주 메뉴": "Main menu",
 "스타웍스 STARWORKS": "STAR Works STARWORKS",
 "스타웍스 — 복합소재·플라스틱 제품, 해석부터 시제품까지. 경북 경산.": "STAR Works — composite & plastic products, from analysis to prototype. Gyeongsan, Korea.",
 "스타웍스 회사소개": "STAR Works — About",
 "스타웍스 프로젝트": "STAR Works — Projects",
 "스타웍스 연락처": "STAR Works — Contact",
 "스타웍스 · 대표 신동우": "STAR Works · CEO Dong-Woo Shin",
 "경북 경산시 남매공원로2길 10, 1층": "1F, 10 Nammaegongwon-ro 2-gil, Gyeongsan-si, Gyeongsangbuk-do, Korea",
 "Tel 010-4401-7115 · shindongwoo@gmail.com": "Tel +82-10-4401-7115 · shindongwoo@gmail.com",
 "010-4401-7115": "+82-10-4401-7115",
 "제작 문의하기": "Request a Quote",
 # 회사소개
 "복합소재·플라스틱 제품,": "Composites & plastics,",
 "해석부터 시제품까지.": "from analysis to prototype.",
 "자체 해석 솔버로 검토하고, 협력 설비로 만듭니다.": "We verify designs with our own analysis solver and build them with partner facilities.",
 "프로젝트 보기": "View Projects",
 "창업": "Founded",
 "중기부 장관상": "Minister of SMEs & Startups Award",
 "경산 이전": "Moved to Gyeongsan",
 "개인사업자 전환": "Became a sole proprietorship",
 "핵심 역량": "Core Capabilities",
 "복합소재·플라스틱": "Composites & Plastics",
 "CFRP·GFRP 성형, 사출 금형, 기능 수지": "CFRP/GFRP molding, injection molds, functional resins",
 "자체 해석 솔버": "In-House Analysis Solver",
 "Fortran 직접 작성 — 구조·유동·전자기장": "Written in Fortran — structural, flow, electromagnetic",
 "시편·시제품 제작": "Specimens & Prototypes",
 "시험 시편, 치구, 3D 프린팅 시제품": "Test specimens, fixtures, 3D-printed prototypes",
 "로봇 개발": "Robotics",
 "협동로봇 경로 생성·제어 프로그램": "Cobot path generation & control software",
 "숫자로 보는 결과": "Results in Numbers",
 "복합소재 부품 개발": "Composite Part Development",
 "금속–플라스틱 하이브리드 판스프링": "Metal–Plastic Hybrid Leaf Spring",
 "연속 유리섬유 열가소성 복합재 · 강판 스프링 대비": "Continuous glass-fiber thermoplastic composite · vs. steel leaf spring",
 "항목": "Item", "강판": "Steel", "복합재": "Composite", "무게": "Weight",
 "13 kg (−50 %)": "13 kg (−50 %)",
 "강성": "Stiffness", "9.6 kgf/mm 고정": "9.6 kgf/mm fixed", "7.9 ~ 30 kgf/mm 조절": "7.9 – 30 kgf/mm adjustable",
 "피로 수명": "Fatigue life", "30만 회": "300,000 cycles", "200만 회": "2,000,000 cycles",
 "규격": "Standard", "ES 규격 통과": "Passed ES standard",
 "운영 방식": "How We Work",
 "사무실 (경산)": "Office (Gyeongsan)",
 "설계 · 해석 · 시편 · 3D 프린팅": "Design · analysis · specimens · 3D printing",
 "CATIA · ANSYS 정품 / FDM 4대 · 레진": "Licensed CATIA · ANSYS / 4 FDM printers · resin printer",
 "설비 거점 (대구)": "Equipment Sites (Daegu)",
 "금형 가공 · 성형 · 사출": "Mold machining · molding · injection",
 "노원로: 장비 보관 / 성서: MCT / 협력사: 사출기": "Nowon-ro: equipment storage / Seongseo: MCT / Partners: injection machines",
 "대표 경력": "CEO Background",
 "해석 · 시험평가 · 복합소재 연구": "Analysis · testing & evaluation · composites research",
 "태성S&E(ANSYS) / 경북하이브리드부품연구원 / 다이텍연구원": "Taesung S&E (ANSYS) / Gyeongbuk Hybrid Technology Institute / DYETEC",
 "도면·사진 한 장이면 시작합니다.": "One drawing or photo is all we need to start.",
 "CFRP 방탄 헬멧 성형품": "Molded CFRP ballistic helmet",
 "고무 압출 노즐 유동 해석 결과": "Rubber extrusion nozzle flow analysis result",
 "복합재 시편": "Composite specimens",
 "하이브리드 판스프링 구조해석 응력 분포": "Stress distribution of the hybrid leaf spring",
 "협동로봇에 장착된 공구": "Tool mounted on a cobot",
 # 프로젝트
 "분야 필터": "Category filter",
 "수행 프로젝트": "Projects Delivered",
 "복합소재·플라스틱 · 해석 · 시편 · 로봇": "Composites & plastics · analysis · specimens · robotics",
 "전체": "All", "해석": "Analysis", "시편·시제품": "Specimens & Prototypes", "로봇": "Robotics",
 "CFRP 방탄 헬멧 성형": "CFRP Ballistic Helmet Molding",
 "헬멧 DP용 CFRP 제품 성형·납품": "Molding and delivery of CFRP parts for helmet DP",
 "AGV 배터리 케이스": "AGV Battery Case",
 "물류 운반 로봇용 CFRP 성형 · 알루미늄 금형 제작": "CFRP molding for logistics robots · aluminum mold making",
 "기어 금형 몰드베이스": "Gear Mold Base",
 "고온 내구성 레진 3D 프린팅 코어": "High-temperature resin 3D-printed core",
 "친환경 기능 수지": "Eco-Friendly Functional Resin",
 "기능성 수지 소재 개발·납품": "Functional resin development & supply",
 "수입·유통": "Import & Distribution",
 "22톤 화물차 복합소재 판스프링": "Composite Leaf Spring for 22-Ton Trucks",
 "HOWO MAX 적용 · 연 1,000대 수입·유통": "Fitted to HOWO MAX · 1,000 units a year imported & distributed",
 "개발": "Development",
 "무게 −50 % · 피로 200만 회 · ES 규격 통과": "Weight −50 % · 2 million fatigue cycles · passed ES standard",
 "사출": "Injection",
 "EV 충전 커넥터 사출 부품": "EV Charging Connector Injection Parts",
 "CCS COMBO TYPE1 부품 개발": "CCS COMBO TYPE1 part development",
 "NBR 고무 압출 성형해석": "NBR Rubber Extrusion Simulation",
 "자체 Fortran 3D 솔버 · 노즐별 제품 직경 예측": "In-house Fortran 3D solver · product diameter prediction per nozzle",
 "PP 폼 압축·체적변화 해석": "PP Foam Compression & Volume-Change Analysis",
 "자체 Fortran 솔버 · 시험 기반 물성 피팅": "In-house Fortran solver · test-based material fitting",
 "유도가열 전자기장·유동 해석": "Induction Heating Electromagnetic & Flow Analysis",
 "자속밀도 방향 → 3D 열유동 연계 · 승온 시간 산출": "Flux density direction → coupled 3D thermal flow · heat-up time",
 "전자기장 해석 및 무선충전 시스템 개발": "Electromagnetic Analysis & Wireless Charging System Development",
 "CAE 기술 중심": "CAE-driven",
 "ANSYS 자기장 해석": "ANSYS magnetic field analysis",
 "페라이트 코어 형상 설계": "Ferrite core shape design",
 "결속부 구조해석": "Structural analysis of the mount",
 "송수신 효율 80 %": "Transfer efficiency 80 %",
 "고정하중 101 N": "Holding load 101 N",
 "특허 출원": "Patent filed",
 "F-4 스피드브레이크 해석": "F-4 Speed Brake Analysis",
 "공군 항공기 유동·하중·피로 해석": "Air Force aircraft flow, load & fatigue analysis",
 "복합재 시험 시편 제작": "Composite Test Specimens",
 "규격 시험용 CFRP 시편 가공": "CFRP specimens machined for standard tests",
 "시제품": "Prototype",
 "SUT용 복합소재 리프 스프링": "Composite Leaf Spring for SUT",
 "렉스턴 스포츠(스포츠 유틸리티 트럭) 적용 · 탄소섬유 복합소재 시제품": "For the Rexton Sports (sport utility truck) · carbon-fiber composite prototype",
 "치구": "Fixture",
 "복합소재 ISO 시험 치구": "Composite ISO Test Fixtures",
 "규격 시험용 치구 설계·제작": "Design & fabrication of fixtures for standard tests",
 "협동로봇 경로 생성 시뮬레이터": "Cobot Path Generation Simulator",
 "스케치 → 경로 → 로봇 프로그램 · TCP 제어": "Sketch → path → robot program · TCP control",
 "박스 이송 자동화 설비 설계": "Automated Box Conveying Equipment Design",
 "라벨링·테이핑 승강 컨베이어": "Labeling & taping lift conveyor",
 "참여 연구 이력": "Research Participation",
 "2006 – 2018 · 51건 · 연구기관·대학 공동 수행": "2006 – 2018 · 51 projects · with research institutes & universities",
 "복합소재 부품": "Composite Parts", "9건": "9 projects",
 "CFRP 브레이딩 프로펠러 샤프트 — 차량 시험 적용 (2015–17)": "CFRP braided propeller shaft — vehicle testing (2015–17)",
 "CFRP–금속 이종소재 접합 (2016–18)": "CFRP–metal dissimilar joining (2016–18)",
 "복합소재 로보브레이딩 시범공장 (2016–18)": "Composite robo-braiding pilot plant (2016–18)",
 "판재 성형·공정 해석": "Sheet Forming & Process Analysis", "14건": "14 projects",
 "AL 판재 하이드로포밍·롤러 해밍 (2007–08)": "Aluminum sheet hydroforming & roller hemming (2007–08)",
 "TRB 이종두께 판재 성형 (2011)": "Tailor-rolled blank (TRB) forming (2011)",
 "롤포밍·디버링·키홈 가공 (2014–18)": "Roll forming, deburring & keyway machining (2014–18)",
 "구조·충돌·피로": "Structure, Crash & Fatigue", "13건": "13 projects",
 "F-4 스피드브레이크 하중·피로 (2010)": "F-4 speed brake load & fatigue (2010)",
 "측면충돌·사이드실 충격 (2011–12)": "Side impact & side-sill crash (2011–12)",
 "무한궤도 아이들러 충격 (2013)": "Track idler impact (2013)",
 "유동·열·전자기장": "Flow, Heat & Electromagnetics", "10건": "10 projects",
 "수소압축기 구조–유체 연성 (2009)": "Hydrogen compressor fluid–structure interaction (2009)",
 "버터플라이 밸브 Cv·토크 (2018)": "Butterfly valve Cv & torque (2018)",
 "전극체 전자기장 형상 최적화 (2018)": "Electrode electromagnetic shape optimization (2018)",
 "장비·자동화": "Equipment & Automation", "5건": "5 projects",
 "CFRP·아라미드 진동감쇠 로봇암 (2016)": "CFRP/aramid vibration-damping robot arm (2016)",
 "차체 스팟용접 자동 치구 (2013)": "Automatic fixture for car-body spot welding (2013)",
 "철근 가공 시스템 G·M코드 (2011–14)": "Rebar processing system G/M code (2011–14)",
 "비슷한 개발이 필요하신가요?": "Need something similar developed?",
 "구조·충돌·피로 연구 사례": "Structure, crash & fatigue research",
 "렉스턴 스포츠 SUT용 복합소재 리프 스프링": "Composite leaf spring for the Rexton Sports SUT",
 "무선충전 코어 전자기장 해석과 무선충전 시제품": "Wireless charging core electromagnetic analysis and prototype",
 "복합소재 부품 연구 사례": "Composite parts research",
 "유동·열·전자기장 연구 사례": "Flow, heat & electromagnetics research",
 "장비·자동화 연구 사례": "Equipment & automation research",
 "판재 성형·공정 해석 연구 사례": "Sheet forming & process analysis research",
 # 연락처
 "제작 문의": "Request a Quote",
 "도면·사진·시험 데이터와 함께 보내 주세요.": "Send us your drawings, photos, or test data.",
 "지도에서 보기": "View on Map",
 "스타웍스 위치 지도": "STAR Works location map",
 "문의 양식": "Inquiry Form",
 "이름 *": "Name *", "회사·기관명": "Company / Organization", "연락처 *": "Phone *", "이메일 *": "Email *",
 "문의 분야": "Inquiry Type",
 "복합소재·플라스틱 제품": "Composite & plastic products",
 "금형·사출": "Molds & injection",
 "해석 (자체 솔버·CAE)": "Analysis (in-house solver · CAE)",
 "로봇·자동화": "Robotics & automation",
 "정부과제 협력": "Government R&D collaboration",
 "문의 내용 *": "Message *",
 "도면(STEP·DXF·PDF)·사진은 이메일로 보내 주세요.": "Please email drawings (STEP · DXF · PDF) and photos.",
 "개인정보 수집·이용에 동의합니다. (필수)": "I agree to the collection and use of my personal information. (Required)",
 "문의 보내기": "Send Inquiry",
}
# 문의 양식 메일 문구 (스크립트 안)
SCRIPT_TX = [("'[홈페이지 문의] '", "'[Website Inquiry] '"), ("'이름: '", "'Name: '"),
             ("'회사·기관명: '", "'Company: '"), ("'연락처: '", "'Phone: '"),
             ("'이메일: '", "'Email: '"), ("'문의 분야: '", "'Inquiry type: '"),
             ("f === '전체'", "f === 'All'"), ("tel:010-4401-7115", "tel:+821044017115")]
ATTRS = ("alt", "title", "content", "aria-label", "data-filter", "data-cat", "placeholder")
HANGUL = re.compile(r"[가-힣]")

def chrome(s, lang, file):
    s = re.sub(r'<html lang="[^"]*">', f'<html lang="{lang}">', s, count=1)
    s = re.sub(r'\n?<link rel="alternate" hreflang[^>]*>', "", s)
    s = re.sub(r'(<link rel="icon"[^>]*>)', lambda m: m.group(1) + "\n" + i18n.hreflang(file), s, count=1)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{i18n.page_url(lang, file)}">', s, count=1)
    s = re.sub(r'(<nav aria-label=")[^"]*("[^>]*>).*?(</nav>)',
               lambda m: m.group(1) + i18n.t(lang, "주 메뉴", "Main menu") + m.group(2) + "\n" + i18n.nav(lang, file) + "\n" + m.group(3),
               s, count=1, flags=re.S)
    return s

def to_en(s):
    def txt(m):
        raw = m.group(1); key = raw.strip(); ukey = html.unescape(key)
        if ukey in TX:
            return ">" + raw.replace(key, html.escape(TX[ukey], quote=False)) + "<"
        return m.group(0)
    s = re.sub(r">([^<>]+)<", txt, s)
    def att(m):
        v = html.unescape(m.group(2))
        return f'{m.group(1)}="{html.escape(TX[v], quote=True)}"' if v in TX else m.group(0)
    s = re.sub(r'\b(' + "|".join(ATTRS) + r')="([^"]*[가-힣][^"]*)"', att, s)
    for a, b in SCRIPT_TX:
        s = s.replace(a, b)
    # 영어 제목은 한국어보다 길어 첫 화면 큰 제목 글자를 줄임 (한 줄에 한 구절)
    s = s.replace('<h1 style="margin: 0; font-size: 54px; line-height: 1.22;', '<h1 style="margin: 0; font-size: 46px; line-height: 1.2;')
    return s

def fix_ko_paths(s):
    s = re.sub(r'((?:src|href)=")images/', r'\1../images/', s)
    return s.replace("url(images/", "url(../images/")

def main():
    bad = []
    os.makedirs(os.path.join(ROOT, "ko"), exist_ok=True)
    for f in FILES:
        kp = os.path.join(ROOT, "ko", f)
        ko = open(kp, encoding="utf-8").read()
        ko = chrome(fix_ko_paths(ko), "ko", f)
        open(kp, "w", encoding="utf-8").write(ko)
        en = ko.replace("../images/", "images/")
        en = chrome(to_en(en), "en", f)
        left = [l.strip() for l in re.findall(r">([^<>]*[가-힣][^<>]*)<", en)] + \
               [v for v in re.findall(r'="([^"]*[가-힣][^"]*)"', en)]
        left = [x for x in left if x not in ("한국어", "🌐 한국어")]
        if left: bad.append((f, left))
        open(os.path.join(ROOT, f), "w", encoding="utf-8").write(en)
        print(f, "ok" if not left else f"한글 남음 {len(left)}")
    for f, left in bad:
        print("==", f); [print("  ", x) for x in left]
    if bad: sys.exit(1)

if __name__ == "__main__":
    main()
