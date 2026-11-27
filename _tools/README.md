# 메뉴 구성 (2026-11-27 대표 지시)
- 메뉴 5개: 회사소개 · 프로젝트 · 플레이리스트 · 툴 · 연락처 (`i18n.py` NAV)
- 고친 뒤 순서: `make_playlist.py` → `make_tools.py` → `make_static.py`

## 플레이리스트 `playlist.html` (영상 4페이지 → 1페이지)
- 위 탭: 강의 · 기술 · 이야기 · 홍보 — 누르면 아래 창만 바뀜 (새로 읽지 않음)
- 주소: `playlist.html#lectures` · `#tech` · `#stories` · `#promo`
  - 분류 바로 가기 id는 탭 이름을 앞에 붙임: `#lectures-rubber`, `#tech-machining`, `#stories-baby-dino`
- 생성: `python3 _tools/make_playlist.py` — `make_lectures.py`·`make_videos.py`로 실행해도 같은 결과
  - 강의 탭 = lectures.json, 기술·이야기·홍보 탭 = videos.json (json 형식 그대로)
  - 각 탭 맨 위 최신 영상 1편 규칙 그대로. 유튜브 창은 그 탭을 열 때만 불러옴(`data-src`)
- 옛 주소 `lectures.html`·`tech.html`·`stories.html`·`promo.html`(영어·한국어)는 이동 페이지
  - `lectures.html#rubber` → `playlist.html#lectures-rubber` (유튜브 설명란 옛 링크 보호) — 손으로 고치지 않음
- 영상 갱신 검사: 새 id가 `playlist.html`·`ko/playlist.html`에 있는지 확인

## 툴 `tools.html` (CAD · 시편 주문 · CAM)
- CAD: CAD 뷰어(`tools/sw_viewer.html`) — 2D DWG·DXF + 3D STEP·IGES·STL 통합 (2026-11-27, 옛 DXF 뷰어·3D CAD 뷰어를 합침)
  - 파일 열기 버튼: 다운로드 · 카카오톡(폴더 기억) · 다른 위치, 여러 파일 ◀ ▶, 한 파일의 여러 시트 ◀ ▶
  - 겹친 선은 한 개만 표시(도면 겹쳐 열기 기능 없음)
  - 휴대폰: `tools/manifest.webmanifest` + `tools/sw_viewer_sw.js` + `tools/icons/` — 앱으로 설치하면 카카오톡 파일 › 공유 › CAD 뷰어로 바로 열림(서비스 워커는 공유 받기만 처리, 화면은 저장해 두지 않음)
  - DWG: `tools/dwg/`의 LibreDWG WebAssembly(GPL-3.0, `@mlightcad/libredwg-web` 0.9.4 그대로)로 기기 안에서 DXF로 바꿔 엶 — R14 ~ 2018 형식(AutoCAD R14 ~ 2026), 범위는 뷰어 처음 화면에 표기
  - 옛 `tools/dxf_viewer.html` · `tools/cad_viewer.html` 은 이동 페이지
  - 새 창으로 엶 (2026-11-27 17:59 대표 지시: 도면은 큰 화면에서) — `PROGRAMS`의 `"launch": True`
    - 위 [CAD 뷰어 ↗] 버튼과 아래 여는 화면의 큰 버튼 = 새 탭, 작은 버튼 [이 화면에서 열기] = 예전처럼 아래 창
    - 페이지를 열 때 자동으로 새 창을 띄우지 않음(브라우저가 팝업으로 막음)
- 시편 주문: 시편 설계·견적(`coupon-tool.html`, 따로 둔 페이지) — 2026-11-27 18:01 대표 지시로 CAM과 분리
- CAM: 조각기 CAM(`coupon-tool/cam.html`)
- 시편 주문·CAM은 위 버튼을 누르면 아래 창에서 실행, 한 번 연 프로그램은 다른 것으로 바꿔도 그대로 남음
- 주소: `tools.html#viewer` · `#coupon` · `#cam` (옛 `#dxf` · `#cad3d` 는 `#viewer` 로), 해시가 없으면 이 브라우저에서 마지막으로 쓴 프로그램
- 시편 설계는 툴 안에서 `coupon-tool.html?embed=1`로 열려 사이트 머리글을 숨김 (`make_tools.py`가 넣음)
- 생성: `python3 _tools/make_tools.py` (프로그램 추가 = `PROGRAMS`에 한 줄)
- 뷰어 원본(대표 PC): `D:\\Dropbox\\00-유투브제작\\sw_viewer\\` (`src/` 수정 → `node build.js` → `sw_viewer.html`)
  - 원본이 바뀌면 `tools/sw_viewer.html`로 그대로 복사해 push
- 기획서: `_tools/홈페이지_플레이리스트·툴_재구성_v1.md`, `_tools/홈페이지_툴_새창열기·3분류_v1.md`

# 바로가기 아이콘 (2026-11-27 대표 지시: 바탕화면 바로가기에 스타웍스 로고)
- 그림: `images/icons/` + 루트 `favicon.ico` — `python3 _tools/make_icons.py`가 `images/logo.svg`의 별 마크·글자로 만듦 (로고가 바뀔 때만 실행, playwright·Pillow 필요)
  - 작은 것(16~64, `icon.svg`) = 군청 바탕 + 별 마크, 큰 것(96~512) = 별 마크 + STAR Works, `maskable-*` = 안드로이드, `apple-touch-icon.png` = 아이폰
- 매니페스트: `manifest.webmanifest`(영어, 시작 `/`) · `ko/manifest.webmanifest`(한국어, 시작 `/ko/`) — 손으로 고침, 아이콘 주소는 `/images/icons/…`
- 머리글 줄(아이콘·매니페스트·테마 색)은 `i18n.icon_links()` 한 곳 — `page_shell.head`, `make_static.py`, `make_tools.py`(시편 설계)가 넣음
- 크롬: ⋮ › 전송, 저장, 공유 › [바로가기 만들기] 또는 [페이지를 앱으로 설치] 때 이 아이콘을 씀. 주소를 바탕화면으로 끌어 만든 바로가기(.url)는 브라우저 모양 그대로(사이트에서 못 바꿈)
- CAD 뷰어(`tools/`)는 자기 매니페스트(`tools/manifest.webmanifest`, 이름 「스타웍스 CAD」) — 따로 설치되는 앱(카카오톡 공유 받기 포함)
  - 설치 아이콘 `tools/icons/viewer-*.png` = 스타웍스 로고 + 아래 하늘색 띠 "CAD" (`make_icons.py`가 같이 만듦, 2026-11-27 대표 지시)
  - 짧은 주소 `starworks-korea.github.io/cad` → `tools/sw_viewer.html` (`cad/index.html`, 영상 설명란·안내용)
- 기획서: `_tools/홈페이지_바로가기_아이콘_v1.md`

# 홈페이지 두 언어 (2026-11-15 대표 지시: 홈페이지도 영어 기본)
- 루트 = 영어(기본), `ko/` = 한국어. 파일 이름은 같음 (예: `lectures.html` ↔ `ko/lectures.html`)
- 모든 페이지 메뉴 끝에 언어 버튼(🌐 한국어 / 🌐 English), hreflang 서로 연결 — 공통 코드 `_tools/i18n.py`
- 플레이리스트: `make_playlist.py`(또는 `make_lectures.py`·`make_videos.py`) 한 번 실행으로 영어·한국어 둘 다 생성
  - 영어 글은 json의 `_en` 칸: 분야 `name_en`·`desc_en`, 영상 `title_en`, 페이지 `title_en`·`sub_en`·`nav_en`, 예제 `title_en`·`desc_en`
  - `title_en`이 비면 한국어 제목이 영어 페이지에 나옴 → 새 영상은 반드시 채움 (영어 기본으로 올린 영상은 유튜브 제목이 영어이므로 그대로, 한국어 `title`은 한국어 번역 제목)
- 고정 페이지(회사소개·프로젝트·연락처): 원본은 `ko/index.html`·`ko/projects.html`·`ko/contact.html`(한국어, 손으로 고침)
  - 고친 뒤 `python3 _tools/make_static.py` → 메뉴 맞춤 + 번역표(`TX`)로 영어판 생성. 번역표에 없는 한글이 남으면 그 문장을 출력하고 멈춤 → 번역표에 추가
- 사이트맵: 고정 페이지 영어·한국어 6개 + 시편 설계 2개 + 툴 2개 (플레이리스트는 noindex)

# 영상 페이지 맨 위 = 최신 영상 1편 (2026-11-24 대표 지시)
- 대표 지시: 가장 최근에 올린 영상을 제일 위에 크게 보이게, 아래쪽은 지금까지 올린 영상 전부
- 강의·기술·홍보·이야기 4페이지 모두: 맨 위(특집 다음)에 최신 영상 1편 — 공통 코드 `_tools/latest_ui.py`
  - 고르는 기준: 업로드 날짜(`date`)가 가장 늦은 항목, 같은 날짜면 json에서 뒤에 있는 항목. `hide`·비공개는 고르지 않음
  - 강의 페이지는 강의 + 해석 기초 예제 중에서 고름
  - 한국어 페이지는 `ko_id`(한국어판)가 있으면 그 영상을 보여 줌
  - 이야기 페이지 특집(`features`)에 이미 있는 영상이면 최신 영상 칸을 따로 만들지 않음
- 최신 영상도 아래 분류 목록에 그대로 남습니다 (전체 목록)
- 페이지 위쪽에 있던 공개·회원 공개 목록과 언어 버전 요약은 없앴습니다. 공개 범위·언어 표시는 카드마다 그대로

# 영상 페이지 갱신 시점 (2026-11-16 대표 지시)
- 주기 갱신(예약 작업)은 없앴습니다. **유튜브에 영상을 올린 그 작업 안에서, 업로드 확인이 끝난 직후** 갱신합니다
- 절차: 스킬 `homepage-yeongsang-gaengsin` (스튜디오 목록 1회 읽기 → json과 비교해 바뀐 영상만 → 분류·언어 읽기 → json → 생성기 → push → 바뀐 페이지 확인). 비공개로만 올렸으면 갱신하지 않음
- 대표가 직접 올리거나 지운 뒤에는 "홈페이지 갱신해 줘"로 같은 절차

# 강의 영상 페이지 (lectures.html) 만들기

- `_tools/` 폴더는 GitHub Pages(Jekyll)에서 공개되지 않습니다.
- 영상 목록: `lectures.json` — 고친 뒤 `python3 _tools/make_lectures.py` 실행 → `lectures.html` 다시 생성
- 대상: 유튜브 제목이 `[분야 번호] 내용 | AI 에이전트 유한요소 해석` 형식인 김영석 교수님 강의 영상 (공개 + 일부 공개)
- 같은 편이 두 개 이상이면(한국어판·글로벌판, 다시 올린 판) 페이지 카드는 1장 = 글로벌판(없으면 최신 판). 다른 판 id는 그 항목의 `ko_id`(한국어판)·`old_ids`(이전 판)에 적어 둡니다 — 다음 갱신 때 새 영상으로 다시 보지 않게. **유튜브 영상은 지우지 않습니다** (대표 지시 2026-11-16 22:17: 링크가 없어지면 보신 분들이 불안). 생성 코드는 이 두 칸을 쓰지 않습니다.
- `date`: 유튜브 스튜디오 업로드 날짜, `updated`: 목록이 마지막으로 바뀐 시각(한국 시간) — 바뀐 것이 없으면 그대로 둠
- `examples`: 강의 시리즈 밖의 **해석 기초 예제**(고무 부트 구조해석·유동해석). 갱신 작업은 `videos`만 바꾸고 `examples`는 그대로 둡니다. 예제를 더하거나 뺄 때만 손으로 고칩니다.
- `vis`: 유튜브 공개 범위 — "공개" 또는 "일부 공개". 카드와 맨 위 최신 영상 칸의 표시에 씁니다. 갱신 작업은 videos와 examples 모두 스튜디오 값으로 맞춥니다(examples는 추가·삭제 없이 vis·dur·date만).
- `lang`: 언어 버전 {ko, en, ja, es, etc} — "원본"(원본 음성) / "더빙"(직접 만든 더빙·자막) / "자동"(유튜브 자동 더빙) / ""(준비 중). 시청 페이지 ytInitialPlayerResponse의 오디오 트랙(audioTrack, 자동 더빙 여부)과 수동 자막으로 판정합니다.
- `lang.etc`: 그 밖의 언어 — 상태별 언어 이름 목록, 예 `{"자동": ["인도네시아어"]}` (없으면 `{}`)
- 화면 표시: `vis` "일부 공개"는 페이지에 **"회원 공개"**로 보입니다 (대표 결정 2026-11-15). json에는 유튜브 표기("일부 공개") 그대로 둡니다.

# 기술 영상(tech.html) · 홍보 영상(promo.html) · 이야기(stories.html) — 2026-11-15 추가
- 목록: `videos.json`의 `pages` (페이지마다 fields·videos) — 고친 뒤 `python3 _tools/make_videos.py` 실행 → 세 페이지 다시 생성
- 분류 (대표 결정 2026-11-15)
  - 기술 영상 `tech`: 가공(AI 가공·CNC·MCT·G코드) · 제품 개발(휴머노이드·판스프링·면도기·소재분리기 등) · 오픈소스 해석(FreeCAD FEM 등)
  - 홍보 영상 `promo`: 이랑산업 관련(기업 소개·조립 라인 등) · 스타웍스 제품 홍보(플라스틱 골판지 등)
  - 이야기 `stories`: 대표가 혼자 만드는 이야기 영상(옛날이야기·에세이)
- 페이지 위쪽 요약(공개·회원 공개 목록, 언어 버전 요약)은 없앴습니다 (2026-11-24). 공개 범위·언어는 카드마다 표시.
- **비공개 영상은 절대 올리지 않습니다** (저작권 등). 공개·일부 공개만. 비공개로 바뀌면 페이지에서 뺍니다.
- 이 페이지들의 영상도 유튜브에서 **지우지 않습니다**. 같은 영상의 다른 판은 강의와 같이 `ko_id`·`old_ids`에 적고 페이지에는 1장만.
- `"hide": true`가 있는 항목은 페이지에 넣지 않습니다 (대표 지시 2026-11-20: 용접 변형 bWfDLImP_fc · T바 슬롯다이 zmmx1sqxW6M). 항목은 json에 남겨 둡니다 — 다음 갱신 때 새 영상으로 다시 넣지 않게. 유튜브 영상은 그대로.
- `lang`은 강의 페이지와 같은 기준. 말소리·자막이 없는 영상은 `{"none": true}` → "음성 없음"으로 표시
- `lang_lock`이 있는 항목은 언어 값을 자동으로 바꾸지 않습니다 (예: bHiXW7Af56Q 영어판 유동해석 = 영어 원본, 대표 확인)

# 강의 영상 리뷰 (lectures.html · ko/lectures.html) — 2026-11-16 추가
- 대표 지시: 강의 영상 카드 아래 「💬 리뷰」 → 누르면 창이 열려 이름 + 리뷰 내용을 쓰고, 남긴 리뷰를 봄 (강의 페이지만, 방문자 로그인 없음)
- 화면 코드: `_tools/reviews_ui.py` (버튼·창·글·스크립트), `make_lectures.py`가 넣음
- 저장소: 구글 시트 + 앱스 스크립트 웹 앱 — 코드 원본 `_tools/reviews_apps_script.gs` (맨 위 주석에 배포 순서)
- 연결: `lectures.json`의 `"review_api"`에 웹 앱 URL(`…/exec`) → `python3 _tools/make_lectures.py` → push
  - `review_api`가 비면 리뷰 버튼·창을 만들지 않음 (페이지는 예전과 똑같음)
- 관리: 시트 `reviews`의 「숨김」 칸에 아무 글자나 쓰면 페이지에서 안 보임. 행을 지워도 됨
- 막기: 봇 함정 칸, 이름 30자·내용 1000자, 같은 글 6시간 안 반복 거절, 1분 30건 넘으면 잠시 거절, 시트에는 글자 그대로 저장(수식 주입 차단), 화면은 글자로만 표시(스크립트 주입 차단)
- 이름은 방문자 브라우저에 기억(다음에 자동 입력). 휴대폰에서는 창이 전체 화면, 키보드가 바로 뜨지 않음

# CAD 뷰어 소개 영상 (2026-11-27 대표 지시: 업로드 + 홈페이지 링크)
- 영어판 `diJ3_QjG0ag` · 한국어판 `RU6GZ8yLlcY` — 화면 글자까지 다른 판이라 따로 올림 (일부 공개)
- 플레이리스트 › 기술 › 제품 개발: json 한 항목, `ko_card: true` → 한국어 페이지 카드·맨 위 영상은 `ko_id`(길이 `dur_ko`, 언어 `lang_ko`) (`make_videos.py`)
- 툴 › CAD 뷰어 여는 화면: [소개 영상 보기] 링크 = `make_tools.py` `PROGRAMS`의 `"video": (한국어판, 영어판)`
- 영상 설명란 링크: `starworks-korea.github.io/cad` (영어판은 `/cad/?lang=en`)
