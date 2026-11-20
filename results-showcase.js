/* VYLENS Results · reference-aligned, five-card presentation.
 * Frontend-only visual layer. Never changes scanner findings or conversion output.
 * Existing detailed report stays in DOM for the native PDF export. */
(() => {
  'use strict';
  const main=document.getElementById('main');
  if (!main || main.hidden || !document.getElementById('fiveReport')) return;
  let report;
  try { report=JSON.parse(sessionStorage.getItem('vylens:result')||'null'); }
  catch { return; }
  const data=report?.conversion;
  if (!data || data.version!==1 || !Array.isArray(data.blockers) ||
      !['website','product'].includes(report.mode) || document.getElementById('rvReport')) return;

  const clean=(v,max=600)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
  const make=(tag,cls,value)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(value!==undefined)e.textContent=clean(value,1800);
    return e;
  };
  const add=(parent,...children)=>{for(const el of children)if(el)parent.append(el);return parent;};
  const icons={
    arrow:'<path d="M20 12H4m7-7-7 7 7 7"/>',
    target:'<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m13 11 8-8m-5 0h5v5"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M2.5 20v-2.5A4.5 4.5 0 0 1 7 13h4a4.5 4.5 0 0 1 4.5 4.5V20M17 6a3 3 0 0 1 0 6m1.5 2c2.2.3 3.5 2 3.5 4v2"/>',
    lightning:'<path d="M13 2 5 13h6l-1 9 9-12h-6l0-8Z"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
    cart:'<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h2l3.4 12.5a2 2 0 0 0 2 1.5H20l2-10H5"/>',
    check:'<path d="m4.5 12 5 5 10-10"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
    play:'<path d="m7 4 14 8-14 8V4Z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    link:'<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    alert:'<path d="m12 3 10 17H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    chevron:'<path d="m7 10 5 5 5-5"/>'
  };
  const icon=(name,cls)=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg','svg');
    node.setAttribute('viewBox','0 0 24 24');
    node.setAttribute('aria-hidden','true');
    if(cls)node.setAttribute('class',cls);
    node.innerHTML=icons[name]||icons.check;
    return node;
  };
  const titleRow=(name,title,sub)=>{
    const row=make('div','rv-card-heading');
    add(row,add(make('span','rv-card-icon'),icon(name)),
      add(make('div','rv-card-title-group'),
        make('h2','',title),make('p','',sub)));
    return row;
  };
  const card=(name,title,sub,extra='')=>{
    const c=make('section','rv-card '+extra);
    c.setAttribute('aria-label',title);
    c.append(titleRow(name,title,sub));
    return c;
  };
  const rank=x=>x?.priority==='high'?0:x?.priority==='review'?1:2;
  const findings=data.blockers.filter(x=>x&&typeof x==='object'&&clean(x.title))
    .slice(0,20).sort((a,b)=>rank(a)-rank(b));
  const positives=Array.isArray(data.strengths)?data.strengths.filter(x=>x&&clean(x.title)):[];

  const result=make('section','rv-report');
  result.id='rvReport';
  result.setAttribute('aria-label','VYLENS buying experience results');

  // Reference header: back, source preview, product/page label and timestamp.
  const meta=make('div','rv-meta');
  const back=make('a','rv-back','Results');
  back.href='./index.html#audit-tool';
  back.prepend(icon('arrow'));
  const details=make('div','rv-source');
  const thumb=make('div','rv-preview');
  thumb.setAttribute('aria-hidden','true');
  add(thumb,make('div','rv-preview-top'),
    add(make('div','rv-preview-content'),
      make('span','rv-preview-title'),make('span','rv-preview-line'),
      make('span','rv-preview-tiles')));
  const sourceText=make('div','rv-source-text');
  const name=report.mode==='product'?'Digital Product Review':'Product Landing Page';
  sourceText.append(make('h1','',name));
  const rawUrl=clean(report.url,500),sub=make('div','rv-source-url');
  let safeUrl='';
  try{
    const u=new URL(rawUrl);
    if(['https:','http:'].includes(u.protocol))safeUrl=u.href;
  }catch{}
  if(safeUrl&&report.mode==='website'){
    const a=make('a','',rawUrl);
    a.href=safeUrl;a.target='_blank';a.rel='noopener noreferrer';a.append(icon('link'));
    sub.append(a);
  }else sub.append(make('span','',clean(report.subject||'Uploaded product',100)));
  sourceText.append(sub);
  details.append(thumb,sourceText);
  let when='Analyzed recently';
  const checked=Date.parse(report.checkedAt||'');
  if(Number.isFinite(checked)){
    const minutes=Math.max(0,Math.floor((Date.now()-checked)/60000));
    when=minutes<5?'Analyzed just now':minutes<60?'Analyzed '+minutes+'m ago':
      minutes<1440?'Analyzed '+Math.floor(minutes/60)+'h ago':
      'Analyzed '+new Date(checked).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  const stamp=add(make('span','rv-time'),icon('clock'),make('span','',when));
  add(meta,back,add(make('div','rv-meta-lower'),details,stamp));
  result.append(meta);

  // Summary is deliberately not a measured conversion rate; never manufacture a "62%".
  const coverage=report.coverage||{};
  const limited=report.mode==='website'&&
    (coverage.complete===false||Number(data.renderedPages)<1||Number(data.inspectedOfferPages)<1);
  const highCount=findings.filter(x=>x.priority==='high').length;
  const headingCount=findings.length;
  const feature=make('section','rv-overview'+(limited?' rv-overview-limited':''));
  const overviewLeft=make('div','rv-overview-left');
  const target=add(make('span','rv-overview-icon'),icon('target'));
  const copy=make('div','rv-overview-copy');
  const h2=make('h2');
  if(headingCount){
    h2.append(make('span','rv-accent',String(headingCount)));
    h2.append(document.createTextNode(' potential buying blocker'+(headingCount===1?'':'s')+' found'));
  }else h2.append(make('span','',limited?'Limited buying evidence collected':'No buying blockers confirmed'));
  const dek=make('p','',headingCount?
    'These concerns are drawn from observed public evidence. Review the highest-priority ones first.':
    limited?'The scan could not fully assess the buying journey. A clean result is not confirmed.':
    'No specific blocker was detected in the assessed areas. Real purchases were not tested.');
  copy.append(h2,dek);
  overviewLeft.append(target,copy);
  const score=make('div','rv-confidence');
  const ring=make('div','rv-confidence-ring');
  ring.setAttribute('role','img');
  ring.setAttribute('aria-label','Buying confidence not measured from public pages');
  ring.append(make('strong','','—'));
  const scoreText=make('div','rv-confidence-copy');
  add(scoreText,make('h3','','Buying Confidence'),
    make('span','rv-confidence-pill','Not measured'),
    make('p','',headingCount?
      'Potential buying barriers were observed. Actual buyer confidence needs customer evidence.':
      'Public-page scanning cannot establish how confident buyers feel.'));
  add(score,ring,scoreText);
  add(feature,overviewLeft,score);
  result.append(feature);

  const content=make('div','rv-content-grid');
  // Card 1: concerns, never invented reasons.
  const reasons=card('people','Why People Aren’t Buying',
    'Potential reasons for hesitation, based on the inspected offer.');
  const reasonList=make('div','rv-reasons');
  if(findings.length){
    findings.slice(0,3).forEach(item=>{
      const text=clean(item.buyerQuestion||item.buyerConcern||item.title,130);
      add(reasonList,add(make('div','rv-reason'),add(make('span','rv-check'),icon('check')),
        make('strong','',text)));
    });
  }else reasonList.append(add(make('div','rv-quiet-state'),
    make('strong','',limited?'Buyer hesitation not verified':'No clear hesitation identified'),
    make('p','',limited?
      'Important parts of the offer could not be assessed in this scan.':
      'The available page evidence did not establish a specific reason to hesitate.')));
  reasons.append(reasonList);

  // Card 2: top ranked blockers, each expanding in-place to grounded evidence/fixes.
  const risks=card('lightning','Biggest Sales Killers',
    'Highest-priority observed issues to review.');
  const riskList=make('div','rv-risk-list');
  if(findings.length){
    findings.slice(0,4).forEach((item,i)=>{
      const node=make('details','rv-risk');
      const row=make('summary','rv-risk-summary');
      add(row,make('span','rv-risk-number',String(i+1)),
        make('strong','rv-risk-name',clean(item.title,96)),
        make('span','rv-risk-priority '+(item.priority==='high'?'is-high':'is-review'),
          item.priority==='high'?'High':'Review'),
        icon('chevron','rv-risk-chevron'));
      node.append(row);
      const body=make('div','rv-risk-detail');
      for(const [label,value] of [
        ['Evidence',item.evidence],['Buyer concern',item.buyerConcern||item.buyerQuestion],
        ['What to change',item.fix],['How to verify',item.verify]]){
        if(clean(value))body.append(add(make('div','rv-risk-fact'),
          make('b','',label),make('p','',value)));
      }
      if(clean(item.location))body.append(make('small','',clean(item.location,110)));
      node.append(body);riskList.append(node);
    });
  }else riskList.append(add(make('div','rv-quiet-state'),
    make('strong','','No confirmed sales blockers'),
    make('p','',limited?'The current scan had incomplete buying-page evidence.':
      'No supported high-impact concern was found in the assessed pages.')));
  risks.append(riskList);

  // Card 3: show buyer needs tied to findings, or neutral review criteria.
  const needs=card('heart','What Buyers Actually Need',
    'What may help buyers feel ready to purchase.');
  const needList=make('div','rv-needs');
  const stageNeeds={
    clarity:'A clear, easy-to-understand offer',
    value:'A specific value proposition and clear pricing',
    trust:'Credible evidence and transparent terms',
    action:'An obvious, working next step'
  };
  const stageOrder=['clarity','value','trust','action'];
  const affected=[...new Set(findings.map(x=>x.stage).filter(x=>stageOrder.includes(x)))];
  const priorities=[...affected,...stageOrder.filter(x=>!affected.includes(x))].slice(0,4);
  priorities.forEach(stage=>{
    const affectedStage=affected.includes(stage);
    const row=add(make('div','rv-need'),add(make('span','rv-check'),icon('check')),
      make('span','',stageNeeds[stage]));
    if(affectedStage)row.append(make('span','rv-need-review','Review'));
    needList.append(row);
  });
  needs.append(needList);
  if(!findings.length)needs.append(make('p','rv-card-footnote',
    'General buying criteria to verify, not problems diagnosed by this scan.'));

  // Card 4: action directions separated into three visual columns.
  const actions=card('layers','What to Change, Remove & Improve',
    'Simple, evidence-led recommendations you can act on.','rv-change-card');
  const actionGrid=make('div','rv-change-grid');
  const categorized={
    Change:findings.filter(x=>/clarity|value|action/.test(x.stage||'')&&!/placeholder|draft|unfinished|remove/i.test(x.title||'')),
    Remove:findings.filter(x=>/placeholder|draft|unfinished|unnecessary|duplicate|vague|remove/i.test((x.title||'')+' '+(x.fix||''))),
    Improve:findings.filter(x=>x.stage==='trust'||/improve|support|evidence/i.test((x.title||'')+' '+(x.fix||'')))
  };
  // Do not duplicate the same item across three action buckets.
  const assigned=new Set();
  for(const [type,cls] of [['Change','change'],['Remove','remove'],['Improve','improve']]){
    const col=make('section','rv-change-col');
    const strip=add(make('h3','rv-change-strip rv-'+cls),
      icon(type==='Change'?'layers':type==='Remove'?'alert':'target'),make('span','',type));
    col.append(strip);
    const list=make('ul','rv-change-list');
    const choices=categorized[type].filter(x=>!assigned.has(x)).slice(0,2);
    choices.forEach(x=>{
      assigned.add(x);
      list.append(make('li','',clean(x.fix||x.title,176)));
    });
    if(!choices.length)list.append(make('li','rv-change-none',
      type==='Remove'?'No removal supported by the scan.':
      type==='Improve'?'No additional improvement verified.':'No change supported by the scan.'));
    col.append(list);
    actionGrid.append(col);
  }
  actions.append(actionGrid);

  // Card 5: cautious skeptical-buyer test: observed concerns, not simulated purchases.
  const test=card('cart','Purchase Decision Test',
    'Would a skeptical buyer purchase based on the page today?','rv-decision-card');
  const decision=make('div','rv-decision-banner'+(findings.length?'':' rv-decision-neutral'));
  add(decision,icon(findings.length?'alert':'clock'),
    make('strong','',findings.length?'Potential hesitation before buying':'Purchase decision unverified'));
  const issueLead=findings.slice(0,2).map(x=>clean(x.title,80).toLowerCase()).join(' and ');
  const explanation=make('p','rv-decision-copy',findings.length?
    'A skeptical buyer might pause over '+issueLead+'. These are evidence-based possibilities, not recorded customer behavior.':
    'The available inspection did not verify real buyer hesitation or checkout success. A genuine purchase test would require additional evidence.');
  test.append(decision,explanation);

  content.append(reasons,risks,needs,actions,test);
  result.append(content);

  const footer=make('div','rv-actions');
  const download=add(make('button','rv-primary'),icon('download'),
    add(make('span',''),make('strong','','Download PDF'),
      make('small','','Get the full conversion report')));
  download.id='rvDownload';download.type='button';
  download.addEventListener('click',()=>{
    if(window.VylensPdfDownload?.save)window.VylensPdfDownload.save();
    else document.getElementById('navDownload')?.click();
  });
  const newCheck=add(make('button','rv-secondary'),icon('play'),
    add(make('span',''),make('strong','','Run New Check'),
      make('small','','Analyze another page or product')));
  newCheck.type='button';
  newCheck.id='rvNewCheck';
  newCheck.addEventListener('click',()=>{
    try{
      sessionStorage.removeItem('vylens:pending');
      sessionStorage.removeItem('vylens:prefill-mode');
    }catch{}
    window.location.assign('./index.html#audit-tool');
  });
  footer.append(download,newCheck);
  result.append(footer);

  main.prepend(result);
  document.body.classList.add('rv-ui');
})();
