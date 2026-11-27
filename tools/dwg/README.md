# DWG 변환 엔진 (LibreDWG WebAssembly)

- 파일: `libredwg-web.js`, `libredwg-web.wasm` — npm `@mlightcad/libredwg-web` 0.9.4 의 `wasm/` 폴더 파일 그대로(수정 없음)
- 하는 일: STAR Works CAD 뷰어(`../sw_viewer.html`)가 DWG를 열 때 이 엔진으로 DXF로 바꿉니다. 변환은 사용자 기기 안에서만 실행됩니다.
- 라이선스: GNU GPL-3.0 (LibreDWG · libredwg-web). 전문: https://www.gnu.org/licenses/gpl-3.0.html
- 소스
  - LibreDWG: https://www.gnu.org/software/libredwg/ · https://github.com/LibreDWG/libredwg
  - WebAssembly 묶음: https://github.com/mlightcad/libredwg-web
- 확인한 DWG 형식(2026-11-27): R14 · 2000 · 2004 · 2007 · 2010 · 2013 · 2018 (AutoCAD 2018~2026은 2018 형식) — 변환 결과를 오토캐드 DXF와 비교해 선분 수 99.8 ~ 100 % 일치
- R13 형식은 약 11 % 만 읽혀 지원 범위에서 뺌
- 새 버전으로 바꿀 때: `npm install @mlightcad/libredwg-web` → `node_modules/@mlightcad/libredwg-web/wasm/` 의 두 파일을 이 폴더에 복사
