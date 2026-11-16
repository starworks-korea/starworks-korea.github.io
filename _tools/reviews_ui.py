# 강의 영상 리뷰 창 (카드 아래 「리뷰」 버튼 → 이름 + 리뷰 내용) — make_lectures.py가 씀
# 저장소: 구글 시트 + 앱스 스크립트 웹 앱 (_tools/reviews_apps_script.gs), 주소는 lectures.json review_api
import json, html

TXT = {
    "ko": {
        "kicker": "리뷰", "close": "닫기",
        "name": "이름", "name_ph": "이름 또는 닉네임",
        "text": "리뷰 내용", "text_ph": "영상을 보고 느낀 점, 도움이 된 부분을 적어 주세요",
        "send": "리뷰 남기기", "sending": "보내는 중…",
        "ok": "리뷰가 등록되었습니다. 감사합니다!",
        "empty": "아직 리뷰가 없습니다. 첫 리뷰를 남겨 주세요.",
        "loading": "리뷰를 불러오는 중…",
        "loaderr": "리뷰 목록을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.",
        "needname": "이름을 적어 주세요.",
        "needtext": "리뷰 내용을 2자 이상 적어 주세요.",
        "dup": "같은 리뷰가 이미 등록되어 있습니다.",
        "rate": "지금 리뷰가 많이 들어오고 있습니다. 1분 뒤 다시 시도해 주세요.",
        "fail": "등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
        "note": "이름과 리뷰 내용은 이 페이지에 공개됩니다. 연락처 등 개인 정보는 적지 마세요.",
    },
    "en": {
        "kicker": "REVIEWS", "close": "Close",
        "name": "Name", "name_ph": "Your name or nickname",
        "text": "Review", "text_ph": "What did you think? What part helped you?",
        "send": "Post review", "sending": "Sending…",
        "ok": "Thank you! Your review has been posted.",
        "empty": "No reviews yet. Be the first to write one.",
        "loading": "Loading reviews…",
        "loaderr": "Couldn't load reviews. Please open this again in a moment.",
        "needname": "Please enter your name.",
        "needtext": "Please write at least 2 characters.",
        "dup": "This review has already been posted.",
        "rate": "Too many reviews right now. Please try again in a minute.",
        "fail": "Couldn't post your review. Please try again in a moment.",
        "note": "Your name and review are shown publicly on this page. Please don't include contact details.",
    },
}

CSS = """
.vitem{display:flex;flex-direction:column;gap:8px}
.vitem .vcard{flex:1}
.rvbtn{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:8px 14px;font-family:'Noto Sans KR',sans-serif;font-size:15px;font-weight:700;color:#1E3252;background:#FFFFFF;border:1px solid #DCE1E8;border-radius:8px;cursor:pointer;text-align:left}
.rvbtn:hover{border-color:#0070C0;color:#0070C0}
.rvbtn:focus-visible{outline:3px solid #0070C0;outline-offset:2px}
.rvn{color:#0070C0}
.rvgo{margin-left:auto;font-size:14px;color:#0070C0}
#rvdlg{width:min(640px,calc(100% - 24px));max-width:none;max-height:calc(100% - 24px);padding:0;border:0;border-radius:12px;background:#FFFFFF;box-shadow:0 20px 60px rgba(30,50,82,.35);font-family:'Noto Sans KR',sans-serif;color:#1E3252}
#rvdlg::backdrop{background:rgba(22,38,63,.62)}
.rvbox{max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow-y:auto}
.rvhead{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:18px 20px 16px;background:#1E3252;color:#FFFFFF}
.rvk{margin:0;font-size:12px;letter-spacing:2px;color:#9CC3E8}
#rvh{margin:4px 0 0;font-size:18px;font-weight:900;line-height:1.4}
.rvx{flex:none;width:44px;height:44px;margin:-8px -10px 0 0;font-size:28px;line-height:1;color:#FFFFFF;background:transparent;border:0;border-radius:8px;cursor:pointer}
.rvx:hover{background:rgba(255,255,255,.14)}
.rvx:focus-visible{outline:3px solid #9CC3E8;outline-offset:-3px}
.rvlist{padding:6px 20px;background:#F8FAFC;border-bottom:1px solid #DCE1E8}
.rvitem{padding:12px 0;border-bottom:1px solid #DCE1E8}
.rvitem:last-child{border-bottom:0}
.rvmeta{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;font-size:15px}
.rvmeta b{font-weight:700;color:#1E3252}
.rvmeta time{font-size:13px;color:#5A6478}
.rvtext{margin:4px 0 0;font-size:15px;line-height:1.65;color:#2D3748;white-space:pre-wrap}
.rvempty{margin:14px 0;font-size:15px;color:#5A6478}
#rvform{position:relative;display:flex;flex-direction:column;gap:12px;padding:16px 20px 18px}
#rvform label{display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:700;color:#1E3252}
#rvform input,#rvform textarea{font-family:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1px solid #C9D3E0;border-radius:6px;color:#1E3252;background:#FFFFFF}
#rvform textarea{resize:vertical;min-height:110px;line-height:1.6}
#rvform input:focus,#rvform textarea:focus{outline:2px solid #0070C0;outline-offset:0;border-color:#0070C0}
.rvhp{position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden}
.rvfoot{display:flex;align-items:center;justify-content:space-between;gap:12px}
.rvcnt{font-size:13px;color:#5A6478}
.rvsend{min-height:44px;padding:10px 22px;font-family:inherit;font-size:15px;font-weight:700;color:#FFFFFF;background:#0070C0;border:0;border-radius:6px;cursor:pointer}
.rvsend:hover{background:#005A9C}
.rvsend:disabled{opacity:.6;cursor:default}
.rvmsg{margin:0;font-size:14px;min-height:1.4em}
.rvmsg.ok{color:#2F855A}
.rvmsg.err{color:#C53030}
.rvnote{margin:0;font-size:12px;line-height:1.5;color:#5A6478}
@media (max-width:600px){#rvdlg{width:100%;height:100%;max-height:none;margin:0;border-radius:0}.rvbox{height:100%;max-height:none}}
"""

DIALOG = """<dialog id="rvdlg" aria-labelledby="rvh">
<div class="rvbox">
<div class="rvhead"><div><p class="rvk">@kicker@</p><h2 id="rvh"></h2></div><button type="button" class="rvx" aria-label="@close@">×</button></div>
<div class="rvlist" id="rvlist" aria-live="polite"></div>
<form id="rvform" novalidate>
<label>@name@<input name="name" maxlength="30" autocomplete="nickname" placeholder="@name_ph@" required></label>
<label>@text@<textarea name="text" maxlength="1000" rows="4" placeholder="@text_ph@" required></textarea></label>
<div class="rvhp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="rvfoot"><span class="rvcnt">0 / 1000</span><button type="submit" class="rvsend">@send@</button></div>
<p class="rvmsg" role="status"></p>
<p class="rvnote">@note@</p>
</form>
</div>
</dialog>"""

JS = r"""<script>
(function(){
var API=@API@, T=@T@, LANG=@LANG@;
var dlg=document.getElementById('rvdlg'); if(!dlg||!API||!window.fetch) return;
var list=document.getElementById('rvlist'), head=document.getElementById('rvh'), form=document.getElementById('rvform');
var fn=form.elements.name, ft=form.elements.text, fh=form.elements.website;
var cnt=form.querySelector('.rvcnt'), msg=form.querySelector('.rvmsg'), send=form.querySelector('.rvsend');
var data={}, state='loading', cur=null, lastBtn=null;
function getName(){try{return localStorage.getItem('rv_name')||''}catch(x){return ''}}
function putName(v){try{localStorage.setItem('rv_name',v)}catch(x){}}
function el(tag,cls,txt){var x=document.createElement(tag); if(cls) x.className=cls; if(txt!=null) x.textContent=txt; return x}
function day(t){var d=new Date(t); if(isNaN(d.getTime())) return null; return d}
function fmt(d){return LANG==='ko' ? d.getFullYear()+'. '+(d.getMonth()+1)+'. '+d.getDate()+'.' : d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}
function paint(){
  var bs=document.querySelectorAll('.rvbtn');
  for(var i=0;i<bs.length;i++){var n=(data[bs[i].getAttribute('data-vid')]||[]).length; bs[i].querySelector('.rvn').textContent=(state==='ok'||n)?String(n):''}
}
function render(){
  list.textContent='';
  var arr=(data[cur]||[]).slice().sort(function(a,b){return (b.t||0)-(a.t||0)});
  if(!arr.length){list.appendChild(el('p','rvempty',state==='loading'?T.loading:state==='err'?T.loaderr:T.empty)); return}
  arr.forEach(function(r){
    var it=el('div','rvitem'), m=el('div','rvmeta'), d=day(r.t);
    m.appendChild(el('b',null,r.name));
    if(d){var tm=el('time',null,fmt(d)); tm.setAttribute('datetime',d.toISOString()); m.appendChild(tm)}
    it.appendChild(m); it.appendChild(el('p','rvtext',r.text)); list.appendChild(it);
  });
}
function load(){
  state='loading';
  fetch(API+'?action=list',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
    if(!j||!j.ok) throw new Error('bad');
    var nd={}; (j.reviews||[]).forEach(function(r){(nd[r.vid]=nd[r.vid]||[]).push(r)}); data=nd; state='ok';
  }).catch(function(){state='err'}).then(function(){paint(); if(cur) render()});
}
function setMsg(s,c){msg.textContent=s; msg.className='rvmsg'+(c?' '+c:'')}
function upd(){cnt.textContent=ft.value.length+' / 1000'}
function close(){if(dlg.close) dlg.close(); else {dlg.removeAttribute('open'); if(lastBtn) lastBtn.focus()}}
document.addEventListener('click',function(ev){
  var b=ev.target.closest?ev.target.closest('.rvbtn'):null; if(!b) return;
  cur=b.getAttribute('data-vid'); lastBtn=b; head.textContent=b.getAttribute('data-title');
  setMsg('',''); render(); if(!fn.value) fn.value=getName(); upd();
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  if(window.matchMedia&&matchMedia('(pointer:fine)').matches) (fn.value?ft:fn).focus();  // 휴대폰은 키보드가 바로 뜨지 않게
  if(state==='err') load();
});
dlg.querySelector('.rvx').addEventListener('click',close);
dlg.addEventListener('click',function(ev){if(ev.target===dlg) close()});
dlg.addEventListener('close',function(){if(lastBtn) lastBtn.focus()});
ft.addEventListener('input',upd);
form.addEventListener('submit',function(ev){
  ev.preventDefault();
  var name=fn.value.trim(), text=ft.value.trim(), vid=cur;
  if(!name){setMsg(T.needname,'err'); fn.focus(); return}
  if(text.length<2){setMsg(T.needtext,'err'); ft.focus(); return}
  send.disabled=true; setMsg(T.sending,'');
  fetch(API,{method:'POST',body:JSON.stringify({vid:vid,lang:LANG,name:name,text:text,website:fh.value})}).then(function(r){return r.json()}).then(function(j){
    if(j&&j.ok&&j.review){
      (data[vid]=data[vid]||[]).push(j.review); putName(name); ft.value=''; upd(); paint(); if(cur===vid) render(); setMsg(T.ok,'ok');
    } else setMsg(T[j&&j.error]||T.fail,'err');
  }).catch(function(){setMsg(T.fail,'err')}).then(function(){send.disabled=false});
});
load();
})();
</script>"""


def ui(L, api):
    """(css, html) — api가 비면 ("", "")"""
    if not api:
        return "", ""
    T = TXT[L]
    d = DIALOG
    for k, v in T.items():
        d = d.replace("@" + k + "@", html.escape(v))
    js = (JS.replace("@API@", json.dumps(api))
            .replace("@T@", json.dumps(T, ensure_ascii=False))
            .replace("@LANG@", json.dumps(L)))
    return CSS.strip(), d + "\n" + js
