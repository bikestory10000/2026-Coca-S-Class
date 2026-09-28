/* 세트 화면: 문항 풀이, 채점, 해설, 문항 지도, 인쇄.
   window.SET 원본 데이터는 읽기만 하고 바꾸지 않는다. */
(function(){
  'use strict';
  const V=window.VC,SET=window.SET;if(!V||!SET||!Array.isArray(SET.items))return;
  const $=id=>document.getElementById(id),E=V.esc,MARKS=['①','②','③','④','⑤'];
  const items=SET.items,sid=SET.id,byNo=new Map(items.map(q=>[q.no,q])),metas=items.map(q=>V.meta(q.no));
  let state=V.readSet(sid),filter='all',size=10,pageIndex=0,pool=[],visible=[],restorePrint=[],printPrepared=false,fresh=null;
  const retrying=new Set();
  const modeNames={all:'모든 문항',todo:'안 푼 문항',wrong:'틀린 문항',saved:'저장한 문항'};
  const CIRCLE='<svg class="pen" viewBox="0 0 40 40" aria-hidden="true"><path d="M22 5.5C12 4.5 4.5 11 4.8 20.5c.3 9 7.6 15 16.2 14.6 8.8-.4 14.8-7.2 14.2-15.6C34.6 11 28 5.2 18.5 6.4"/></svg>';
  const WIDE='<svg class="pen" viewBox="0 0 60 46" preserveAspectRatio="none" aria-hidden="true"><path d="M34 5C18 3.5 5 10.5 5.5 23c.5 11.5 12 18.5 27 18 14.5-.5 23-8.5 22.5-19C54.5 11.5 44 4.5 27 6.5"/></svg>';
  const SLASH='<svg class="pen" viewBox="0 0 40 40" aria-hidden="true"><path d="M9 33.5 32 5.5"/></svg>';
  const WIDE_SLASH='<svg class="pen" viewBox="0 0 60 46" preserveAspectRatio="none" aria-hidden="true"><path d="M12 40 46 5"/></svg>';

  const requested=new URLSearchParams(location.search).get('view');
  if(modeNames[requested])filter=requested;
  const storedSize=V.readJSON('vcs-syn-1913:pageSize',10);
  if([1,10,20,100].includes(storedSize))size=storedSize;
  $('pageSize').value=String(size);$('studyFilter').value=filter;

  const stemHTML=st=>E(st).replace(/\{([^{}]+)\}/g,'<u>$1</u>').replace(/ \/\/ /g,' <span class="stem-divider">/</span> ');
  const rec=no=>state[no]||{};
  function rebuildPool(){state=V.readSet(sid);pool=items.filter(q=>V.matchesState(V.meta(q.no),state[q.no],filter));}
  function scoreText(q,r){if(!r.answered)return '안 품';return r.correct?'맞힘':'틀림';}

  function speakButton(word){return '<button type="button" class="speak-line speak" data-speak="'+E(word)+'" aria-label="'+E(word)+' 발음 듣기">'+V.icon('sound')+'<span>발음</span></button>';}
  function solutionHTML(q,r){
    const w=q.tg||{},answer=q.op[q.an];
    let out='<p class="print-answer-key">정답 '+MARKS[q.an]+' '+E(answer.w)+'</p>';
    if(q.tr)out+='<section class="solution-section"><h3>해석</h3><p class="translation">'+E(q.tr)+'</p></section>';
    if(w.w){
      out+='<section class="solution-section"><h3>밑줄 단어</h3><div class="word-card"><div class="word-top"><div><p class="word-en" lang="en">'+E(w.w)+'</p>'+(w.ko?'<p class="word-ko">'+E(w.ko)+'</p>':'')+'</div><button type="button" class="icon-button speak" data-speak="'+E(w.w)+'" aria-label="'+E(w.w)+' 발음 듣기">'+V.icon('sound')+'</button></div>'+
        (w.def?'<p class="definition" lang="en">'+E(w.def)+'</p>':'')+
        (w.ety?'<p class="etymology"><b>어원</b>'+E(w.ety)+'</p>':'')+
        (Number.isFinite(w.n)&&w.n>0?'<p class="frequency">기출 <b>'+w.n+'회</b> (밑줄 '+w.u+'회, 보기 '+(w.n-w.u)+'회)</p>':'')+'</div></section>';
    }
    if(q.nt)out+='<section class="solution-section"><h3>짚어 볼 점</h3><p class="note">'+E(q.nt)+'</p></section>';
    out+='<section class="solution-section"><h3>보기 뜻</h3><div class="gloss-list">'+q.op.map((o,i)=>{
      const tag=i===q.an?'<span class="answer-tag">정답</span>':'';
      return '<details class="gloss-item'+(i===q.an?' proposed':'')+'"'+(i===q.an||i===r.picked?' open':'')+'><summary><span class="gloss-mark">'+MARKS[i]+'</span><span><span class="gloss-en" lang="en">'+E(o.w)+'</span><span class="gloss-ko">'+E(o.ko||'')+'</span>'+tag+'</span></summary><div class="gloss-body">'+
        (o.def?'<p class="definition" lang="en">'+E(o.def)+'</p>':'')+(o.ety?'<p class="etymology"><b>어원</b>'+E(o.ety)+'</p>':'')+speakButton(o.w)+'</div></details>';
    }).join('')+'</div></section>';
    return out;
  }
  function resultHTML(q,r){
    const a=q.op[q.an],ans=MARKS[q.an]+' <b lang="en">'+E(a.w)+'</b>'+(a.ko?' ('+E(a.ko)+')':'');
    let cls='',head='',body='';
    if(r.legacy){
      cls=r.correct?'good':'bad';head='예전 버전에서 '+(r.correct?'맞힌':'틀린')+' 문항입니다.';
      body='<p>정답: '+ans+'</p><p class="small">그때 고른 보기는 기록에 남아 있지 않습니다. 다시 풀면 새로 저장됩니다.</p>';
    }else if(r.answered){
      cls=r.correct?'good':'bad';
      if(r.correct){head='맞았습니다.';body=r.attempts>1?'<p class="small">'+r.attempts+'번째 풀이에서 맞혔습니다.</p>':'';}
      else{head='틀렸습니다.';body='<p>정답: '+ans+'</p><p class="small">틀린 문항 목록에 들어갔습니다.</p>';}
    }else{
      head='해설을 먼저 열었습니다.';body='<p>정답: '+ans+'</p><p class="small">푼 문항으로 세지 않습니다. ‘다시 풀기’로 직접 풀어 볼 수 있습니다.</p>';
    }
    return '<div class="result '+cls+'" id="result'+q.no+'" tabindex="-1"><strong>'+head+'</strong>'+body+'</div>';
  }
  function renderQuestion(q){
    const r=rec(q.no),m=V.meta(q.no);
    const seen=!retrying.has(q.no)&&!!(r.answered||r.peeked),open=seen&&r.expanded!==false,graded=seen&&r.answered&&!r.legacy;
    const el=document.createElement('article');
    el.className='question-card'+(fresh===q.no?' fresh':'');el.id='q'+q.no;el.tabIndex=-1;el.dataset.no=q.no;el.setAttribute('aria-labelledby','qh'+q.no);
    const tags='<span>'+E(m.c)+'</span><span class="tag'+(q.tp==='반의어'?' ant':'')+'">'+E(q.tp)+'</span>';
    const numMark=graded||(seen&&r.legacy&&r.answered)?(r.correct?WIDE:WIDE_SLASH):'';
    const options=q.op.map((o,i)=>{
      let cls='option',mark='';
      if(seen){
        if(i===q.an){cls+=' is-answer';if(graded||!r.answered)mark=CIRCLE;}
        else if(i===r.picked){cls+=' is-wrong';mark=SLASH;}
      }
      const mine=seen&&i===r.picked?'<span class="tag-mine">내 답</span>':'';
      return '<button type="button" class="'+cls+'" data-pick="'+i+'"'+(seen?' disabled':'')+'><span class="option-mark">'+MARKS[i]+mark+'</span><span class="option-copy"><span class="option-en" lang="en">'+E(o.w)+mine+'</span>'+(seen&&o.ko?'<span class="option-ko">'+E(o.ko)+'</span>':'')+'</span></button>';
    }).join('');
    const next=seen&&size===1&&(pageIndex+1)*size<pool.length?'<button type="button" data-action="next">다음 문항 '+V.icon('next')+'</button>':'';
    el.innerHTML='<div class="question-head"><h2 class="question-number" id="qh'+q.no+'"><span class="sr-only">문항 </span><span class="no">'+q.no+'</span>'+numMark+'</h2><div class="question-meta">'+tags+'</div><button type="button" class="icon-button bookmark" data-action="bookmark" aria-label="'+q.no+'번 '+(r.bookmark?'저장 해제':'저장')+'" aria-pressed="'+!!r.bookmark+'">'+V.icon('book')+'</button></div>'+
      '<div class="question-content"><p class="question-instruction">'+(q.ask?E(q.ask):q.tp==='반의어'?'밑줄 친 부분과 뜻이 반대인 것은?':'밑줄 친 부분과 뜻이 가장 가까운 것은?')+'</p><p class="stem" lang="en">'+stemHTML(q.st)+'</p>'+
      '<div class="options" role="group" aria-label="'+q.no+'번 보기">'+options+'</div>'+(seen?resultHTML(q,r):'')+'</div>'+
      '<div class="question-actions"><span><button type="button" data-action="solution" aria-controls="solution'+q.no+'" aria-expanded="'+open+'">'+(open?'해설 접기':seen?'해설 펼치기':'정답과 해설 보기')+'</button></span><span class="actions-right">'+(seen?'<button type="button" data-action="retry">'+V.icon('refresh')+'다시 풀기</button>':'')+next+'</span></div>'+
      '<div class="solution" id="solution'+q.no+'"'+(open?'':' hidden')+'>'+(seen?solutionHTML(q,r):'')+'</div>';
    el.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||!el.contains(b))return;
      if(b.dataset.speak!==undefined){V.speak(b.dataset.speak);return;}
      if(b.dataset.pick!==undefined){choose(q,+b.dataset.pick);return;}
      const act=b.dataset.action;
      if(act==='bookmark'){
        const on=!rec(q.no).bookmark;V.patch(sid,q.no,{bookmark:on});state=V.readSet(sid);
        b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',q.no+'번 '+(on?'저장 해제':'저장'));
        V.toast(on?q.no+'번을 저장했습니다.':q.no+'번 저장을 풀었습니다.');renderSideMap();return;
      }
      if(act==='solution'){retrying.delete(q.no);V.patch(sid,q.no,{peeked:true,expanded:!open});state=V.readSet(sid);replaceCard(q,'solution');return;}
      if(act==='retry'){retrying.add(q.no);replaceCard(q,'firstOption');V.announce(q.no+'번을 다시 풉니다. 새 답을 고르기 전까지 이전 기록은 그대로입니다.');return;}
      if(act==='next'){$('nextPage').click();}
    });
    return el;
  }
  function replaceCard(q,focus){
    const old=$('q'+q.no);if(!old)return;const el=renderQuestion(q);old.replaceWith(el);
    if(focus==='result'){
      const r=el.querySelector('.result');
      if(r){r.focus({preventScroll:true});const box=r.getBoundingClientRect();if(box.bottom>innerHeight-90||box.top<80)r.scrollIntoView({block:'nearest',behavior:'smooth'});}
    }else if(focus==='firstOption'){el.querySelector('[data-pick]')?.focus({preventScroll:true});el.scrollIntoView({block:'start'});}
    else if(focus==='solution')el.querySelector('[data-action="solution"]')?.focus({preventScroll:true});
  }
  function choose(q,picked){
    if(!Number.isInteger(picked)||picked<0||picked>=q.op.length)return;
    const old=rec(q.no);
    if(old.answered&&!retrying.has(q.no))return;
    const right=picked===q.an;
    retrying.delete(q.no);
    V.patch(sid,q.no,{picked,answered:true,correct:right,firstCorrect:old.answered?old.firstCorrect:right,attempts:(old.attempts||0)+1,peeked:false,expanded:true,legacy:false,updatedAt:Date.now()});
    state=V.readSet(sid);V.setLast(sid,q.no);fresh=q.no;replaceCard(q,'result');fresh=null;updateMetrics();
    V.announce(right?'맞았습니다.':'틀렸습니다. 정답은 '+(q.an+1)+'번 '+q.op[q.an].w+'입니다.');
  }
  function mapClass(q,r){if(!r.answered)return '';return r.correct?'r':'w';}
  function renderSideMap(){
    const box=$('sideMap');if(!box)return;
    box.innerHTML=items.map(q=>{const r=rec(q.no);return '<button type="button" class="'+mapClass(q,r)+(visible.some(x=>x.no===q.no)?' current':'')+'" data-no="'+q.no+'" title="'+q.no+'번 '+scoreText(q,r)+'" aria-label="'+q.no+'번, '+scoreText(q,r)+(r.bookmark?', 저장함':'')+'"></button>';}).join('');
  }
  function updateMetrics(){
    state=V.readSet(sid);const st=V.summary(metas,state),pct=Math.round(st.done/items.length*100);
    $('setPercent').textContent=pct+'%';$('setProgress').setAttribute('aria-valuenow',st.done);$('setProgress').querySelector('span').style.width=pct+'%';
    $('setProgressLabel').textContent=st.done+' / '+items.length+'문항 풀이';$('scoreRight').textContent=st.right;$('scoreWrong').textContent=st.wrong;
    if(visible.length){const a=visible[0].no,b=visible[visible.length-1].no;$('pageRange').textContent=a===b?a+'번':a+'–'+b+'번';}
    else $('pageRange').textContent='';
    renderSideMap();
    if($('navigatorDialog').open)renderMap();
  }
  function renderPage(scroll,focusNo){
    const pages=Math.max(1,Math.ceil(pool.length/size));pageIndex=Math.max(0,Math.min(pageIndex,pages-1));
    visible=pool.slice(pageIndex*size,(pageIndex+1)*size);
    $('app').replaceChildren(...visible.map(renderQuestion));$('studyEmpty').hidden=visible.length>0;
    $('pageIndicator').textContent=pool.length?(pageIndex+1)+' / '+pages:'0 / 0';
    $('prevPage').disabled=pageIndex===0||!pool.length;$('nextPage').disabled=pageIndex>=pages-1||!pool.length;
    const remaining=Math.min(size,Math.max(0,pool.length-(pageIndex+1)*size));
    $('nextPage').textContent=remaining?(size===1?'다음 문항':'다음 '+remaining+'문항'):'마지막 묶음';
    $('prevPage').textContent=size===1?'이전 문항':'이전';
    $('mobileNext').disabled=$('nextPage').disabled;
    $('readerMode').textContent=modeNames[filter];
    updateMetrics();
    if(visible.length){
      const no=focusNo&&visible.some(q=>q.no===focusNo)?focusNo:visible[0].no;
      V.writeJSON('vcs-syn-1913:position:'+sid,{no,size});V.setLast(sid,no);
      if(scroll){
        try{history.replaceState(null,'','#q'+no);}catch(_){}
        const t=$('q'+no);t.classList.add('is-target');t.focus({preventScroll:true});t.scrollIntoView({block:'start'});
        setTimeout(()=>t.classList.remove('is-target'),1500);
      }
    }
  }
  function gotoQuestion(no,scroll=true){
    if(!byNo.has(no)){V.toast('이 세트에 없는 번호입니다.');return;}
    if(!pool.some(q=>q.no===no)){filter='all';$('studyFilter').value=filter;rebuildPool();}
    pageIndex=Math.floor(pool.findIndex(q=>q.no===no)/size);renderPage(scroll,no);
  }
  function changeFilter(){filter=$('studyFilter').value;rebuildPool();pageIndex=0;renderPage(false);V.announce(modeNames[filter]+' '+pool.length+'개를 불러왔습니다.');}
  function renderMap(){
    $('questionMap').innerHTML=items.map(q=>{
      const r=rec(q.no),cls=r.answered?(r.correct?'r':'w'):'';
      const sym=r.answered?(r.correct?'✓':'×'):'○';
      return '<button type="button" class="map-button '+cls+(visible.some(x=>x.no===q.no)?' current':'')+'" data-no="'+q.no+'" aria-label="'+q.no+'번, '+scoreText(q,r)+(r.bookmark?', 저장함':'')+'"><span class="map-no">'+q.no+'</span><span class="map-status">'+sym+(r.bookmark?'★':'')+'</span></button>';
    }).join('');
  }
  function openMap(){state=V.readSet(sid);renderMap();V.openDialog($('navigatorDialog'));}
  function revealBatch(expanded){
    state=V.readSet(sid);
    for(const q of visible){
      const r=state[q.no]||{};
      if(!expanded&&!r.answered&&!r.peeked)continue;
      retrying.delete(q.no);state[q.no]=Object.assign({},r,{peeked:r.peeked||(!r.answered&&expanded),expanded});
    }
    V.saveSet(sid,state);state=V.readSet(sid);V.closeDialog($('settingsDialog'));renderPage(false);
    V.toast(expanded?'보이는 문항의 해설을 펼쳤습니다. 안 푼 문항은 채점하지 않습니다.':'보이는 문항의 해설을 접었습니다.');
  }
  function preparePrint(){
    if(printPrepared)return;printPrepared=true;
    if(!document.documentElement.dataset.print)document.documentElement.dataset.print='questions';
    restorePrint=[];
    for(const q of visible){const el=$('solution'+q.no);if(el&&!el.innerHTML)el.innerHTML=solutionHTML(q,rec(q.no));}
    if(document.documentElement.dataset.print==='answers')document.querySelectorAll('#app .gloss-item').forEach(d=>{restorePrint.push([d,d.open]);d.open=true;});
  }
  function finishPrint(){for(const [d,o] of restorePrint)d.open=o;restorePrint=[];printPrepared=false;delete document.documentElement.dataset.print;}
  function print(mode){V.closeDialog($('settingsDialog'));document.documentElement.dataset.print=mode;preparePrint();window.print();}

  /* 키보드: 1~5 보기 선택, ←/→ 묶음 이동 */
  function activeCard(){
    const cards=[...document.querySelectorAll('#app .question-card')];if(!cards.length)return null;
    const unanswered=c=>!!c.querySelector('[data-pick]:not(:disabled)');
    let start=cards.findIndex(c=>c.contains(document.activeElement));
    if(start<0)start=cards.findIndex(c=>c.getBoundingClientRect().bottom>100);
    if(start<0)start=0;
    for(let i=start;i<cards.length;i++)if(unanswered(cards[i]))return cards[i];
    return null;
  }
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.isComposing)return;
    if(document.querySelector('dialog[open]'))return;
    if(e.target.closest&&e.target.closest('input,select,textarea,[contenteditable]'))return;
    if(/^[1-5]$/.test(e.key)){
      const card=activeCard();if(!card)return;
      const q=byNo.get(+card.dataset.no),i=+e.key-1;
      if(q&&i<q.op.length){e.preventDefault();choose(q,i);}
    }else if(e.key==='ArrowRight'&&!$('nextPage').disabled){e.preventDefault();$('nextPage').click();}
    else if(e.key==='ArrowLeft'&&!$('prevPage').disabled){e.preventDefault();$('prevPage').click();}
  });

  $('studyFilter').addEventListener('change',changeFilter);
  $('pageSize').addEventListener('change',()=>{
    const no=visible[0]?.no;size=Number($('pageSize').value);V.writeJSON('vcs-syn-1913:pageSize',size);
    pageIndex=no?Math.max(0,Math.floor(pool.findIndex(q=>q.no===no)/size)):0;renderPage(false);
  });
  $('prevPage').addEventListener('click',()=>{if(pageIndex>0){pageIndex--;renderPage(true);}});
  $('nextPage').addEventListener('click',()=>{if((pageIndex+1)*size<pool.length){pageIndex++;renderPage(true);}});
  $('mobileNext').addEventListener('click',()=>$('nextPage').click());
  $('mobileNavigator').addEventListener('click',openMap);
  $('questionMap').addEventListener('click',e=>{const b=e.target.closest('[data-no]');if(b){V.closeDialog($('navigatorDialog'));gotoQuestion(+b.dataset.no);}});
  $('sideMap').addEventListener('click',e=>{const b=e.target.closest('[data-no]');if(b)gotoQuestion(+b.dataset.no);});
  $('resumeSet').addEventListener('click',()=>{state=V.readSet(sid);const q=items.find(x=>!state[x.no]?.answered);if(q)gotoQuestion(q.no);else V.toast('이 세트는 다 풀었습니다. 틀린 문항만 골라 다시 풀어 보세요.');});
  $('showAll').addEventListener('click',()=>{$('studyFilter').value='all';changeFilter();});
  $('revealPage').addEventListener('click',()=>revealBatch(true));$('hidePage').addEventListener('click',()=>revealBatch(false));
  $('printQuestions').addEventListener('click',()=>print('questions'));$('printAnswers').addEventListener('click',()=>print('answers'));
  window.addEventListener('beforeprint',preparePrint);window.addEventListener('afterprint',finishPrint);
  $('resetSet').addEventListener('click',()=>{
    if(!window.confirm('이 세트에서 푼 기록과 저장한 문항을 모두 지울까요? 다른 세트 기록은 그대로 둡니다.'))return;
    V.saveSet(sid,{});state=V.readSet(sid);retrying.clear();filter='all';$('studyFilter').value='all';rebuildPool();pageIndex=0;V.closeDialog($('settingsDialog'));renderPage(false);V.toast('이 세트 기록을 지웠습니다.');
  });
  window.addEventListener('vc:state',updateMetrics);
  const externalRefresh=()=>{retrying.clear();rebuildPool();renderPage(false);};
  window.addEventListener('vc:import',externalRefresh);window.addEventListener('vc:external',externalRefresh);
  window.addEventListener('hashchange',()=>{const m=location.hash.match(/^#q(\d+)$/);if(m)gotoQuestion(+m[1]);});

  rebuildPool();
  const hash=location.hash.match(/^#q(\d+)$/),position=V.readJSON('vcs-syn-1913:position:'+sid,{});
  const start=hash?+hash[1]:(position&&byNo.has(position.no)?position.no:null);
  if(start&&byNo.has(start)){
    if(!pool.some(q=>q.no===start)&&hash){filter='all';$('studyFilter').value='all';rebuildPool();}
    const at=pool.findIndex(q=>q.no===start);pageIndex=at<0?0:Math.floor(at/size);
  }
  renderPage(!!hash,start);
})();
