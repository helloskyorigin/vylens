/**
 * VYLENS Results — SIGNAL Lime UI
 * Presentation layer only. All findings and counts come from the verified
 * scan response; no score, revenue loss, customer quote or synthetic fix.
 *
 * Runs after results.js and conversion-results.js. Legacy saved reports retain
 * their original rendering, while v1 conversion reports use this layout.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let report;
  try{report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');}catch{return;}
  const d=report?.conversion;
  if(!report||!['website','product'].includes(report.mode)||
    !d||d.version!==1||!Array.isArray(d.blockers)||d.blockers.length>24)return;
  const clean=(v,max=1000)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
  const make=(tag,cls,content)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(content!==undefined)el.textContent=clean(content,2000);
    return el;
  };
  const text=(id,value)=>{if($(id))$(id).textContent=String(value??'');};
  const symbol=(name)=>{
    const node=make('span','lime-ui-icon');
    const icons={
      evidence:'<circle cx="10.6" cy="10.6" r="6.2"/><path d="m15.4 15.4 5.1 5.1"/>',
      concern:'<circle cx="9" cy="8" r="3"/><path d="M3.8 19v-1.5a5.2 5.2 0 0 1 10.4 0V19"/><path d="M16 7.4a3 3 0 0 1 0 5.4M17.2 15a4.8 4.8 0 0 1 3 4"/>',
      improve:'<path d="M9 18h6M10 21h4"/><path d="M9.2 14.8c-1.3-1.1-2.1-2.8-2.1-4.6a4.9 4.9 0 0 1 9.8 0c0 1.8-.8 3.5-2.1 4.6-.8.6-1.2 1.4-1.2 2.2H10.4c0-.8-.4-1.6-1.2-2.2Z"/>',
      verify:'<path d="m5 12 4 4 10-10"/>',
      chevron:'<path d="m6 9 6 6 6-6"/>',
      copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'
    };
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','1.75');svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');svg.innerHTML=icons[name]||icons.verify;
    node.append(svg);return node;
  };
  const blockers=d.blockers.filter(v=>v&&typeof v==='object'&&typeof v.title==='string').slice(0,12);
  const strengths=Array.isArray(d.strengths)?d.strengths.filter(v=>v&&typeof v==='object'&&v.title).slice(0,6):[];
  const steps=blockers.filter(v=>typeof v.fix==='string'&&v.fix.trim()).slice(0,5);
  const product=report.mode==='product';
  const imported=sessionStorage.getItem('vylens:imported')==='1';

  document.body.classList.add('conversion-mode','lime-results-v5');
  if(imported)document.body.classList.add('imported-conversion-report');
  const nav=$('navActions');
  if(nav)nav.hidden=false;
  $('navDownload')?.addEventListener('click',()=>$('savePdf')?.click());
  $('navRecheck')?.addEventListener('click',()=>$('recheck')?.click());
  text('reportHeadline',product?'Digital Product Diagnosis':'Conversion Diagnosis');
  text('coverageMessage',product?
    'What the supplied product and available sales-page evidence can tell you—and what to improve.':
    'Here’s what may be stopping visitors from becoming customers, and how to improve it.');
  text('uiBlockerCount',blockers.length);
  text('uiStrengthCount',strengths.length);
  text('uiImprovementCount',steps.length);
  // No guessed scores; on a partial scan, surface this where users can see it.
  const c=report.coverage;
  if(c&&c.complete===false){
    const small=make('span','ui-partial-note','Partial scan · Results are limited to inspected pages');
    $('conversionReport')?.querySelector('.conversion-overview')?.insertAdjacentElement('afterend',small);
  }
  const level=item=>item.priority==='high'?'high':'review';
  const label=item=>item.priority==='high'?'High Priority':'Review Priority';
  function field(labelText,value,iconName,cls){
    if(!value)return null;
    const row=make('div','ui-evidence-row '+(cls||''));
    const icon=symbol(iconName);
    const heading=make('strong','ui-evidence-label',labelText);
    const explanation=make('p','ui-evidence-value',clean(value,850));
    row.append(icon,heading,explanation);
    return row;
  }
  const entries=[];
  function feature(item){
    const article=make('article','buyer-blocker featured ui-featured '+level(item));
    article.setAttribute('tabindex','-1');
    const topline=make('div','blocker-topline');
    const pill=make('span','ui-priority-pill '+level(item),label(item));
    const toggle=make('button','ui-feature-toggle');
    toggle.type='button';
    toggle.setAttribute('aria-label','Collapse main finding');
    toggle.setAttribute('aria-expanded','true');
    toggle.append(symbol('chevron'));
    topline.append(pill,toggle);
    const heading=make('h3','blocker-heading',item.title||'Potential buying concern');
    const lead=make('p','ui-feature-lead',item.evidence||'An observation from the inspected source.');
    const content=make('div','ui-feature-content');
    const rows=[
      field('Evidence',item.evidence,'evidence','evidence'),
      field('Possible buyer concern',item.buyerConcern,'concern','concern'),
      field('What to change',item.fix,'improve','fix')
    ];
    rows.filter(Boolean).forEach(el=>content.append(el));
    if(item.verify){
      const details=make('details','ui-verify');
      const summary=make('summary','', 'How to verify this change');
      summary.append(symbol('chevron'));
      details.append(summary,make('p','',item.verify));
      content.append(details);
    }
    const source=make('p','ui-feature-source',
      [item.location,item.source==='Initial public HTML'?'HTML source only':null].filter(Boolean).join(' · '));
    if(source.textContent)content.append(source);
    toggle.addEventListener('click',()=>{
      const closing=!content.hidden;
      content.hidden=closing;
      lead.hidden=closing;
      toggle.setAttribute('aria-expanded',String(!closing));
      toggle.setAttribute('aria-label',closing?'Expand main finding':'Collapse main finding');
      article.classList.toggle('ui-collapsed',closing);
    });
    article.append(topline,heading,lead,content);
    return article;
  }
  function compact(item,index){
    const card=make('details','buyer-blocker compact ui-compact '+level(item));
    const head=make('summary','blocker-summary');
    head.append(make('span','ui-priority-pill '+level(item),label(item)));
    head.append(make('strong','ui-compact-title',item.title||'Potential buying concern'));
    head.append(symbol('chevron'));
    const body=make('div','blocker-expanded');
    [field('Evidence',item.evidence,'evidence','evidence'),
      field('Possible buyer concern',item.buyerConcern,'concern','concern'),
      field('What to change',item.fix,'improve','fix'),
      field('How to verify',item.verify,'verify','verify')]
      .filter(Boolean).forEach(row=>body.append(row));
    if(item.location)body.append(make('p','ui-feature-source',item.location));
    card.append(head,body);
    card.addEventListener('toggle',()=>{
      if(!card.open)return;
      entries.forEach(other=>{if(other!==card)other.open=false;});
    });
    return card;
  }
  const primary=$('primaryBlocker'),secondary=$('secondaryBlockers');
  if(blockers.length&&primary&&secondary){
    const first=feature(blockers[0]);
    primary.replaceChildren(first);
    secondary.replaceChildren();
    blockers.slice(1).forEach((item,i)=>{
      const card=compact(item,i+1);
      entries.push(card);
      secondary.append(card);
    });
    const metadata=$('blockerMeta');
    if(metadata)metadata.textContent='';
  }
  // Existing no-finding copy from the conversion engine remains intact.
  // Side plan becomes a real navigation: tap step -> open that finding.
  const plan=$('conversionPlan');
  if(plan&&steps.length){
    plan.replaceChildren();
    steps.forEach((item,i)=>{
      const button=make('button','plan-row ui-plan-row');
      button.type='button';
      button.setAttribute('aria-label','Review action '+(i+1)+': '+clean(item.title,130));
      button.append(make('span','plan-number',String(i+1)));
      const copy=make('span','plan-copy');
      const title=clean(item.fix,190).replace(/\.\s.*$/,'').trim();
      copy.append(make('strong','',title||item.title));
      button.append(copy,symbol('chevron'));
      button.addEventListener('click',()=>{
        const index=blockers.indexOf(item);
        const selected=index===0?primary?.querySelector('.ui-featured'):entries[index-1];
        if(!selected)return;
        if(index>0)selected.open=true;
        else{
          const content=selected.querySelector('.ui-feature-content');
          if(content?.hidden)selected.querySelector('.ui-feature-toggle')?.click();
        }
        selected.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
        const focusable=index===0?selected:selected.querySelector('summary');
        if(focusable?.focus)focusable.focus({preventScroll:true});
      });
      plan.append(button);
    });
  }
  const positive=$('conversionStrengths');
  if(positive&&strengths.length){
    positive.replaceChildren();
    strengths.forEach(item=>{
      const row=make('div','ui-strength-row');
      row.append(symbol('verify'),make('span','',clean(item.title,160)));
      const detail=clean(item.evidence,500);
      if(detail)row.title=detail;
      positive.append(row);
    });
    if($('strengthsSection'))$('strengthsSection').hidden=false;
  }
  const note=$('conversionReport')?.querySelector('.conversion-disclaimer');
  if(note){
    note.replaceChildren();
    note.append(symbol('evidence'));
    const copy=make('span','');
    copy.append(make('strong','','Note: '));
    copy.append(document.createTextNode(
      'These are potential blockers based on visible page or product-file evidence, not actual visitor behavior. Confirmed drop-offs require analytics or funnel data.'));
    note.append(copy);
  }
  // No fake preview screenshots or scores: the UI only represents supported scan data.
})();