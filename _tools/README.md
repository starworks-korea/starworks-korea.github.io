# 강의 영상 페이지 (lectures.html) 만들기

- `_tools/` 폴더는 GitHub Pages(Jekyll)에서 공개되지 않습니다.
- 영상 목록: `lectures.json` — 고친 뒤 `python3 _tools/make_lectures.py` 실행 → `lectures.html` 다시 생성
- 대상: 유튜브 제목이 `[분야 번호] 내용 | AI 에이전트 유한요소 해석` 형식인 김영석 교수님 강의 영상 (공개 + 일부 공개)
- 같은 `[분야 번호]`가 다시 올라오면 최신 영상만 남깁니다 (옛 영상은 유튜브에서 삭제, json에서 교체).
- `date`: 유튜브 스튜디오 업로드 날짜, `updated`: 목록이 마지막으로 바뀐 시각(한국 시간) — 바뀐 것이 없으면 그대로 둠
