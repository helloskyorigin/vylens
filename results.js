(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = { report:null, urgent:[], notes:[], filter:'all', selected:null, completed:new Set(), key:'' };
  const severityRank = { critical:0, high:1 };
  const at = (text, parent, tag='span', className='') => {
    const element=document.createElement(tag);
    if(className)element.className=className;
    element.textContent=String(text ?? '');
    parent.append(element);
    return element;
  };
  const set = (id, text) => { const element=$('#'+id); if(element)element.textContent=String(text ?? ''); };
  const severity = (issue) => {
    const label=String(issue?.severity || '').toLowerCase();
    return label === 'critical' ? 'critical' : label === 'high' ? 'high' : 'note';
  };
  const impactLabel = (issue) => issue.location || issue.category || 'Source inspection';
  function safeReport(value){
    if(!value || !['website','product'].includes(value.mode) || !Array.isArray(value.issues))return null;
    if(value.issues.length>250) return null;
    return value;
  }
  function getChecks(report) {
    if(Array.isArray(report.checks))return report.checks.slice(0,200).map(x=>({
      name:String(x.name||x.label||'Source check').slice(0,120),
      detail:String(x.detail||'').slice(0,400),
      status:['passed','attention','observed','unverified'].includes(x.status)?x.status:'observed'
    }));
    // Earlier reports included check names but did not establish pass/fail per check.
    return (Array.isArray(report.checked)?report.checked:[]).slice(0,200).map(name=>({name:String(name),status:'observed',detail:'This check was attempted; pass/fail detail was not stored.'}));
  }
  function getPlanKey(report){
    const string=[report.mode,report.subject,report.checkedAt||report.completedAt||'',JSON.stringify(report.issues)].join('|');
    let hash=2166136261;
    for(let i=0;i<string.length;i++){hash^=string.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return 'vylens:plan:'+(hash>>>0).toString(36);
  }
  function cleanText(text){return String(text ?? '').replace(/\s+/g,' ').trim();}
  function reportDate(data){
    const time=new Date(data.checkedAt||data.completedAt||Date.now());
    return Number.isNaN(time.valueOf())?'Date unavailable':time.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  }
  function initHeader() {
    const data=state.report;
    set('year',new Date().getFullYear());
    set('reportType',data.mode==='website'?'WEBSITE AUDIT':'DIGITAL PRODUCT AUDIT');
    set('reportSubject',data.subject||data.url||'Your submitted file');
    set('reportDate',reportDate(data));
    const critical=state.urgent.filter(x=>severity(x)==='critical').length;
    const high=state.urgent.filter(x=>severity(x)==='high').length;
    const checks=getChecks(data);
    set('criticalCount',String(critical).padStart(2,'0'));
    set('highCount',String(high).padStart(2,'0'));
    set('checksCount',String(Number.isFinite(data.checksRun)?Math.max(0,data.checksRun):checks.length).padStart(2,'0'));
    $('#criticalCard').classList.toggle('is-clear',critical===0);
    set('criticalCaption',critical?'Confirmed severe findings':'No critical blockers detected');
    set('issuesLabel',`${state.urgent.length} prioritized issue${state.urgent.length===1?'':'s'}`);
    set('allCount',state.urgent.length);set('filterCritical',critical);set('filterHigh',high);
    set('metricFootnote','Critical and High require evidence. Checks Run counts inspections attempted, not issues found.');
  }
  function initPriority(){
    const item=state.urgent[0];
    const button=$('#priorityButton');
    if(!item){
      set('priorityTag','NO URGENT ISSUES');$('#priorityTag').classList.add('is-clear');
      set('priorityTitle','No urgent blockers detected.');
      set('priorityCopy','No Critical or High issues were confirmed in the supported checks. This is not a full visual or conversion assessment. Review coverage and any additional observations.');
      button.textContent='See inspection coverage →';
      button.addEventListener('click',()=>$('#coverage').scrollIntoView({behavior:'smooth',block:'start'}));
      return;
    }
    set('priorityTag',severity(item)==='critical'?'CRITICAL — FIX FIRST':'HIGH PRIORITY — FIX FIRST');
    set('priorityTitle',item.title||'Priority finding');
    set('priorityCopy',item.evidence||'See supporting evidence before changing your product.');
    button.addEventListener('click',()=>{
      state.filter='all';syncFilters();selectIssue(item);
      $('#findings').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  function syncFilters(){
    $$('.filter-chip').forEach(button=>{
      const active=button.dataset.filter===state.filter;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    renderIssueList();
  }
  function selectIssue(item,{focus=false}={}) {
    if(!item)return;
    state.selected=item;
    $$('.issue-row').forEach(button=>{
      const active=state.urgent[Number(button.dataset.issueIndex)]===item;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    const rank=severity(item);
    set('detailSeverity',rank.toUpperCase());
    $('#detailSeverity').className='detail-severity'+(rank==='critical'?' critical':'');
    const index=state.urgent.indexOf(item)+1;
    set('detailIndex',`${String(index).padStart(2,'0')} / ${String(state.urgent.length).padStart(2,'0')}`);
    set('detailTitle',item.title||'Finding');
    set('detailLocation',impactLabel(item));
    set('detailEvidence',item.evidence||'The source did not include further evidence.');
    set('detailFix',item.fix||'Review and correct this issue, then inspect the updated source.');
    set('detailVerify',item.verify||'After applying the fix, run a new audit and confirm this check no longer flags the issue.');
    set('copyFeedback','');
    if(focus) $('#issueDetail').focus({preventScroll:true});
  }
  function renderIssueList(){
    const list=$('#issueList');list.replaceChildren();
    const filtered=state.filter==='all'?state.urgent:state.urgent.filter(x=>severity(x)===state.filter);
    if(!filtered.length){
      const row=at(state.filter==='all'?'No prioritized issues detected.':`No ${state.filter} findings.`,list,'p','plan-empty');
      row.style.padding='20px 0';
      $('#issueDetail').hidden=true;
      return;
    }
    $('#issueDetail').hidden=false;
    filtered.forEach((item,index)=>{
      const button=document.createElement('button');button.type='button';button.className='issue-row';
      button.dataset.issueIndex=String(state.urgent.indexOf(item));
      button.setAttribute('aria-pressed',String(state.selected===item));
      at(String(state.urgent.indexOf(item)+1).padStart(2,'0'),button,'span','issue-num');
      const copy=at('',button,'span','issue-row-content');
      at(item.title||'Finding',copy,'strong');at(impactLabel(item),copy,'small');
      at(severity(item).toUpperCase(),button,'span','severity-pill '+severity(item));
      button.addEventListener('click',()=>{
        selectIssue(item);
        if(window.matchMedia('(max-width:700px)').matches){
          $('#issueDetail').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
        }
      });
      list.append(button);
    });
    if(!filtered.includes(state.selected))state.selected=filtered[0];
    selectIssue(state.selected);
  }
  function initFindings(){
    $('#findingsWorkspace').hidden=!state.urgent.length;
    $('#noPriority').hidden=!!state.urgent.length;
    $$('.filter-chip').forEach(button=>button.addEventListener('click',()=>{
      state.filter=button.dataset.filter;
      syncFilters();
    }));
    if(state.urgent.length){state.selected=state.urgent[0];syncFilters();}
    $('#copyFinding').addEventListener('click',async()=>{
      if(!state.selected)return;
      const item=state.selected;
      const content=`${item.title}\nEvidence: ${item.evidence}\nFix: ${item.fix}\nVerify: ${item.verify||'Re-run the audit after updating the source.'}`;
      try {await navigator.clipboard.writeText(content);set('copyFeedback','Copied');}
      catch {set('copyFeedback','Copy unavailable in this browser');}
    });
  }
  function initNotes(){
    if(!state.notes.length)return;
    $('#notesSection').hidden=false;
    const list=$('#notesList');
    state.notes.forEach(item=>{
      const detail=at('',list,'details','note-item');
      const summary=at('',detail,'summary');
      at(item.category||'Observation',summary,'span','note-category');
      at(item.title||'Worth reviewing',summary,'strong');
      at('+',summary,'span','note-chevron');
      const body=at('',detail,'div','note-body');
      const observed=at('',body,'p');at('Observed: ',observed,'b');observed.append(document.createTextNode(item.evidence||'No extra detail was provided.'));
      const fix=at('',body,'p');at('Suggestion: ',fix,'b');fix.append(document.createTextNode(item.fix||'Review this area.'));
    });
  }
  function restorePlan(){
    try {
      const old=JSON.parse(sessionStorage.getItem(state.key)||'[]');
      state.completed=new Set(Array.isArray(old)?old.filter(x=>Number.isInteger(x)):[]);
    } catch {state.completed=new Set()}
  }
  function updatePlan(){
    const done=state.urgent.filter((_,i)=>state.completed.has(i)).length;
    set('planProgress',`${done} of ${state.urgent.length} done`);
    $('#planTrackFill').style.width=state.urgent.length?`${Math.round(100*done/state.urgent.length)}%`:'0%';
    sessionStorage.setItem(state.key,JSON.stringify([...state.completed]));
  }
  function initPlan(){
    const list=$('#planList');
    $('#planEmpty').hidden=!!state.urgent.length;
    restorePlan();
    state.urgent.forEach((item,index)=>{
      const row=at('',list,'div','plan-item');
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='plan-'+index;checkbox.checked=state.completed.has(index);row.append(checkbox);
      const label=at('',row,'label');label.htmlFor=checkbox.id;
      at(item.title||'Review issue',label,'strong');at(item.fix||'Review this issue.',label,'p');
      at(severity(item)==='critical'?'CRITICAL':'HIGH',row,'span','plan-priority '+severity(item));
      row.classList.toggle('is-done',checkbox.checked);
      checkbox.addEventListener('change',()=>{
        if(checkbox.checked)state.completed.add(index);else state.completed.delete(index);
        row.classList.toggle('is-done',checkbox.checked);updatePlan();
      });
    });
    updatePlan();
  }
  function initCoverage(){
    const checks=getChecks(state.report);
    const passed=checks.filter(x=>x.status==='passed');
    set('passedCount',passed.length);
    set('coverageScope',state.report.scope||'Only the submitted source and supported checks were evaluated.');
    const container=$('#coverageList');
    if(!checks.length){at('No check-by-check evidence was saved in this report.',container,'p','plan-empty');return}
    const statusNames={passed:'PASSED',attention:'NEEDS REVIEW',observed:'CHECKED',unverified:'NOT VERIFIED'};
    checks.forEach(check=>{
      const row=at('',container,'div','coverage-row');
      at(check.status==='passed'?'✓':'·',row,'span','coverage-icon'+(check.status==='passed'?'':' not-passed'));
      const copy=at('',row,'div','coverage-row-copy');
      at(check.name,copy,'strong');
      if(check.detail)at(check.detail,copy,'small');
      at(statusNames[check.status],row,'span','coverage-row-status'+(check.status==='passed'?'':' unverified'));
    });
  }
  function initPrintAppendix(){
    const target=$('#printAllFindings');
    const heading=at('Full finding details',target,'h2');heading.className='print-heading';
    const sorted=[...state.urgent,...state.notes];
    if(!sorted.length)at('No source-backed problems detected in the supported checks.',target,'p');
    sorted.forEach((item,i)=>{
      const block=at('',target,'section','print-finding');
      at(`${i+1}. ${item.title||'Finding'}`,block,'h3');
      at(`${severity(item)==='note'?'Observation':severity(item).toUpperCase()} · ${impactLabel(item)}`,block,'div','print-small');
      at(`Evidence: ${item.evidence||'Not available'}`,block,'p');
      at(`Recommended fix: ${item.fix||'Review this area'}`,block,'p');
      if(item.verify)at(`Verify: ${item.verify}`,block,'p');
    });
    at('Checks performed',target,'h2','print-heading');
    getChecks(state.report).forEach(check=>at(`${check.name} — ${check.status.toUpperCase()}${check.detail?' — '+check.detail:''}`,target,'p','print-check'));
    at('Inspection limitations',target,'h2','print-heading');
    at(state.report.scope||'Only supported source checks were evaluated.',target,'p','print-small');
    at('VYLENS · Full report · No payment required',target,'p','print-small');
  }
  function initActions(){
    $('#savePdf').addEventListener('click',()=>window.print());
    $('#recheck').addEventListener('click',()=>{
      if(state.report.mode==='website' && state.report.url){
        sessionStorage.setItem('vylens:pending',JSON.stringify({mode:'website',url:state.report.url}));
        window.location.assign('./inspect.html');
      } else {
        // The original product file was consumed from short-lived storage; don't re-audit stale data.
        sessionStorage.setItem('vylens:prefill-mode','product');
        window.location.assign('./index.html#audit-tool');
      }
    });
  }
  function init(){
    set('year',new Date().getFullYear());
    let raw=null;
    try {raw=JSON.parse(sessionStorage.getItem('vylens:result')||'null');}catch{}
    state.report=safeReport(raw);
    if(!state.report){$('#missingReport').hidden=false;return}
    $('#main').hidden=false;
    state.urgent=state.report.issues.filter(item=>['critical','high'].includes(severity(item))).sort((a,b)=>severityRank[severity(a)]-severityRank[severity(b)]);
    state.notes=state.report.issues.filter(item=>severity(item)==='note');
    state.key=getPlanKey(state.report);
    initHeader();initPriority();initFindings();initNotes();initPlan();initCoverage();initPrintAppendix();initActions();
  }
  init();
})();
