(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const state={mode:'website',data:null,selected:0};
  function setText(selector,value){const el=$(selector);if(el)el.textContent=String(value??'');}
  function output(data){
    state.data=data;state.selected=0;
    const list=Array.isArray(data.issues)?data.issues.slice(0,3):[];
    $('#readyView').hidden=false;$('#deepCard').hidden=false;
    setText('#findingCount',String(list.length).padStart(2,'0'));
    setText('#resultHeading',list.length?'Blind spots, made visible.':'A clean first pass.');
    setText('#resultLead',data.scope||'This is a limited first-look inspection.');
    setText('#resultStatusText',list.length?`Found ${list.length} issue${list.length===1?'':'s'} in the supported checks`:'Supported checks completed');
    setText('#sourceTitle',data.pageTitle||data.subject||'Submitted source');
    setText('#sourceDescription',data.summary||'Only details that could be read from the source are shown.');
    setText('#sourceDomain',data.subject||'Your source');
    setText('#subjectName',data.subject||'Your source');
    setText('#subjectMeta',data.meta||'Initial inspection completed');
    setText('#scopeNote',data.scope||'This report only covers the supported checks.');
    setText('#sourceScope',data.coverageLabel||'Source checks');
    const coverage=$('#coverageList');coverage.replaceChildren();
    (data.checked||[]).forEach(t=>{const row=document.createElement('div');row.className='coverage-row';const dot=document.createElement('span');dot.className='coverage-check';dot.textContent='✓';row.append(dot,document.createTextNode(t));coverage.append(row)});
    const rail=$('#findingRail');rail.replaceChildren();
    list.forEach((finding,i)=>{
      const b=document.createElement('button');b.type='button';b.className='finding-choice';b.setAttribute('aria-pressed',String(i===0));
      const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');
      const title=document.createElement('strong');title.textContent=finding.title;
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 24 24');const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','m9 18 6-6-6-6');arrow.append(p);
      b.append(n,title,arrow);b.addEventListener('click',()=>selectFinding(i));rail.append(b);
    });
    $('#findingDetail').hidden=!list.length;$('#emptyFindings').hidden=!!list.length;
    if(list.length)selectFinding(0);
    const more=(Number(data.totalDetected)||list.length)-list.length;
    $('#moreIndicator').hidden=more<=0;
    if(more>0)setText('#moreIndicator',`${more} additional source-level check${more===1?'':'s'} flagged possible issues. A deeper review is needed to prioritize them.`);
    const subject=data.subject||'source';
    const link=$('#deepAction');link.href=`mailto:hello.skyorigin@gmail.com?subject=${encodeURIComponent(`VYLENS ${state.mode==='website'?'Website':'Digital Product'} Full Review Request`)}&body=${encodeURIComponent(`Hello VYLENS,\n\nI'd like a full review of ${subject}.\n\nPlease share what is included and how the one-time payment works.\n\nThanks!`)}`;
  }
  function selectFinding(index){
    const list=state.data?.issues||[];const f=list[index];if(!f)return;state.selected=index;
    $$('.finding-choice').forEach((b,i)=>{b.classList.toggle('is-selected',i===index);b.setAttribute('aria-pressed',String(i===index))});
    setText('#detailCategory',(f.category||'REVIEW').toUpperCase());setText('#detailSeverity',(f.severity||'review').toUpperCase());
    const label=$('#detailSeverity');label.className='severity-tag '+(['high','low'].includes(f.severity)?f.severity:'medium');
    setText('#detailTitle',f.title);setText('#detailEvidence',f.evidence);setText('#detailFix',f.fix);
  }
  function printReport(){
    if(!state.data)return;
    const data=state.data;
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rows=(data.issues||[]).map((f,i)=>`<section style="break-inside:avoid;border:1px solid #d7e5cf;padding:16px;margin:12px 0;border-radius:10px"><h2 style="font-size:18px">${i+1}. ${esc(f.title)}</h2><p><b>Severity:</b> ${esc(f.severity)} · <b>Category:</b> ${esc(f.category)}</p><p><b>Evidence:</b> ${esc(f.evidence)}</p><p><b>Suggested improvement:</b> ${esc(f.fix)}</p></section>`).join('')||'<p>No issues detected by the supported checks.</p>';
    const child=window.open('','_blank','width=720,height=750');
    if(child) child.opener=null;
    if(!child){window.print();return}
    child.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VYLENS Free Audit</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#202820;max-width:700px;margin:30px auto;padding:0 22px}h1{line-height:1.15}small{color:#667360}@media print{body{margin:0 auto}}</style></head><body><h1>VYLENS / Free Inspection</h1><p><b>Subject:</b> ${esc(data.subject)}</p><small>${esc(data.scope)}</small>${rows}<p>Generated as a limited first look. Not a paid, comprehensive or visual inspection.</p><script>window.onload=function(){window.print()}<\/script></body></html>`);child.document.close();
  }

  function init() {
    setText('#workspaceYear',new Date().getFullYear());
    let data=null;
    try {data=JSON.parse(sessionStorage.getItem('vylens:result')||'null');} catch {data=null;}
    if (!data || !Array.isArray(data.issues) || !['website','product'].includes(data.mode)) {
      $('#workspaceMain').querySelectorAll('.workspace-intro,.workspace-summary,.workspace-layout').forEach(el=>el.hidden=true);
      $('#missingReport').hidden=false;
      return;
    }
    state.mode=data.mode;
    setText('#modePill',data.mode==='website'?'Website audit':'Digital product audit');
    setText('#sourceType',data.mode==='website'?'Website':'Digital product');
    setText('#deepPrice',data.mode==='website'?'$19':'$9');
    setText('#subjectName',data.subject||'Your source');
    setText('#subjectMeta',data.meta||'Inspection complete');
    setText('#statusLabel','First look ready');
    $('#subjectStatus').classList.add('is-done');
    setText('#privacyStrip',data.mode==='website'?'This first look is based on public HTML; visual behavior and sales are not measured.':'This first look comes from local checks. Your original file is not uploaded.');
    output(data);
    $('#exportButton').addEventListener('click',printReport);
  }
  init();
})();
