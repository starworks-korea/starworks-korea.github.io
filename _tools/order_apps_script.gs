/**
 * @OnlyCurrentDoc
 *
 * 스타웍스 시편 주문 받기 — 구글 시트에 묶인 앱스 스크립트 웹 앱
 * (홈페이지 coupon-tool.html · ko/coupon-tool.html 의 「주문하기」가 씀)
 *
 * 하는 일: 주문 1건을 시트 orders 에 1줄로 적고, 대표 메일로 주문 내용을 보냅니다.
 *
 * 배포 (처음 한 번)
 *   1) 구글 시트 새로 만들기 (이름 예: 스타웍스 시편 주문)
 *   2) 확장 프로그램 → Apps Script → 이 파일 내용 전체 붙여넣기 → 저장
 *   3) 편집기에서 setup 함수를 한 번 실행 → 권한 승인 (이 시트 읽고 쓰기 + 메일 보내기)
 *   4) 배포 → 새 배포 → 유형 「웹 앱」
 *        다음 사용자 인증 정보로 실행: 나 / 액세스 권한이 있는 사용자: 모든 사용자
 *   5) 웹 앱 URL(https://script.google.com/macros/s/…/exec)을 홈페이지 쪽에 넣음
 * 코드를 고치면: 배포 → 배포 관리 → 수정(연필) → 버전 「새 버전」 → 배포 (URL 그대로)
 */
var TO = 'shindongwoo@gmail.com';
var SHEET_NAME = 'orders';
var HEAD = ['시각', '이름', '회사', '전화', '메일', '납기 희망', '재질', '판 크기', '소재', '탭', '별도 협의', '수량', '합계(부가세 전)', '예상 금액(부가세 포함)', '시편 내역', '요청 사항', '언어', '처리'];
var PER_MIN = 10, MAX_ITEMS = 30;

function setup() { sheet_(); MailApp.getRemainingDailyQuota(); }   // 편집기에서 한 번 실행: 시트 준비 + 권한 승인

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.setColumnWidth(15, 420); sh.setColumnWidth(16, 320);
  }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// 제어 문자 제거 · 줄바꿈 통일 · 앞뒤 공백 · 길이 제한
function clean_(s, n) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, n);
}
function line_(s, n) { return clean_(s, n).replace(/\n/g, ' '); }   // 한 줄짜리 (제목·머리글 주입 차단)
function txt_(s) { return "'" + s; }                                  // 시트에 글자 그대로 (수식 주입 차단)
function num_(v) { v = Number(v); return isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v) : 0; }
function won_(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function doGet() { return out_({ ok: true, service: 'starworks-coupon-order' }); }

// 주문 받기 — 본문(JSON 글자). website 는 봇 함정(비어야 함)
function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'fail' }); }
  if (d.website) return out_({ ok: true });                         // 봇: 저장·발송 안 함
  var name = line_(d.name, 40), org = line_(d.org, 60), phone = line_(d.phone, 30), email = line_(d.email, 80);
  var due = line_(d.due, 20), memo = clean_(d.memo, 1000), material = line_(d.material, 120), panel = line_(d.panel, 60);
  var lang = d.lang === 'en' ? 'en' : 'ko';
  if (!name) return out_({ ok: false, error: 'needname' });
  if (phone.replace(/\D/g, '').length < 9) return out_({ ok: false, error: 'needphone' });
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(email)) return out_({ ok: false, error: 'needmail' });
  var items = Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return out_({ ok: false, error: 'noitems' });

  var supply = d.supply === 'own' ? '사급 (가공만)' : '스타웍스 공급 (성형 포함)';
  var tab = d.tab ? '적용' : '미적용';
  var special = !!(d.special || d.thick || d.consult);
  var why = [];
  if (d.special) why.push('특수 소재·다른 조건');
  if (d.thick) why.push('두께가 3T와 다름');
  if (d.consult) why.push('소재 공급·금속 별도 협의');
  var count = 0, lines = [];
  items.forEach(function (it) {
    var n = num_(it.n), sub = it.sub == null ? null : num_(it.sub);
    count += n;
    lines.push('- ' + line_(it.name, 60) + ' [' + line_(it.std, 30) + '] ' + line_(it.size, 60) + ' : ' + n + '개' + (it.tab ? ' (탭)' : '') + (sub === null ? '' : ' = ' + won_(sub) + '원'));
  });
  var sum = num_(d.sum), total = num_(d.total);

  var cache = CacheService.getScriptCache();
  var dupKey = 'd' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, [name, phone, email, material, lines.join('|'), memo].join('\n'), Utilities.Charset.UTF_8));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out_({ ok: false, error: 'rate' });
  try {
    if (cache.get(dupKey)) return out_({ ok: true, dup: true });    // 같은 주문을 다시 누름: 한 번만 처리
    var minKey = 'm' + Math.floor(Date.now() / 60000), n = Number(cache.get(minKey) || 0);
    if (n >= PER_MIN) return out_({ ok: false, error: 'rate' });
    var now = new Date();
    sheet_().appendRow([now, txt_(name), txt_(org), txt_(phone), txt_(email), txt_(due), txt_(material), txt_(panel), supply, tab,
      special ? why.join(', ') : '', count, sum, total, txt_(lines.join('\n')), txt_(memo), lang, '']);
    var subject = '[시편 주문' + (special ? ', 별도 협의' : '') + '] ' + material + ', ' + count + '개' + (total ? ', ' + won_(total) + '원' : '');
    var body = ['이름: ' + name + (org ? ' / ' + org : ''), '전화: ' + phone, '메일: ' + email, due ? '납기 희망: ' + due : null, '',
      '재질: ' + material, '판 크기: ' + panel, '소재: ' + supply, '탭: ' + tab, special ? '별도 협의: ' + why.join(', ') : null, '',
      lines.join('\n'), '',
      total ? '합계(부가세 전): ' + won_(sum) + '원' : null,
      total ? '예상 금액(부가세 포함): ' + won_(total) + '원 — 화면 계산값이며 확정 금액이 아닙니다' : '금액: 별도 협의',
      memo ? '\n요청 사항:\n' + memo : null, '',
      '언어: ' + lang + ' / 받은 시각: ' + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      '주문 대장: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].filter(function (x) { return x !== null; }).join('\n');
    MailApp.sendEmail({ to: TO, replyTo: email, subject: subject, body: body, name: '스타웍스 시편 주문' });
    cache.put(minKey, String(n + 1), 120);
    cache.put(dupKey, '1', 21600);
    return out_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
