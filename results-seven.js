/* VYLENS Results v9: seven evidence-led sections on the existing Results flow.
 * Keeps scanner data, the original five-section renderer, fix kit, PDF and legacy report paths. */
(() => {
  'use strict';
  const root=document.getElementById('fiveReport');
  let report;
  try { report=JSON.parse(sessionStorage.getItem('vylens:result')||'null'); } catch { return; }
  const data=report?.conversion;
  if(!root||!data||data.version!==1||!Array.isArray(data.blockers)||
    !Array.isArray(data.journey)||!['website','product'].includes(report.mode)||
    root.classList.contains('seven-results'))return;
  const $=id=>document.getElementById(id);
  const clean=(value,max=950)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const make=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=clean(text,2200);
    return el;
  };
  const append=(parent,...nodes)=>{nodes.filter(Boolean).forEach(el=>parent.append(el));return parent;};
  const panel=(id,title,subtitle)=>append(make('section','five-panel seven-panel'),make('h2','five-panel-title',title),make('p','five-panel-subtitle',subtitle));
  const rank=item=>({high:0,review:1,medium:1,low:2}[item.priority]??1);
  const all=data.blockers.filter(v=>v&&typeof v==='object'&&typeof v.title==='string')
    .slice(0,20).sort((a,b)=>rank(a)-rank(b));
  const findings=report.mode==='product'?all:all.filter(v=>v.source!=='Locally inspected product file');
  const changes=findings.filter(v=>clean(v.fix).length).slice(0,12);
  const strengths=Array.isArray(data.strengths)?
    data.strengths.filter(v=>v&&typeof v==='object'&&clean(v.title)).slice(0,6):[];
  const [grid1,grid2]=Array.from(root.children).filter(n=>n.classList.contains('five-grid'));
  const blockers=$('five-blockers'),plan=$('five-action-plan'),questions=$('five-hesitations'),
    detailedChanges=$('five-changes'),bottom=root.querySelector('.five-bottom-actions');
  if(!grid1||!grid2||!blockers||!plan||!questions||!detailedChanges||!bottom)return;
  root.classList.add('seven-results');
  root.setAttribute('aria-label','VYLENS conversion report: findings, plan, strengths, recheck, buyer journey, limitations and actions');

  // 1 — Most important evidence first. The original renderer already sorts by priority.
  blockers.querySelector('.five-panel-title').textContent='Potential Buying Blockers';
  blockers.querySelector('.five-panel-subtitle').textContent='Prioritized concerns from inspected evidence, not measured customer drop-offs.';
  const rows=Array.from(blockers.querySelectorAll('.five-finding'));
  function evidenceLine(label,value){
    const line=make('p','five-detail-line seven-evidence-line');
    return append(line,make('strong','',label),make('span','',value));
  }
  rows.forEach((row,i)=>{
    const item=findings[i];if(!item)return;
    row.id='seven-blocker-'+i;
    const heading=row.querySelector('summary');
    if(heading)heading.setAttribute('aria-label','Finding '+(i+1)+': '+clean(item.title,155));
    const body=row.querySelector('.five-reveal');
    if(!body)return;
    body.replaceChildren(
      evidenceLine('Evidence',clean(item.evidence)||'No specific evidence recorded for this detail.'),
      evidenceLine('Possible buyer concern',clean(item.buyerConcern||item.buyerQuestion)||
        'No specific concern was established from the available material.'),
      evidenceLine('What to change',clean(item.fix)||'No change recommended without additional evidence.'),
      evidenceLine('How to verify',clean(item.verify)||'No verification instruction was recorded.')
    );
    if(clean(item.location))body.append(make('small','seven-location','Location: '+clean(item.location)));
    if(item.confidence==='source-only')body.append(make('p','seven-evidence-note',
      'Source-only evidence: confirm what visitors actually see before editing.'));
    if(clean(item.fix)){
      const copy=make('button','seven-copy-fix','Copy finding');
      copy.type='button';
      copy.addEventListener('click',async()=>{
        const text=[item.title,item.location&&'Location: '+item.location,
          'Evidence: '+(item.evidence||'Not recorded'),
          'Possible buyer concern: '+(item.buyerConcern||item.buyerQuestion||'Not established'),
          'What to change: '+item.fix,'How to verify: '+(item.verify||'Not recorded')].filter(Boolean).join('\n');
        try { await navigator.clipboard.writeText(text);copy.textContent='Copied'; }
        catch { copy.textContent='Copy unavailable'; }
      });
      body.append(copy);
    }
  });
  if(rows.length){rows[0].hidden=false;rows[0].open=true;}

  // 2 — A five-step action list that navigates to the EXACT matching blocker.
  plan.querySelector('.five-panel-title').textContent='Your Improvement Plan';
  plan.querySelector('.five-panel-subtitle').textContent=
    'Top five recommended actions. Tap a step to open the matching evidence and verification.';
  const formerPlans=Array.from(plan.querySelectorAll('.five-plan-row'));
  formerPlans.forEach(el=>el.remove());
  changes.slice(0,5).forEach((item,i)=>{
    const index=findings.indexOf(item);
    const headline=clean(item.fix,160).split(/[.!?](?:\s|$)/)[0]||clean(item.title,160);
    const prior=formerPlans[i]?.querySelector('.five-plan-text strong')?.textContent;
    const title=clean(prior||headline,160);
    const button=make('button','five-plan-row seven-plan-step');
    button.type='button';
    button.setAttribute('aria-label','Step '+(i+1)+': '+title+'. Open matching blocker');
    const copy=make('span','five-plan-text');
    append(copy,make('strong','',title),
      make('small','',(item.priority==='high'?'High priority':'Review priority')+' · View evidence'));
    append(button,make('span','five-index '+(item.priority==='high'?'high':'medium'),String(i+1)),
      copy,make('span','five-plan-arrow','›'));
    button.addEventListener('click',()=>{
      const row=rows[index];if(!row)return;
      if(row.hidden){
        const showAll=blockers.querySelector('.five-more');
        if(showAll?.getAttribute('aria-expanded')==='false')showAll.click();
        row.hidden=false;
      }
      row.open=true;
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({block:'center',behavior:reduced?'auto':'smooth'});
      row.querySelector('summary')?.focus({preventScroll:true});
      row.classList.add('seven-targeted');
      window.setTimeout(()=>row.classList.remove('seven-targeted'),2000);
    });
    plan.append(button);
  });
  if(!changes.length)plan.append(make('p','seven-empty','No evidence-supported changes were recommended.'));
  if(changes.length>5)plan.append(make('p','seven-micro-note',
    'Showing the five highest-priority actions. More recorded findings remain available above.'));
  const advanced=make('details','seven-support-details');
  append(advanced,make('summary','','Detailed fixes & copy-ready wording'),detailedChanges);
  plan.append(advanced);

  // 3 — All six available positive signals, each with its actual supporting evidence.
  root.querySelector('.five-positive-details')?.remove();
  const positives=panel('seven-strengths',"What's Working",
    'Positive signals actually recorded by this scan (up to six).');
  positives.id='seven-strengths';
  if(strengths.length){
    const list=make('div','seven-strength-grid');
    strengths.forEach(item=>{
      const row=make('article','seven-strength five-positive-row');
      append(row,make('span','seven-check','✓'),make('strong','',item.title));
      if(clean(item.evidence))row.append(make('p','',item.evidence));
      if(clean(item.location))row.append(make('small','',item.location));
      list.append(row);
    });
    positives.append(list);
  } else positives.append(make('p','seven-empty',
    'No positive signal was verified by supported checks. That does not mean there are no strengths.'));

  // 4 — Compare only snapshots for the same input, and never infer that a fix worked.
  const comparison=panel('seven-comparison','Recheck Comparison',
    'New, continuing and no-longer-detected findings from the same input.');
  comparison.id='seven-comparison';
  const imported=sessionStorage.getItem('vylens:imported')==='1';
  let previous=null;
  try { previous=imported?null:JSON.parse(sessionStorage.getItem('vylens:previous-conversion')||'null'); }
  catch { previous=null; }
  const sourceKey=report.mode==='website'?
    (()=>{try{const url=new URL(report.url);return url.origin+url.pathname.replace(/\/$/,'');}
      catch{return '';}})():clean(report.subject,250).toLowerCase();
  const notice=make('p','seven-comparison-note');
  if(previous?.mode===report.mode&&previous.sourceKey===sourceKey&&
     Array.isArray(previous.blockers)&&previous.blockers.length<=12){
    const key=item=>[item.stage,item.title,item.location]
      .map((part,i)=>clean(part,[40,155,190][i]).toLowerCase()).join('|');
    const past=previous.blockers.filter(x=>x&&typeof x==='object');
    const current=all.slice(0,12);
    const oldKeys=new Set(past.map(key)),nowKeys=new Set(current.map(key));
    const newly=current.filter(x=>!oldKeys.has(key(x)));
    const continuing=current.filter(x=>oldKeys.has(key(x)));
    const missing=past.filter(x=>!nowKeys.has(key(x)));
    const stats=make('div','seven-comparison-grid');
    [['Newly detected',newly],['Still detected',continuing],['Not detected now',missing]]
      .forEach(([label,items])=>{
        stats.append(append(make('div','seven-compare-stat'),make('strong','',items.length),make('span','',label)));
      });
    comparison.append(stats);
    const details=make('div','seven-comparison-details');
    for(const [label,items] of [['New observations',newly],['Still appearing',continuing],
      ['Not found in this scan',missing]]){
      if(!items.length)continue;
      const part=make('div','seven-change-list');
      part.append(make('strong','',label));
      items.slice(0,6).forEach(item=>part.append(make('p','',item.title)));
      details.append(part);
    }
    if(details.children.length)comparison.append(details);
    notice.textContent='Not detected now does not mean fixed: different scan coverage, page content or rendering can change results.';
  }else{
    comparison.append(make('p','seven-empty',imported?
      'Imported reports are not fresh scans. Run two live scans of the same input to compare.':
      'No comparable earlier scan found. Recheck the same input to compare findings.'));
    notice.textContent='Comparison uses this tab’s previous scan only. It does not measure real sales or confirmed fixes.';
  }
  comparison.append(notice);

  // 5 — Four clearly labeled observational stages, never fabricated funnel data.
  const journey=panel('seven-journey','Buyer Journey Review',
    'Clarity → Value → Trust → Action · observations, not a measured funnel.');
  journey.id='seven-journey';
  const names={clarity:'Clarity',value:'Value',trust:'Trust',action:'Action'};
  const labels={attention:'Needs review',observed:'Evidence observed',unverified:'Not verified'};
  const journeyGrid=make('div','seven-journey-grid');
  ['clarity','value','trust','action'].forEach((id,i)=>{
    const stage=data.journey.find(x=>x&&x.id===id)||{};
    const status=['attention','observed'].includes(stage.status)?stage.status:'unverified';
    const card=make('article','seven-stage '+status);
    append(card,make('span','seven-stage-number',String(i+1).padStart(2,'0')),
      make('h3','',names[id]),make('span','seven-stage-status',labels[status]),
      make('p','',stage.detail||'Not assessed from the available evidence.'));
    journeyGrid.append(card);
  });
  journey.append(journeyGrid);
  const replay=$('fiveBuyerReplay');
  if(replay){
    const more=make('details','seven-support-details');
    append(more,make('summary','','Observed desktop & mobile buying steps'),replay);
    journey.append(more);
  }
  if(questions.querySelector('.five-concern')){
    const more=make('details','seven-support-details');
    append(more,make('summary','','Possible buyer questions · not customer quotes'),questions);
    journey.append(more);
  }else questions.remove();

  // 6 — Expandable scan limitations and explicitly unavailable behavioral data.
  const limitations=make('details','five-panel seven-limitations');
  limitations.id='seven-limitations';
  const unverified=Array.isArray(data.unverified)?
    data.unverified.filter(x=>typeof x==='string'&&clean(x)).slice(0,12):[];
  const notes=[...unverified];
  if(report.coverage?.complete===false)
    notes.unshift('Partial scan: some pages were not inspected or could not be verified.');
  if(report.mode==='product'&&!Number(data.inspectedOfferPages))
    notes.push('Product-file checks cannot establish how visitors experience a sales page or checkout.');
  notes.push('Real visitor behavior, purchases and conversion rates were not measured.');
  const unique=[...new Set(notes)];
  append(limitations,append(make('summary','seven-limit-heading'),
    make('span','',"What Couldn't Be Verified"),make('small','',unique.length+' notes'),
    make('span','seven-chevron','⌄')));
  const limitBody=make('div','seven-limit-body');
  unique.forEach(x=>limitBody.append(make('p','',x)));
  limitations.append(limitBody);

  // 7 — Preserve existing real PDF/New Check buttons, add accessible local JSON workflows.
  const tools=make('div','seven-report-tools');
  const recheckButton=make('button','seven-quiet-action','Recheck this audit');
  recheckButton.type='button';
  recheckButton.addEventListener('click',()=>$('recheck')?.click());
  const exportButton=make('button','seven-quiet-action','Download report data (.json)');
  exportButton.type='button';
  exportButton.addEventListener('click',()=>$('exportData')?.click());
  const importButton=make('button','seven-quiet-action','Open saved report (.json)');
  importButton.type='button';
  const file=make('input','seven-import-input');
  file.type='file';file.accept='.json,application/json';file.hidden=true;
  const message=make('p','seven-import-message');message.setAttribute('role','status');
  importButton.addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
    const selected=file.files?.[0];if(!selected)return;
    try{
      if(selected.size>3*1024*1024)throw Error('Maximum report size: 3 MB.');
      const parsed=JSON.parse(await selected.text());
      if(!parsed||!['website','product'].includes(parsed.mode)||
         !Array.isArray(parsed.issues)||parsed.issues.length>250||
         (parsed.checks!==undefined&&(!Array.isArray(parsed.checks)||parsed.checks.length>5000))||
         (parsed.pages!==undefined&&(!Array.isArray(parsed.pages)||parsed.pages.length>200)))
        throw Error('This is not a supported VYLENS report.');
      if(!window.confirm('Open this saved report and replace the report currently displayed in this tab?'))return;
      sessionStorage.setItem('vylens:result',JSON.stringify(parsed));
      sessionStorage.setItem('vylens:imported','1');
      window.location.reload();
    }catch(error){message.textContent=error?.message||'Could not open saved report.';}
    finally{file.value='';}
  });
  append(tools,recheckButton,exportButton,importButton,file);
  const actions=panel('seven-actions','Report Actions','Download or start a fresh audit.');
  actions.id='seven-actions';
  append(actions,bottom,tools,message);
  const caveat=root.querySelector('.five-disclaimer');
  if(caveat)caveat.remove();
  grid1.replaceChildren(blockers,plan);
  grid1.classList.add('seven-primary-grid');
  grid2.remove();
  append(root,positives,comparison,journey,limitations,actions);
  if(caveat)root.append(caveat);
})();