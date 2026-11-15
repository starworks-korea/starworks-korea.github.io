# 강의 영상 페이지 (lectures.html) 만들기

- `_tools/` 폴더는 GitHub Pages(Jekyll)에서 공개되지 않습니다.
- 영상 목록: `lectures.json` — 고친 뒤 `python3 _tools/make_lectures.py` 실행 → `lectures.html` 다시 생성
- 대상: 유튜브 제목이 `[분야 번호] 내용 | AI 에이전트 유한요소 해석` 형식인 김영석 교수님 강의 영상 (공개 + 일부 공개)
- 같은 `[분야 번호]`가 다시 올라오면 최신 영상만 남깁니다 (옛 영상은 유튜브에서 삭제, json에서 교체).
- `date`: 유튜브 스튜디오 업로드 날짜, `updated`: 목록이 마지막으로 바뀐 시각(한국 시간) — 바뀐 것이 없으면 그대로 둠
- `examples`: 강의 시리즈 밖의 **해석 기초 예제**(고무 부트 구조해석·유동해석). 예약 작업은 `videos`만 바꾸고 `examples`는 그대로 둡니다. 예제를 더하거나 뺄 때만 손으로 고칩니다.
- `vis`: 유튜브 공개 범위 — "공개" 또는 "일부 공개". 페이지 위쪽 공개/일부 공개 목록과 카드 표시에 씁니다. 예약 작업은 videos와 examples 모두 스튜디오 값으로 맞춥니다(examples는 추가·삭제 없이 vis·dur·date만).
- `lang`: 언어 버전 {ko, en, ja, es} — "원본"(원본 음성) / "더빙"(직접 만든 더빙·자막) / "자동"(유튜브 자동 더빙) / ""(준비 중). 시청 페이지 ytInitialPlayerResponse의 오디오 트랙(audioTrack, 자동 더빙 여부)과 수동 자막으로 판정합니다.
