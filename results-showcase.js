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
    forward:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
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
  // Backend supplies an independently evaluated five-card decision model.
  // Local product audits and saved reports can use the existing findings safely.
  const intelligence=data.buyerIntelligence?.version===1?data.buyerIntelligence:null;
  const overview=intelligence?.overview||null;
  const depth=overview?.observed||null;
  const buyerView=(item)=>{
    const title=clean(item.heading||item.title,190).toLowerCase();
    const concern=clean(item.buyerQuestion||item.concern||item.buyerConcern,180);
    if(/mobile.*(?:buy|purchase|cta|button)|(?:buy|purchase|cta|button).*mobile|extends beyond|off.screen|clipped.*button/i.test(title))
      return {hesitation:'Phone visitors may struggle to reach the buy button',
        need:'A fully visible, tappable purchase button on mobile',
        question:'Can I actually use the buy button on my phone?'};
    if(/(?:low|poor) contrast|readab|hard to read/i.test(title))
      return {hesitation:'Important offer details may be difficult to read',
        need:'Clear, readable pricing and offer text',
        question:'Can I read the details before deciding?'};
    if(/pric|payment term|refund|cancell|billing/i.test(title))
      return {hesitation:'The price or buying terms may raise questions',
        need:'Clear prices and purchase conditions',
        question:'Do I understand exactly what I will pay?'};
    if(/trust|proof|testimonial|review|credib/i.test(title))
      return {hesitation:'Buyers may want more support for the offer claims',
        need:'Credible evidence that supports the offer',
        question:'What gives me a reason to trust this offer?'};
    if(/headlin|vague|offer.*unclear|value|benefit|description/i.test(title))
      return {hesitation:'The value of the offer may not be clear enough',
        need:'A clear outcome and value proposition',
        question:'What exactly will I get from this offer?'};
    if(/action|cta|link|button|next step|checkout|navigation/i.test(title))
      return {hesitation:'The next step may be unclear or hard to follow',
        need:'An obvious, usable next step',
        question:'Can I easily find how to get started?'};
    return {hesitation:concern&&concern.length<=115?concern:
        'A buyer may hesitate at this part of the offer',
      need:clean(item.fix,100)||'A clearer buying experience',
      question:'Can I complete the next step with confidence?'};
  };
  const issueKey=item=>clean(item.findingId||item.id||item.fingerprint||
    [item.stage,item.title,item.location].join('|'),230).toLowerCase();
  // Connect separate sections to the *same* inspected finding.
  // This avoids five unrelated cards and preserves the underlying evidence.
  const riskNodes=[];
  let revealAllRisks=null;
  const openFinding=(key,index=0)=>{
    const chosen=riskNodes.find(x=>key&&x.key===key)||riskNodes[index]||riskNodes[0];
    if(!chosen)return;
    if(chosen.node.hidden&&revealAllRisks)revealAllRisks(true);
    for(const x of riskNodes)if(x!==chosen)x.node.open=false;
    chosen.node.open=true;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    chosen.node.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
    chosen.node.querySelector('summary')?.focus({preventScroll:true});
  };
  const jump=(label,key,index=0)=>{
    const control=make('button','rv-jump');
    control.type='button';
    control.append(make('span','',label),icon('forward'));
    control.addEventListener('click',()=>openFinding(key,index));
    return control;
  };

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
  const name=report.mode==='product'?'Digital Product Review':
    clean(depth?.examples?.find(x=>x.headline)?.headline||report.pageTitle||'Website Conversion Review',75);
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
  const signalCount=depth?['visibleHeadings','visiblePrices','visibleProof','visibleNextSteps']
    .filter(k=>Number(depth[k])>0).length:null;
  const highCount=findings.filter(x=>x.priority==='high').length;
  const headingCount=findings.length;
  const feature=make('section','rv-overview'+(limited?' rv-overview-limited':''));
  const overviewLeft=make('div','rv-overview-left');
  const target=add(make('span','rv-overview-icon'),icon('target'));
  const copy=make('div','rv-overview-copy');
  const h2=make('h2');
  if(headingCount){
    h2.append(make('span','rv-accent',String(headingCount)));
    h2.append(document.createTextNode(' buying concern'+(headingCount===1?'':'s')+' to review'));
  }else h2.append(make('span','',limited?'Buying evidence is incomplete':'No specific blocker detected'));
  copy.append(h2);
  const dek=make('p','',headingCount?
    'Start with the highest-priority finding, then check the supporting evidence.':
    limited?'Some important parts of the public buying journey were not verified.':
    'Nothing specific was flagged in the areas assessed. Real purchases were not tested.');
  copy.append(dek);
  if(headingCount&&clean(findings[0]?.fix)){
    const priority=make('div','rv-first-action');
    add(priority,make('span','rv-first-label','START HERE'),
      make('strong','',clean(findings[0].fix,170)),
      jump('View top finding',issueKey(findings[0]),0));
    copy.append(priority);
  }
  overviewLeft.append(target,copy);
  const score=make('div','rv-confidence rv-evidence-summary');
  const scoreText=make('div','rv-confidence-copy');
  add(scoreText,make('span','rv-eyebrow'),
    make('h3','','What we could inspect'));
  scoreText.querySelector('.rv-eyebrow').textContent='PUBLIC PAGE SIGNALS';
  const coverageText=Number(depth?.commercialPages)>0&&signalCount!==null?
    signalCount+' of 4 areas detected':'Limited page evidence';
  scoreText.append(make('p','rv-confidence-count',coverageText));
  const signalGrid=make('div','rv-signal-grid');
  for(const [field,label] of [
    ['visibleHeadings','Offer'],['visiblePrices','Pricing'],
    ['visibleProof','Proof'],['visibleNextSteps','Next step']
  ]){
    const observed=Number(depth?.[field])>0;
    const tile=make('span','rv-signal '+(observed?'is-observed':'is-unverified'));
    add(tile,icon(observed?'check':'clock'),
      make('span','',label));
    tile.setAttribute('title',observed?label+' detected from rendered evidence':
      label+' was not verified in the scan');
    signalGrid.append(tile);
  }
  score.append(scoreText,signalGrid);
  score.append(make('p','rv-evidence-note',
    'Found means visible, not proven effective. Missing means unverified. This is not a measured conversion rate.'));
  add(feature,overviewLeft,score);
  result.append(feature);

  const content=make('div','rv-content-grid');
  // Card 1: concerns, never invented reasons.
  const reasons=card('people','Why Buyers May Hesitate',
    'What these findings could mean to a real buyer.');
  const reasonList=make('div','rv-reasons');
  if(findings.length){
    const reasonsData=Array.isArray(intelligence?.whyNotBuying)&&intelligence.whyNotBuying.length?
      intelligence.whyNotBuying:findings;
    reasonsData.slice(0,3).forEach((item,i)=>{
      const view=buyerView(item);
      const node=make('details','rv-reason rv-reason-detail');
      const summary=add(make('summary','rv-reason-head'),
        make('span','rv-concern-index',String(i+1)),
        make('strong','',view.hesitation),icon('chevron'));
      const body=make('div','rv-reason-body');
      body.append(make('b','','What a buyer might wonder'));
      body.append(make('p','',view.question));
      if(clean(item.evidence)){
        body.append(make('b','','Why this is flagged'));
        body.append(make('p','',item.evidence));
      }
      body.append(make('small','rv-hypothesis-note',
        'Possible hesitation, not observed customer behavior.'));
      body.append(jump('See evidence and fix',issueKey(item),i));
      node.append(summary,body);reasonList.append(node);
    });
  }else reasonList.append(add(make('div','rv-quiet-state'),
    make('strong','',limited?'Buyer hesitation not verified':'No clear hesitation identified'),
    make('p','',limited?
      'Important parts of the offer could not be assessed in this scan.':
      'The available page evidence did not establish a specific reason to hesitate.')));
  reasons.append(reasonList);

  // Card 2: top ranked blockers, each expanding in-place to grounded evidence/fixes.
  const risks=card('lightning','Top Buying Obstacles',
    'Potential problems spotted on inspected pages. Open one to see proof and a fix.');
  const riskList=make('div','rv-risk-list');
  if(findings.length){
    const killers=Array.isArray(intelligence?.biggestSalesKillers)&&intelligence.biggestSalesKillers.length?
      intelligence.biggestSalesKillers:findings;
    const seenRiskKeys=new Set();
    const allRiskItems=[...killers,...findings].filter(item=>{
      const key=issueKey(item);
      if(seenRiskKeys.has(key))return false;
      seenRiskKeys.add(key);return true;
    });
    allRiskItems.forEach((item,i)=>{
      const node=make('details','rv-risk');
      node.id='rv-finding-'+(i+1);
      if(i>=4)node.hidden=true;
      // Native named details guarantee that just one finding can stay open.
      // The click handler also covers browsers with older details support.
      node.setAttribute('name','rv-exclusive-findings');
      riskNodes.push({key:issueKey(item),node});
      node.addEventListener('toggle',()=>{
        if(node.open)for(const other of riskNodes)if(other.node!==node)other.node.open=false;
      });
      const row=make('summary','rv-risk-summary');
      row.addEventListener('click',()=>{
        for(const other of riskNodes)if(other.node!==node)other.node.open=false;
      });
      add(row,make('span','rv-risk-number',String(i+1)),
        make('strong','rv-risk-name',clean(item.title,96)),
        make('span','rv-risk-priority '+(item.priority==='high'?'is-high':
          item.priority==='low'?'is-low':'is-review'),
          item.priority==='high'?'High':item.priority==='low'?'Lower':'Review'),
        icon('chevron','rv-risk-chevron'));
      node.append(row);
      const body=make('div','rv-risk-detail');
      for(const [label,value] of [
        ['Evidence',item.evidence],['Buyer concern',item.buyerConcern||item.buyerQuestion||item.concern],
        ['What to change',item.fix],['How to verify',item.verify]]){
        if(clean(value))body.append(add(make('div','rv-risk-fact'),
          make('b','',label),make('p','',value)));
      }
      if(clean(item.location))body.append(make('span','rv-issue-location',
        'Affected: '+clean(item.location,110)));
      node.append(body);riskList.append(node);
    });
  }else riskList.append(add(make('div','rv-quiet-state'),
    make('strong','','No specific issue found'),
    make('p','',limited?'The current scan had incomplete buying-page evidence.':
      'No supported high-impact concern was found in the assessed pages.')));
  risks.append(riskList);
  if(riskNodes.length>4){
    const more=make('button','rv-show-all','Show all '+riskNodes.length+' findings');
    more.type='button';more.setAttribute('aria-expanded','false');
    const toggle=(expand)=>{
      riskNodes.slice(4).forEach(item=>{item.node.hidden=!expand;});
      more.textContent=expand?'Show top 4':'Show all '+riskNodes.length+' findings';
      more.setAttribute('aria-expanded',String(expand));
    };
    revealAllRisks=toggle;
    more.addEventListener('click',()=>toggle(more.getAttribute('aria-expanded')!=='true'));
    risks.append(more);
  }


  // Compact inspected-page replay inside card 2, not a recorded visitor session.
  const replayInfo=data.buyerReplay;
  if(report.mode==='website'&&replayInfo?.version===1&&
      Array.isArray(replayInfo.desktop)&&Array.isArray(replayInfo.mobile)){
    const replay=make('details','rv-inline-feature rv-journey');
    replay.id='rvJourneyReplay';
    const trigger=make('summary','rv-inline-trigger');
    add(trigger,icon('target'),make('strong','','Buyer Journey Replay'),
      make('small','','Compare inspected phone & desktop steps'),icon('chevron'));
    const body=make('div','rv-inline-content');
    const switcher=make('div','rv-view-switch');
    switcher.setAttribute('role','group');
    switcher.setAttribute('aria-label','Choose device for public buying steps');
    const phone=make('button','','Phone'),desktop=make('button','','Desktop');
    phone.type='button';desktop.type='button';
    add(switcher,phone,desktop);
    const steps=make('ol','rv-journey-steps');
    steps.setAttribute('aria-live','polite');
    const render=(device)=>{
      phone.setAttribute('aria-pressed',String(device==='mobile'));
      desktop.setAttribute('aria-pressed',String(device==='desktop'));
      steps.replaceChildren();
      const items=device==='mobile'?replayInfo.mobile:replayInfo.desktop;
      items.slice(0,4).forEach((item,i)=>{
        const state=['observed','review'].includes(item?.status)?item.status:'unverified';
        const li=make('li','rv-journey-item is-'+state);
        const point=make('span','rv-journey-dot',state==='observed'?'✓':state==='review'?'!':'?');
        const copy=make('span','rv-journey-copy');
        add(copy,make('strong','',clean(item.title||'Step '+(i+1),85)),
          make('span','',clean(item.description||'This step was not verified.',230)));
        add(li,point,copy);steps.append(li);
      });
    };
    phone.addEventListener('click',()=>render('mobile'));
    desktop.addEventListener('click',()=>render('desktop'));
    render('mobile');
    add(body,switcher,steps,make('p','rv-inline-note',
      'Public page observations only. No visitors recorded and no payment tested.'));
    replay.append(trigger,body);risks.append(replay);
  }

  // Card 3: show buyer needs tied to findings, or neutral review criteria.
  const needs=card('heart','What Buyers Need to See',
    'Buying details to review, based on available evidence—not customer interviews.');
  const needList=make('div','rv-needs');
  const stageNeeds={
    clarity:'A clear, easy-to-understand offer',
    value:'A specific value proposition and clear pricing',
    trust:'Credible evidence and transparent terms',
    action:'An obvious, working next step'
  };
  const stageOrder=['clarity','value','trust','action'];
  const affected=[...new Set(findings.map(x=>x.stage).filter(x=>stageOrder.includes(x)))];
  const needsData=Array.isArray(intelligence?.buyerNeeds)&&intelligence.buyerNeeds.length===4?
    intelligence.buyerNeeds:stageOrder.map(stage=>({
      stage,need:stageNeeds[stage],status:affected.includes(stage)?'review':
        positives.some(p=>p.stage===stage)?'observed':'unverified',
      why:affected.includes(stage)?'A relevant finding needs review.':
        'This stage was not established as effective from the available evidence.'
    }));
  const prioritizedNeeds=[
    ...needsData.filter(x=>x.status==='review'),
    ...needsData.filter(x=>x.status==='unverified'),
    ...needsData.filter(x=>x.status==='observed')
  ].slice(0,4);
  prioritizedNeeds.forEach(item=>{
    const state=['review','observed'].includes(item.status)?item.status:'unverified';
    const finding=findings.find(x=>x.stage===item.stage);
    const view=finding?buyerView(finding):null;
    const headline=state==='review'&&view?view.need:
      (stageNeeds[item.stage]||item.need);
    const row=make('details','rv-need rv-need-'+state);
    const summary=add(make('summary','rv-need-head'),
      add(make('span','rv-need-icon '+state),
        state==='observed'?icon('check'):make('span','',state==='review'?'!':'?')),
      make('strong','',headline),
      make('span','rv-need-review rv-need-status-'+state,
        state==='review'?'Needs review':state==='observed'?'Observed':'Not verified'));
    row.append(summary);
    const why=make('div','rv-need-detail');
    why.append(make('p','',item.why||'Evidence does not establish this buying criterion.'));
    if(clean(item.evidence))why.append(make('small','','Evidence: '+clean(item.evidence,260)));
    if(clean(item.fix))why.append(make('small','','Suggested change: '+clean(item.fix,260)));
    if(state==='review'&&finding&&
       (riskNodes.some(x=>x.key===issueKey(finding))||
        findings.indexOf(finding)<riskNodes.length))
      why.append(jump('View related issue',issueKey(finding),
        Math.max(0,findings.indexOf(finding))));
    row.append(why);needList.append(row);
  });
  needs.append(needList);
  if(!findings.length)needs.append(make('p','rv-card-footnote',
    'General buying criteria to verify, not problems diagnosed by this scan.'));

  // Card 4: action directions separated into three visual columns.
  const actions=card('layers','What to Change, Remove & Improve',
    'Simple, evidence-led recommendations you can act on.','rv-change-card');
  const actionGrid=make('div','rv-change-grid');
  const decisions=intelligence?.whatToChangeRemoveImprove;
  const categorized=decisions?{
    Change:Array.isArray(decisions.change)?decisions.change:[],
    Remove:Array.isArray(decisions.remove)?decisions.remove:[],
    Improve:Array.isArray(decisions.improve)?decisions.improve:[]
  }:{
    Change:findings.filter(x=>/clarity|value|action/.test(x.stage||'')&&!/placeholder|draft|unfinished|remove/i.test(x.title||'')),
    Remove:findings.filter(x=>/placeholder|draft|unfinished|unnecessary|duplicate|vague|remove/i.test((x.title||'')+' '+(x.fix||''))),
    Improve:findings.filter(x=>x.stage==='trust'||/improve|support|evidence/i.test((x.title||'')+' '+(x.fix||'')))
  };
  // Show only actionable groups. Empty Change/Remove/Improve columns are clutter.
  const assigned=new Set();
  for(const [type,cls] of [['Change','change'],['Remove','remove'],['Improve','improve']]){
    const choices=categorized[type].filter(x=>!assigned.has(issueKey(x))).slice(0,3);
    if(!choices.length)continue;
    const col=make('section','rv-change-col');
    const strip=add(make('h3','rv-change-strip rv-'+cls),
      icon(type==='Change'?'layers':type==='Remove'?'alert':'target'),
      make('span','',type));
    col.append(strip);
    const list=make('ol','rv-change-list');
    choices.forEach((x,i)=>{
      assigned.add(issueKey(x));
      const line=make('li','rv-change-item');
      const label=add(make('div','rv-action-title'),
        make('span','rv-action-number',String(i+1).padStart(2,'0')),
        make('strong','',clean(x.fix||x.title,180)));
      line.append(label);
      if(clean(x.evidence)||clean(x.verify)){
        const proof=make('details','rv-change-proof');
        const detail=make('div','rv-action-detail');
        if(clean(x.evidence))add(detail,make('b','','Evidence'),make('p','',x.evidence));
        if(clean(x.verify))add(detail,make('b','','Verify'),make('p','',x.verify));
        proof.append(make('summary','','View evidence & verification'),detail);
        line.append(proof);
      }
      if((clean(x.findingId)||clean(x.id))&&riskNodes.some(r=>r.key===issueKey(x))){
        line.append(jump('See original finding',issueKey(x),0));
      }
      list.append(line);
    });
    col.append(list);
    actionGrid.append(col);
  }
  if(!actionGrid.children.length){
    actionGrid.append(add(make('div','rv-quiet-state'),
      make('strong','','No evidence-backed edits recommended'),
      make('p','','A complete action plan needs a verified finding first.')));
  }
  actionGrid.classList.toggle('rv-change-single',actionGrid.children.length===1);
  actions.append(actionGrid);


  // Accessible, source-grounded fix kit inside card 4 (never another result card).
  const kitItems=Array.isArray(data.fixKit)?data.fixKit.filter(item=>
    item&&['copy','checklist'].includes(item.kind)&&
    typeof item.content==='string'&&item.content.trim()).slice(0,20):[];
  if(kitItems.length){
    const kit=make('details','rv-inline-feature rv-fix-kit');
    kit.id='rvConversionFixKit';
    const trigger=make('summary','rv-inline-trigger');
    add(trigger,icon('check'),make('strong','','Conversion Fix Kit'),
      make('small','','Copy '+kitItems.length+' suggested action'+(kitItems.length===1?'':'s')),
      icon('chevron'));
    const body=make('div','rv-inline-content');
    const copyAll=make('button','rv-copy-all','Copy all fixes');
    copyAll.type='button';
    const status=make('span','rv-copy-status');status.setAttribute('role','status');
    const allText=kitItems.map((item,i)=>
      (i+1)+'. '+clean(item.title||item.label||'Action',120)+'\n'+
      clean(item.content,850)+(item.verify?'\nCheck: '+clean(item.verify,400):'')).join('\n\n');
    copyAll.addEventListener('click',async()=>{
      try{
        if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(allText);
        status.textContent='Copied to clipboard';
      }catch{status.textContent='Copy blocked by browser. Use the PDF report instead.';}
    });
    const toolbar=make('div','rv-kit-toolbar');
    add(toolbar,copyAll,status);body.append(toolbar);
    const usable=kitItems.filter(item=>item.kind==='copy').slice(0,3);
    if(usable.length){
      const sample=make('div','rv-kit-samples');
      usable.forEach(item=>{
        const row=make('div','rv-kit-copyline');
        add(row,make('small','','Ready-to-use wording (review first)'),
          make('strong','',clean(item.content,300)));
        sample.append(row);
      });
      body.append(sample);
    }
    body.append(make('p','rv-inline-note',
      'Suggestions come from inspected evidence. Check accuracy before publishing; no invented claims.'));
    kit.append(trigger,body);actions.append(kit);
  }

  // Card 5: cautious skeptical-buyer test: observed concerns, not simulated purchases.
  const test=card('cart','Purchase Clarity Check',
    'One practical question to test with a potential buyer.','rv-decision-card');
  const decisionData=intelligence?.purchaseDecisionTest;
  const decision=make('div','rv-decision-banner'+(findings.length?'':' rv-decision-neutral'));
  add(decision,icon(findings.length?'alert':'clock'),
    make('strong','',findings.length?'A buyer may pause here':'Buyer decision not verified'));
  test.append(decision);
  if(findings.length){
    const concern=buyerView(findings[0]);
    const buyerQuestion=make('div','rv-test-question');
    buyerQuestion.append(make('span','rv-test-label','QUESTION TO VALIDATE'));
    buyerQuestion.append(make('strong','',concern.question));
    test.append(buyerQuestion);
    test.append(make('p','rv-decision-copy',
      'This is a possible hesitation based on inspected evidence, not a recorded buyer response.'));
  }else test.append(make('p','rv-decision-copy',
    'A completed purchase or real buyer response was not tested by the scan.'));
  const next=make('details','rv-test-next');
  const nextSummary=make('summary','','Try a quick buying-path check');
  const nextInstruction=clean(findings[0]?.verify||decisionData?.nextTest||
    'Ask someone unfamiliar with the offer to find its price and next step, without completing payment.',350);
  next.append(nextSummary,make('p','',nextInstruction));
  if(findings.length)next.append(jump('Inspect the reported issue',issueKey(findings[0]),0));
  test.append(next);

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
