/**
 * @OnlyCurrentDoc
 *
 * 스타웍스 강의 영상 리뷰 저장소 — 구글 시트에 묶인 앱스 스크립트 웹 앱
 * (홈페이지 lectures.html · ko/lectures.html 카드 아래 「리뷰」 창이 씀)
 *
 * 배포 (처음 한 번)
 *   1) 구글 시트 새로 만들기 (이름 예: 스타웍스 강의 리뷰)
 *   2) 확장 프로그램 → Apps Script → 이 파일 내용 전체 붙여넣기 → 저장
 *   3) 배포 → 새 배포 → 유형 「웹 앱」
 *        다음 사용자 인증 정보로 실행: 나 / 액세스 권한이 있는 사용자: 모든 사용자
 *   4) 권한 승인 (이 시트 하나만 읽고 쓰는 권한 — @OnlyCurrentDoc)
 *   5) 웹 앱 URL(https://script.google.com/macros/s/…/exec)을 _tools/lectures.json "review_api"에 넣고
 *      python3 _tools/make_lectures.py → push
 *
 * 시트 열: 시각 | 영상 ID | 언어 | 이름 | 내용 | 숨김
 *   - 숨김 칸에 아무 글자나 쓰면 페이지에서 안 보임 (지우면 다시 보임)
 *   - 행을 지워도 됨
 * 코드를 고치면: 배포 → 배포 관리 → 수정(연필) → 버전 「새 버전」 → 배포 (URL 그대로)
 */
var SHEET_NAME = 'reviews';
var HEAD = ['시각', '영상 ID', '언어', '이름', '내용', '숨김'];
var MAX_NAME = 30, MAX_TEXT = 1000, PER_MIN = 30, MAX_LIST = 3000;

function setup() { sheet_(); }   // 편집기에서 한 번 실행해 시트·권한 확인용

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.setColumnWidth(5, 480);
  }
  return sh;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// 제어 문자 제거 · 줄바꿈 통일 · 앞뒤 공백 · 길이 제한
function clean_(s, n) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n')
    .trim().slice(0, n);
}

// 앞에 ' 를 붙여 시트가 글자 그대로 저장 (수식·숫자·날짜로 바뀌지 않음, 수식 주입 차단)
function txt_(s) { return "'" + s; }

// 목록 (숨김 아닌 것)
function doGet(e) {
  var v = sheet_().getDataRange().getValues(), list = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[1] || String(r[5]).trim()) continue;
    var t = r[0] instanceof Date ? r[0].getTime() : (Number(r[0]) || 0);
    list.push({ vid: String(r[1]), name: String(r[3]), text: String(r[4]), t: t });
  }
  if (list.length > MAX_LIST) list = list.slice(-MAX_LIST);
  return out_({ ok: true, reviews: list });
}

// 리뷰 쓰기 — 본문(JSON 글자): {vid, lang, name, text, website(봇 함정, 비어야 함)}
function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'fail' }); }
  var vid = String(d.vid || ''), lang = d.lang === 'ko' ? 'ko' : 'en';
  var name = clean_(d.name, MAX_NAME), text = clean_(d.text, MAX_TEXT);
  if (d.website) return out_({ ok: true, review: { vid: vid, name: name, text: text, t: Date.now() } }); // 봇: 저장 안 함
  if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return out_({ ok: false, error: 'fail' });
  if (!name) return out_({ ok: false, error: 'needname' });
  if (text.length < 2) return out_({ ok: false, error: 'needtext' });

  var cache = CacheService.getScriptCache();
  var dupKey = 'd' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, vid + '\n' + name + '\n' + text, Utilities.Charset.UTF_8));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out_({ ok: false, error: 'rate' });
  try {
    if (cache.get(dupKey)) return out_({ ok: false, error: 'dup' });
    var minKey = 'm' + Math.floor(Date.now() / 60000), n = Number(cache.get(minKey) || 0);
    if (n >= PER_MIN) return out_({ ok: false, error: 'rate' });
    var now = new Date();
    sheet_().appendRow([now, txt_(vid), lang, txt_(name), txt_(text), '']);
    cache.put(minKey, String(n + 1), 120);
    cache.put(dupKey, '1', 21600);
    return out_({ ok: true, review: { vid: vid, name: name, text: text, t: now.getTime() } });
  } finally {
    lock.releaseLock();
  }
}
