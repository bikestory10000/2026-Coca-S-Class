/* 공통: 기록 저장(localStorage), 이전 버전 기록 옮기기, 백업, 화면 설정, 발음.
 * 예전 키 vcs-syn-1913:sNN(true/false)은 지우지 않고 vcs-syn-1913:v2:sNN으로 옮겨 읽는다. */
(function () {
  'use strict';
  const C = window.VC_CATALOG;
  if (!C) return;
  const catalogByNo = new Map(C.items.map(q => [q.n, q]));
  const validSetIds = new Set(C.sets.map(s => s.id));
  const memory = Object.create(null);
  let storageOK = true, toastTimer;
  try { localStorage.setItem('vcs-syn-1913:probe', '1'); localStorage.removeItem('vcs-syn-1913:probe'); }
  catch (_) { storageOK = false; }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function readRaw(key) {
    if (Object.hasOwn(memory, key)) return memory[key];
    try { return localStorage.getItem(key); }
    catch (_) { storageOK = false; showStorageNotice(); return null; }
  }
  function readJSON(key, fallback) {
    const raw = readRaw(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function writeJSON(key, data) {
    const text = JSON.stringify(data);
    try { if (!storageOK) throw new Error('Storage unavailable'); localStorage.setItem(key, text); delete memory[key]; }
    catch (_) { memory[key] = text; storageOK = false; showStorageNotice(); }
  }
  function showStorageNotice() {
    const el = document.getElementById('storageNotice');
    if (el) { el.hidden = false; el.textContent = '이 브라우저에서는 기록이 저장되지 않습니다. 문제는 풀 수 있지만 창을 닫으면 사라지니, 설정에서 기록을 내보내 두세요.'; }
  }
  function meta(no) { return catalogByNo.get(Number(no)); }
  function setId(number) { return 's' + String(number).padStart(2, '0'); }
  function setURL(number, no) { return 'set-' + String(number).padStart(2, '0') + '.html' + (no ? '#q' + no : ''); }
  function cleanRecord(raw, item) {
    if (!isObject(raw) || !item) return null;
    const picked = Number.isInteger(raw.picked) && raw.picked >= 0 && raw.picked < item.o ? raw.picked : null;
    const legacy = raw.legacy === true && raw.answered === true;
    const legacyResult = legacy && typeof raw.correct === 'boolean';
    const answered = picked !== null || legacyResult;
    const correct = picked !== null ? picked === item.a : legacyResult ? raw.correct : null;
    return {picked, answered, correct,
      firstCorrect: answered && typeof raw.firstCorrect === 'boolean' ? raw.firstCorrect : correct,
      attempts: answered ? Math.max(1, Math.min(100000, Number.isInteger(raw.attempts) ? raw.attempts : 1)) : 0,
      bookmark: raw.bookmark === true, peeked: raw.peeked === true,
      expanded: raw.expanded !== false, legacy: legacy && picked === null,
      updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0};
  }
  function cleanRecords(raw, sid) {
    const clean = Object.create(null);
    if (!isObject(raw)) return clean;
    for (const [n, rec] of Object.entries(raw)) {
      if (!/^\d+$/.test(n)) continue;
      const item = meta(n);
      if (!item || setId(item.s) !== sid) continue;
      const result = cleanRecord(rec, item);
      if (result && (result.answered || result.bookmark || result.peeked)) clean[n] = result;
    }
    return clean;
  }
  function readSet(sid) {
    if (!validSetIds.has(sid)) return Object.create(null);
    return applyRevision(sid, readSetRaw(sid));
  }
  function readSetRaw(sid) {
    const key = 'vcs-syn-1913:v2:' + sid;
    const raw = readJSON(key, null);
    if (raw && raw.version === 2 && isObject(raw.records)) return cleanRecords(raw.records, sid);
    if (readRaw(key) !== null) return Object.create(null); // A corrupt v2 file must not silently resurrect deleted legacy data.
    const old = readJSON('vcs-syn-1913:' + sid, {}), migrated = Object.create(null);
    if (isObject(old)) for (const [n, right] of Object.entries(old)) {
      const q = meta(n);
      if (typeof right === 'boolean' && q && setId(q.s) === sid) {
        migrated[n] = {picked:null, answered:true, correct:right, firstCorrect:right, attempts:1, bookmark:false, peeked:false, expanded:true, legacy:true, updatedAt:0};
      }
    }
    const clean = cleanRecords(migrated, sid);
    if (Object.keys(clean).length) writeJSON(key, {version:2,records:clean});
    return clean;
  }
  // 2026-09 정답 검토로 바뀐 문항은 예전 풀이 기록을 한 번 지워 새 문항처럼 다시 풀게 한다.
  const REVISION = '2026-09', REVISION_DATE = '2026-09-22';
  function dropRevised(records) {
    let dropped = false;
    for (const n of Object.keys(records)) { const q = meta(n); if (q && q.r === REVISION) { delete records[n]; dropped = true; } }
    return dropped;
  }
  function applyRevision(sid, records) {
    const doneKey = 'vcs-syn-1913:rev:' + REVISION + ':' + sid;
    if (readRaw(doneKey) !== null) return records;
    if (dropRevised(records)) writeJSON('vcs-syn-1913:v2:' + sid, {version:2, records});
    writeJSON(doneKey, 1);
    return records;
  }
  function saveSet(sid, records) {
    if (!validSetIds.has(sid)) return;
    writeJSON('vcs-syn-1913:v2:' + sid, {version:2, records:cleanRecords(records, sid)});
    window.dispatchEvent(new CustomEvent('vc:state', {detail:{sid}}));
  }
  function patch(sid, no, changes) {
    const all = readSet(sid), q = meta(no);
    if (!q || setId(q.s) !== sid) return null;
    const raw = Object.assign({}, all[no] || {}, changes);
    all[no] = cleanRecord(raw, q);
    saveSet(sid, all);
    return all[no];
  }
  function states() {
    const out = Object.create(null);
    for (const s of C.sets) out[s.id] = readSet(s.id);
    return out;
  }
  function recordFor(q, all) { return (all[setId(q.s)] || {})[q.n]; }
  function matchesState(item, rec, view) {
    if (view === 'todo') return !rec || !rec.answered;
    if (view === 'wrong') return !!(rec && rec.answered && rec.correct === false);
    if (view === 'saved') return !!(rec && rec.bookmark);
    return true;
  }
  function summary(items, records) {
    let done=0,right=0,wrong=0,saved=0;
    for (const q of items) {
      const r=records[q.n];
      if (!r) continue;
      if (r.bookmark) saved++;
      if (!r.answered) continue;
      done++;
      if (r.correct) right++; else wrong++;
    }
    return {done,right,wrong,saved};
  }
  function allSummary(all) {
    const totals={done:0,right:0,wrong:0,saved:0};
    for(const s of C.sets){const st=summary(C.items.filter(q=>setId(q.s)===s.id),all[s.id]||{});for(const k of Object.keys(totals))totals[k]+=st[k];}
    return totals;
  }
  function getLast() {
    const value=readJSON('vcs-syn-1913:last',null);
    if(!isObject(value))return null;
    const q=meta(value.no);
    return q&&setId(q.s)===value.sid ? {sid:value.sid,no:q.n,number:q.s,time:Number(value.time)||0} : null;
  }
  function setLast(sid,no){const q=meta(no);if(q&&setId(q.s)===sid)writeJSON('vcs-syn-1913:last',{sid,no:q.n,time:Date.now()});}
  function toast(text) {
    const el=document.getElementById('toast');
    if(!el)return;
    clearTimeout(toastTimer);el.textContent=text;el.hidden=false;
    toastTimer=setTimeout(()=>{el.hidden=true;},4200);
  }
  function announce(text){const el=document.getElementById('liveStatus');if(el)el.textContent=text;}
  function icon(name){return '<svg class="icon" aria-hidden="true"><use href="#i-'+esc(name)+'"></use></svg>';}
  function openDialog(dialog){if(!dialog)return;if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');}
  function closeDialog(dialog){if(!dialog)return;if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
  function prefs(){const x=readJSON('vcs-syn-1913:preferences',{});return {theme:['light','dark','system'].includes(x&&x.theme)?x.theme:'system',text:['normal','large','xlarge'].includes(x&&x.text)?x.text:'normal'};}
  function applyPrefs(value){
    const root=document.documentElement;
    if(value.theme==='system')delete root.dataset.theme;else root.dataset.theme=value.theme;
    if(value.text==='normal')delete root.dataset.text;else root.dataset.text=value.text;
    for(const input of document.querySelectorAll('input[name="theme"]'))input.checked=input.value===value.theme;
    for(const input of document.querySelectorAll('input[name="textsize"]'))input.checked=input.value===value.text;
  }
  function speak(text){
    if(!('speechSynthesis'in window)||typeof SpeechSynthesisUtterance==='undefined'){toast('이 브라우저에서는 발음 듣기를 쓸 수 없습니다.');return;}
    try{
      window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text));
      const voices=window.speechSynthesis.getVoices();
      const voice=voices.find(v=>/^en[-_]US$/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang));
      if(voice)u.voice=voice;u.lang=voice?voice.lang:'en-US';u.rate=.88;
      u.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))toast('영어 음성을 재생하지 못했습니다. 기기에 영어 음성이 설치되어 있는지 확인하세요.');};
      window.speechSynthesis.speak(u);
    }catch(_){toast('이 기기에서는 발음을 재생할 수 없습니다.');}
  }
  function exportData(){
    const data={schema:'voca-sclass-synonym-1913-progress',version:2,exportedAt:new Date().toISOString(),sets:states(),preferences:prefs(),last:getLast()};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='압축보카S-동의어-기록-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    document.getElementById('backupFeedback').textContent='기록 파일을 내려받았습니다. 다운로드 폴더에 있습니다.';
  }
  function validateImport(data){
    if(!isObject(data)||data.schema!=='voca-sclass-synonym-1913-progress'||data.version!==2||!isObject(data.sets))throw new Error('압축보카 S 클래스에서 내보낸 기록 파일이 아닙니다.');
    if(Object.keys(data.sets).length>20)throw new Error('파일 안의 세트 수가 맞지 않습니다.');
    const safe=Object.create(null);
    for(const [sid,records]of Object.entries(data.sets)){
      if(!validSetIds.has(sid)||!isObject(records))throw new Error('파일 안에 알 수 없는 세트가 있습니다.');
      if(Object.keys(records).length>100)throw new Error('파일 안의 문항 수가 맞지 않습니다.');
      for(const [no,rec]of Object.entries(records)){
        const q=meta(no);
        if(!/^\d+$/.test(no)||!q||setId(q.s)!==sid||!isObject(rec))throw new Error('파일 안에 없는 문항 번호가 있습니다.');
        if(rec.picked!==null&&rec.picked!==undefined&&(!Number.isInteger(rec.picked)||rec.picked<0||rec.picked>=q.o))throw new Error('파일 안의 보기 번호가 맞지 않습니다.');
      }
      safe[sid]=cleanRecords(records,sid);
    }
    return safe;
  }
  async function importFile(file){
    const feedback=document.getElementById('backupFeedback');
    if(!file)return;
    try{
      if(file.size>5*1024*1024)throw new Error('파일이 너무 큽니다. 5MB 이하 기록 파일만 불러올 수 있습니다.');
      const parsed=JSON.parse(await file.text()),safe=validateImport(parsed);
      const setCount=Object.keys(safe).length;
      if(!setCount)throw new Error('파일에 불러올 기록이 없습니다.');
      if(!window.confirm(setCount+'개 세트의 지금 기록을 파일 내용으로 바꿉니다. 지금 기록이 필요하면 먼저 내보내 두세요. 계속할까요?'))return;
      const oldBackup=!(typeof parsed.exportedAt==='string'&&parsed.exportedAt>=REVISION_DATE);
      for(const [sid,records]of Object.entries(safe)){if(oldBackup)dropRevised(records);writeJSON('vcs-syn-1913:v2:'+sid,{version:2,records});writeJSON('vcs-syn-1913:rev:'+REVISION+':'+sid,1);}
      if(isObject(parsed.preferences)){
        const pr={theme:['light','dark','system'].includes(parsed.preferences.theme)?parsed.preferences.theme:'system',text:['normal','large','xlarge'].includes(parsed.preferences.text)?parsed.preferences.text:'normal'};
        writeJSON('vcs-syn-1913:preferences',pr);applyPrefs(pr);
      }
      if(isObject(parsed.last)&&meta(parsed.last.no)&&setId(meta(parsed.last.no).s)===parsed.last.sid)setLast(parsed.last.sid,parsed.last.no);
      window.dispatchEvent(new CustomEvent('vc:import'));
      feedback.textContent=storageOK?'기록을 불러왔습니다.':'기록을 화면에는 불러왔지만 브라우저에 저장하지 못했습니다. 창을 닫기 전에 다시 내보내 두세요.';
    }catch(e){feedback.textContent=e instanceof SyntaxError?'파일이 깨져 있어 읽을 수 없습니다. 내보낸 파일을 그대로 골라 주세요.':e.message;}
  }
  function boot(){
    applyPrefs(prefs());if(!storageOK)showStorageNotice();
    const dialog=document.getElementById('settingsDialog');
    document.querySelectorAll('.settings-open').forEach(b=>b.addEventListener('click',()=>{applyPrefs(prefs());openDialog(dialog);}));
    document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);}}));
    document.querySelectorAll('input[name="theme"],input[name="textsize"]').forEach(input=>input.addEventListener('change',()=>{
      const p=prefs();if(input.name==='theme')p.theme=input.value;else p.text=input.value;writeJSON('vcs-syn-1913:preferences',p);applyPrefs(p);
    }));
    const exp=document.getElementById('exportProgress'),imp=document.getElementById('importProgress'),file=document.getElementById('importFile');
    if(exp)exp.addEventListener('click',exportData);
    if(imp&&file){imp.addEventListener('click',()=>file.click());file.addEventListener('change',()=>{importFile(file.files[0]);file.value='';});}
    window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith('vcs-syn-1913:')){if(e.key==='vcs-syn-1913:preferences')applyPrefs(prefs());window.dispatchEvent(new CustomEvent('vc:external'));}});
    window.addEventListener('pagehide',()=>{if('speechSynthesis'in window)window.speechSynthesis.cancel();});
  }
  window.VC={catalog:C,meta,setId,setURL,esc,icon,readJSON,writeJSON,readSet,saveSet,patch,states,recordFor,matchesState,summary,allSummary,getLast,setLast,toast,announce,openDialog,closeDialog,speak,validateImport,prefs};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
