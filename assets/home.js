/* 처음 화면: 내 기록, 문항 찾기, 세트 목록 */
(function(){
  'use strict';
  const V=window.VC;if(!V)return;
  const C=V.catalog,$=id=>document.getElementById(id),E=V.esc;
  const pad=n=>String(n).padStart(2,'0'),fmt=n=>n.toLocaleString('ko-KR');
  let allStates=V.states(),limit=30,timer;
  const search=$('qsearch'),school=$('schoolFilter'),type=$('typeFilter'),view=$('homeStateFilter');
  const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().trim();
  const index=C.items.map(q=>({q,word:normalize(q.w),meaning:normalize(q.k),source:normalize(q.c)}));
  const bySet=new Map(C.sets.map(s=>[s.number,C.items.filter(q=>q.s===s.number)]));
  const schoolCount=new Map(C.sets.map(s=>[s.number,new Set(bySet.get(s.number).map(q=>q.c)).size]));
  const schools=[...new Set(C.items.map(q=>q.c))].sort((a,b)=>a.localeCompare(b,'ko'));
  school.innerHTML='<option value="">모든 출처</option>'+schools.map(s=>'<option value="'+E(s)+'">'+E(s)+'</option>').join('');

  const params=new URLSearchParams(location.search);
  if(['all','todo','wrong','saved'].includes(params.get('view')))view.value=params.get('view');
  if(params.get('q'))search.value=params.get('q').slice(0,200);
  if(schools.includes(params.get('school')))school.value=params.get('school');
  if(['동의어','반의어'].includes(params.get('type')))type.value=params.get('type');
  document.querySelectorAll('.top-nav a').forEach(a=>{
    const v=new URL(a.href,location.href).searchParams.get('view')||'all';
    if(v===(params.get('view')||'all'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });

  function cellClass(q,r){
    if(!r||!r.answered)return '';
    return r.correct?'r':'w';
  }
  function setCards(){
    $('sets').innerHTML=C.sets.map(s=>{
      const qs=bySet.get(s.number),recs=allStates[s.id]||{},st=V.summary(qs,recs);
      const dots=qs.map(q=>'<i class="'+cellClass(q,recs[q.n])+'"></i>').join('');
      let state='<span>'+s.count+'문항</span><span>안 풀었음</span>';
      if(st.done)state='<span><b>'+st.done+'</b> / '+s.count+' 풀이</span><span>'+(st.wrong?'틀림 '+st.wrong:'틀린 문항 없음')+'</span>';
      if(st.done===s.count)state='<span><b>다 풀었음</b></span><span>'+(st.wrong?'틀림 '+st.wrong:'모두 맞힘')+'</span>';
      return '<li><a class="set-card" href="'+V.setURL(s.number)+'" aria-label="세트 '+pad(s.number)+', '+s.first+'번부터 '+s.last+'번, '+st.done+'문항 풀이"><div><span class="set-no">'+pad(s.number)+'</span><span class="set-range">'+s.first+'–'+s.last+'번</span></div><div class="dots" aria-hidden="true">'+dots+'</div><p class="set-sources">'+s.sources.map(E).join(', ')+(schoolCount.get(s.number)>s.sources.length?' 외 '+(schoolCount.get(s.number)-s.sources.length)+'개 출처':'')+'</p><p class="set-state">'+state+'</p></a></li>';
    }).join('');
  }
  function dashboard(){
    const s=V.allSummary(allStates),pct=s.done/C.total*100;
    $('homeDone').textContent=fmt(s.done);$('homeWrong').textContent=fmt(s.wrong);$('homeWrong').classList.toggle('has',s.wrong>0);$('homeSaved').textContent=fmt(s.saved);
    $('overallProgress').setAttribute('aria-valuenow',s.done);$('overallProgress').querySelector('span').style.width=pct+'%';
    $('overallCaption').textContent=fmt(C.total)+'문항 중 '+fmt(s.done)+'문항';
    $('overallPercent').textContent=(pct>0&&pct<1?pct.toFixed(1):Math.round(pct))+'%';
    const last=V.getLast();
    if(last){
      const url=V.setURL(last.number,last.no);
      $('startLearning').href=url;$('dockResume').href=url;$('startLearning').textContent='이어서 풀기';
      $('resumeLabel').textContent='마지막으로 본 문항: 세트 '+pad(last.number)+', '+last.no+'번';
    }
    setCards();
  }
  function matches(){
    const term=normalize(search.value),found=[];
    for(const x of index){
      const q=x.q;
      if(school.value&&q.c!==school.value)continue;
      if(type.value&&q.t!==type.value)continue;
      if(!V.matchesState(q,V.recordFor(q,allStates),view.value))continue;
      let rank=0;
      if(term){
        if(x.word===term||String(q.n)===term)rank=0;
        else if(x.word.startsWith(term))rank=1;
        else if(x.word.includes(term))rank=2;
        else if(x.meaning.includes(term)||x.source.includes(term))rank=3;
        else continue;
      }
      found.push({q,rank});
    }
    found.sort((a,b)=>a.rank-b.rank||a.q.n-b.q.n);
    return found.map(x=>x.q);
  }
  function status(q,r){
    if(!r||!r.answered)return '';
    return r.correct?'<span>맞힘</span>':'<span class="is-wrong">틀림</span>';
  }
  function renderSearch(){
    const active=!!(search.value.trim()||school.value||type.value||view.value!=='all');
    $('clearSearch').hidden=!search.value;$('searchResults').hidden=!active;$('setSection').hidden=active;
    if(!active){$('hits').replaceChildren();$('resultCount').textContent='';return;}
    const result=matches(),shown=result.slice(0,limit);
    $('resultsTitle').textContent=({wrong:'틀린 문항',saved:'저장한 문항',todo:'안 푼 문항'}[view.value]||'찾은 문항');
    $('resultCount').textContent=fmt(result.length)+'문항'+(result.length>shown.length?', 앞에서 '+shown.length+'개':'');
    $('searchEmpty').hidden=!!result.length;$('moreResults').hidden=result.length<=limit;
    $('moreResults').textContent='30개 더 보기 ('+shown.length+'/'+fmt(result.length)+')';
    $('hits').innerHTML=shown.map(q=>{
      const r=V.recordFor(q,allStates),parts=['세트 '+pad(q.s),E(q.c),E(q.t)];
      const st=status(q,r);if(st)parts.push(st);
      if(r&&r.bookmark)parts.push('저장');
      return '<li><a class="hit-link" href="'+V.setURL(q.s,q.n)+'"><span class="hit-word" lang="en">'+E(q.w||'(표제어 없음)')+'</span><p class="hit-meaning">'+E(q.k||'')+'</p><span class="hit-meta">'+q.n+'번&ensp;'+parts.join(', ')+'</span></a></li>';
    }).join('');
  }
  function refresh(){allStates=V.states();dashboard();renderSearch();}
  search.addEventListener('input',e=>{if(e.isComposing)return;clearTimeout(timer);timer=setTimeout(()=>{limit=30;renderSearch();},120);});
  search.addEventListener('compositionend',()=>{clearTimeout(timer);limit=30;renderSearch();});
  [school,type,view].forEach(el=>el.addEventListener('change',()=>{limit=30;renderSearch();}));
  $('clearSearch').addEventListener('click',()=>{search.value='';limit=30;renderSearch();search.focus();});
  $('clearFilters').addEventListener('click',()=>{search.value='';school.value='';type.value='';view.value='all';limit=30;renderSearch();search.focus();});
  $('moreResults').addEventListener('click',()=>{limit+=30;renderSearch();});
  window.addEventListener('vc:import',refresh);window.addEventListener('vc:external',refresh);
  window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
  dashboard();renderSearch();
  if(active())$('searchResults').scrollIntoView({block:'start'});
  function active(){return view.value!=='all'&&params.has('view');}
})();
