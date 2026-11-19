/* VYLENS — Five-part buyer-first report.
 * One conclusion per section, observed evidence on demand, no fake customer data.
 * Renders only conversion v1; historical technical reports stay on their old renderer. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  let report;
  try { report=JSON.parse(sessionStorage.getItem('vylens:result')||'null'); } catch { return; }
  const data=report?.conversion;
  if(!data||data.version!==1||!Array.isArray(data.blockers)||data.blockers.length>24||
    !Array.isArray(data.journey)||!['website','product'].includes(report.mode))return;

  const clean=(value,length=1800)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,length);
  const make=(tag,cls,copy)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(copy!==undefined)el.textContent=clean(copy);
    return el;
  };
  const append=(el,...parts)=>{parts.filter(Boolean).forEach(p=>el.append(p));return el;};
  const level=item=>item.priority==='high'?'high':item.priority==='low'?'low':'medium';
  const shortLevel=type=>type==='high'?'High':type==='low'?'Low':'Review';
  const stageNames={clarity:'Messaging',value:'Offer & value',trust:'Buyer confidence',action:'Buying step'};
  const sorted=data.blockers.filter(item=>item&&typeof item==='object'&&typeof item.title==='string')
    .slice(0,12).sort((a,b)=>({high:0,review:1,medium:1,low:2}[a.priority]??1)-
      ({high:0,review:1,medium:1,low:2}[b.priority]??1));
  const buyers=sorted.filter(item=>item.source!=='Locally inspected product file');
  const changes=sorted.filter(item=>clean(item.fix).length).slice(0,8);
  const strengths=Array.isArray(data.strengths)?
    data.strengths.filter(item=>item&&typeof item==='object'&&item.title).slice(0,6):[];
  const counts={high:0,medium:0,low:0};
  buyers.forEach(item=>{counts[level(item)]++;});

  // Coarse editorial review of observed stages, not a measured conversion rate.
  // Never give a precise-looking score for file-only, source-only or one-stage coverage.
  const rendered=report.mode==='website'&&Number(data.renderedPages)>0;
  const scored=['clarity','value','trust','action'].map(stage=>{
    const flagged=buyers.filter(item=>item.stage===stage);
    const positive=strengths.some(item=>item.stage===stage);
    if(!rendered||(!flagged.length&&!positive))return null;
    return flagged.some(item=>level(item)==='high')?20:flagged.length?55:85;
  }).filter(x=>x!==null);
  const score=scored.length>=2?
    Math.round(scored.reduce((sum,n)=>sum+n,0)/scored.length/5)*5:null;
  const tone=score===null?'medium':score<50?'high':score<75?'medium':'low';

  // All mappings are cautious questions/suggested actions, never claims from real buyers.
  const issueKey=item=>{
    const t=clean(item.title,170).toLowerCase();
    if(t.includes('main buying action may appear late'))return 'cta-late';
    if(t.includes('purchase terms may be hard'))return 'purchase-terms';
    if(t.includes('headline is too generic'))return 'generic-headline';
    if(t.includes('unfinished headline'))return 'draft-headline';
    if(t.includes('visible action labels'))return 'vague-cta';
    if(t.includes('pricing is visible'))return 'pricing-next';
    if(t.includes('signup form'))return 'signup-fields';
    if(t.includes('may be unreachable'))return 'broken-buy-link';
    if(t.includes('delivered bundle contains no product files'))return 'empty-bundle';
    if(t.includes('delivered files are empty'))return 'empty-files';
    if(t.includes('links in the product do not have destinations'))return 'missing-links';
    if(t.includes('archive paths'))return 'unsafe-zip';
    if(t.includes('overwrite each other'))return 'duplicate-files';
    if(t.includes('getting-started instructions'))return 'no-start-guide';
    if(t.includes('unfinished draft text'))return 'unfinished-product';
    if(t.includes('sales-page source contains a draft'))return 'draft-sales-copy';
    return '';
  };
  const labels={
    'cta-late':{
      issue:'The purchase button may be difficult to find',
      question:'Where do I click to buy or sign up?',
      action:'Make the main buying action easy to find'},
    'purchase-terms':{
      issue:'Purchase conditions may not be easy to find',
      question:'What are the purchase and refund conditions?',
      action:'Make purchase conditions easy to check'},
    'generic-headline':{
      issue:'The headline may not explain the offer',
      question:'What does this product actually help me do?',
      action:'Explain the real product benefit in the headline'},
    'draft-headline':{
      issue:'The offer headline contains unfinished wording',
      question:'Is this offer ready to purchase?',
      action:'Replace unfinished headline text'},
    'vague-cta':{
      issue:'The next-step button could be clearer',
      question:'What happens if I click this button?',
      action:'Give the button a clear, accurate label'},
    'pricing-next':{
      issue:'The next step is unclear beside the price',
      question:'How do I buy at this price?',
      action:'Put a clear next step beside the price'},
    'signup-fields':{
      issue:'The signup form asks for many required fields',
      question:'Why is all this information needed to start?',
      action:'Check which signup fields are truly essential'},
    'broken-buy-link':{
      issue:'A buying-related destination may be unavailable',
      question:'Will the buying page actually open?',
      action:'Repair or update the buying link'},
    'empty-bundle':{action:'Include the promised product files in the download'},
    'empty-files':{action:'Replace empty delivered files with real content'},
    'missing-links':{action:'Repair missing links inside the product'},
    'unsafe-zip':{action:'Remove unsafe paths from the ZIP file'},
    'duplicate-files':{action:'Give product files unique names'},
    'no-start-guide':{action:'Add a short “Start here” guide for buyers'},
    'unfinished-product':{action:'Review unfinished text before delivery'},
    'draft-sales-copy':{
      issue:'The public sales-page source appears to contain a draft headline',
      question:'Is the product description finished?',
      action:'Check and replace unfinished sales-page wording'}
  };
  const plainTitle=item=>labels[issueKey(item)]?.issue||clean(item.title,155);
  const actionTitle=item=>labels[issueKey(item)]?.action||'Review this improvement';
  const buyerQuestion=item=>clean(item.buyerQuestion||labels[issueKey(item)]?.question||'',250);
  const location=item=>{
    const raw=clean(item.location,180);
    if(!raw)return '';
    return raw.replace(/^\/(?=\s*·|$)/,'Homepage').replace(/^\/pricing\b/i,'Pricing page')
      .replace(/^\/products?\b/i,'Product page').replace(/^\/offer\b/i,'Offer page')
      .replace(/\s*·\s*public page\b/ig,'').replace(/\s*·\s*h1\b/ig,' · Heading')
      .replace(/\s*·\s*first-screen actions\b/ig,' · Primary action')
      .replace(/\s*·\s*purchase action\b/ig,' · Purchase section')
      .replace(/\s*·\s*action buttons\b/ig,' · Buttons');
  };

  const root=make('section','five-report');
  root.id='fiveReport';
  root.setAttribute('aria-label','Five-part buying experience report');
  const original=byId('conversionReport');
  if(!original)return;
  document.body.classList.add('five-report-ui');
  if(byId('reportHeadline'))byId('reportHeadline').textContent='Your Conversion Report';
  if(byId('coverageMessage'))byId('coverageMessage').textContent=
    'A focused review of what visitors see before deciding to buy.';

  // 1. Score / overview
  const summary=make('section','five-score-card');
  summary.setAttribute('aria-label','Overall conversion score');
  const visual=make('div','five-score-visual');
  const ring=make('div','five-score-ring');
  ring.style.setProperty('--five-value',score===null?'0':String(score));
  ring.style.setProperty('--five-rating-color',score===null?'#b8c0b5':
    tone==='high'?'#e34a58':tone==='medium'?'#f2ba36':'#83d52d');
  ring.setAttribute('role','img');
  ring.setAttribute('aria-label',score===null?
    'Not enough evidence to rate this public offer':'Offer evidence score '+score+' out of 100');
  const inner=append(make('span','five-score-inner'),
    make('strong','five-score-number',score===null?'—':String(score)),
    make('span','five-score-denominator',score===null?'Limited evidence':'/ 100'));
  ring.append(inner);visual.append(ring);
  const scoreCopy=make('div','five-score-copy');
  const verdict=make('span','five-verdict '+tone,score===null?'Not enough evidence':
    tone==='high'?'Needs attention':tone==='medium'?'Needs improvement':'Good signals found');
  const highText=counts.high===1?'1 urgent issue':counts.high+' urgent issues';
  const reviewText=counts.medium===1?'1 area to review':counts.medium+' areas to review';
  const assessment=score===null?
    (report.mode==='product'?'A product file alone cannot show why customers decide not to buy. A public sales page is needed for that assessment.':
      'Not enough verified buyer-facing signals were found to give a useful score.'):
    buyers.length?('We found '+[counts.high?highText:null,counts.medium?reviewText:null].filter(Boolean).join(' and ')+
      ' in the public offer. Start with the fixes below.'):
      'No specific buying obstacle was detected in the assessed areas. That does not establish real sales performance.';
  append(scoreCopy,make('h2','five-score-title','Overall Conversion Score'),
    verdict,make('p','five-score-description',assessment));
  const metrics=make('div','five-score-meta');
  function metric(type,label,symbol){
    const badge=make('span','five-counter '+type);
    append(badge,make('span','five-symbol',symbol),make('span','',label));
    return badge;
  }
  append(metrics,metric('high',counts.high+' High','×'),
    metric('medium',counts.medium+' Review','!'),
    metric('low',strengths.length+' Positive','✓'));
  scoreCopy.append(metrics);
  if(strengths.length){
    const details=make('details','five-positive-details');
    details.append(make('summary','','See '+strengths.length+' observed positive signal'+(strengths.length===1?'':'s')));
    const list=make('div','five-positive-list');
    strengths.forEach(signal=>{
      const article=make('div','five-positive-row');
      append(article,make('strong','',clean(signal.title,170)),
        make('p','',clean(signal.evidence,700)));
      list.append(article);
    });
    append(details,list);scoreCopy.append(details);
  }
  const scoreInfo=make('details','five-score-method');
  append(scoreInfo,make('summary','','What does this number mean?'),
    make('p','','A rough rating of visible offer signals across '+scored.length+
      ' of 4 buying-experience areas. It is not your actual conversion rate, a prediction of sales or a measurement of customer behavior.'));
  scoreCopy.append(scoreInfo);
  append(summary,visual,scoreCopy);root.append(summary);

  const grid1=make('div','five-grid'),grid2=make('div','five-grid');
  function panel(id,title,subtitle){
    const section=make('section','five-panel');
    section.id=id;
    append(section,make('h2','five-panel-title',title),make('p','five-panel-subtitle',subtitle));
    return section;
  }
  const blockersPanel=panel('five-blockers',"What's Stopping Buyers?",
    'Potential issues observed on the public offer. Tap one for evidence.');
  const hesitationsPanel=panel('five-hesitations','Why People Hesitate',
    'Possible buyer questions, not quotes or measured feedback.');
  const changesPanel=panel('five-changes','Exactly What to Change',
    'Clear next steps based on what was actually observed.');
  const planPanel=panel('five-action-plan','Your Priority Action Plan',
    'Start at step 1. Tap any step to see the full fix.');

  // 2. Buyer blockers: concise summary, full evidence only after interaction.
  function detailLine(parent,title,content){
    if(!clean(content))return;
    const p=make('p','five-detail-line');
    append(p,make('strong','',title),make('span','',clean(content,1200)));
    parent.append(p);
  }
  function blockerRow(item,i){
    const type=level(item),row=make('details','five-finding');
    const header=make('summary','five-finding-summary');
    const label=make('span','five-finding-label');
    append(label,make('strong','five-row-title',plainTitle(item)));
    if(location(item))label.append(make('small','five-location',location(item)));
    append(header,make('span','five-index '+type,String(i+1)),label,
      make('span','five-level '+type,shortLevel(type)),make('span','five-chevron','›'));
    const body=make('div','five-reveal');
    detailLine(body,'What we observed',item.evidence);
    detailLine(body,'How to confirm',item.verify);
    append(row,header,body);return row;
  }
  buyers.forEach((item,i)=>{
    const row=blockerRow(item,i);
    if(i>=3)row.hidden=true;
    blockersPanel.append(row);
  });
  if(!buyers.length)blockersPanel.append(make('p','five-empty',report.mode==='product'?
    'No public buying obstacle could be confirmed from the supplied file alone. Add its sales page to assess the pre-purchase offer.':
    'No specific buying blocker was observed. This is not proof that every visitor converts.'));
  if(buyers.length>3){
    const more=make('button','five-more','Show all '+buyers.length+' findings');
    more.type='button';more.setAttribute('aria-expanded','false');
    let expanded=false;
    more.addEventListener('click',()=>{
      expanded=!expanded;
      Array.from(blockersPanel.querySelectorAll('.five-finding')).slice(3).forEach(el=>{el.hidden=!expanded;});
      more.textContent=expanded?'Show fewer':'Show all '+buyers.length+' findings';
      more.setAttribute('aria-expanded',String(expanded));
    });
    blockersPanel.append(more);
  }

  // 3. Real buyer-voice questions, but clearly labeled as hypotheses.
  const seen=new Set();
  buyers.forEach(item=>{
    const question=buyerQuestion(item);
    if(!question||seen.has(question.toLowerCase())||seen.size>=4)return;
    seen.add(question.toLowerCase());
    const row=make('div','five-concern '+level(item));
    append(row,make('span','five-concern-icon','?'),make('p','',question));
    hesitationsPanel.append(row);
  });
  if(!seen.size)hesitationsPanel.append(make('p','five-empty',
    'There is not enough public evidence to suggest a specific buyer question.'));

  // 4. Exactly what to change: one action per issue, full evidence in expandable details.
  function changeRow(item,i){
    const type=level(item);
    const row=make('details','five-change');row.id='five-change-'+i;
    const head=make('summary','five-change-head');
    const copy=make('span','five-change-content');
    const action=make('span','five-action-note');
    if(clean(item.copyFrom)&&clean(item.copyTo)){
      const before=make('span','five-actual-copy');
      append(before,make('strong','','Current'),make('span','',clean(item.copyFrom,220)));
      const after=make('span','five-proposed-copy');
      append(after,make('strong','','Suggested'),make('span','',clean(item.copyTo,220)));
      append(action,before,after);
    }else{
      append(action,make('strong','','Do this'),make('span','',clean(item.fix,850)));
    }
    append(copy,make('strong','five-change-title',actionTitle(item)),action);
    append(head,make('span','five-index '+type,String(i+1)),copy,make('span','five-chevron','›'));
    const details=make('div','five-change-details');
    detailLine(details,'Why this came up',item.evidence);
    if(location(item))detailLine(details,'Where to look',location(item));
    detailLine(details,'How to check the result',item.verify);
    if(clean(item.fix)){
      const button=make('button','five-copy-btn',item.copyTo?'Copy suggested wording':'Copy this action');
      button.type='button';
      button.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(clean(item.copyTo||item.fix,950));
          button.textContent='Copied';
        }catch{button.textContent='Copy unavailable';}
      });
      details.append(button);
    }
    append(row,head,details);
    return row;
  }
  changes.forEach((item,i)=>changesPanel.append(changeRow(item,i)));
  if(!changes.length)changesPanel.append(make('p','five-empty',
    'No change is recommended without stronger evidence.'));

  // 5. The action plan is a navigation checklist, not another copy of findings.
  changes.forEach((item,i)=>{
    const type=level(item);
    const button=make('button','five-plan-row');button.type='button';
    button.setAttribute('aria-label','Open step '+(i+1)+': '+actionTitle(item));
    const contents=make('span','five-plan-text');
    append(contents,make('strong','',actionTitle(item)),
      make('small','', (stageNames[item.stage]||'Product review')+' · View instructions'));
    append(button,make('span','five-index '+type,String(i+1)),contents,
      make('span','five-plan-arrow','›'));
    button.addEventListener('click',()=>{
      const target=byId('five-change-'+i);
      if(!target)return;
      target.open=true;
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
      target.querySelector('summary')?.focus({preventScroll:true});
    });
    planPanel.append(button);
  });
  if(!changes.length)planPanel.append(make('p','five-empty',
    'Review the available source evidence before making changes.'));

  append(grid1,blockersPanel,hesitationsPanel);
  append(grid2,changesPanel,planPanel);
  append(root,grid1,grid2);
  root.append(make('p','five-disclaimer',
    'These findings are evidence-based possibilities, not measured lost sales. Validate changes with real buyers or analytics where available.'));
  original.insertAdjacentElement('beforebegin',root);
  const download=byId('navDownload');
  if(download){
    download.setAttribute('title','Print or save this report as PDF');
    download.setAttribute('aria-label','Print or save report as PDF');
    const span=download.querySelector('span');
    if(span)span.textContent='Save PDF';
  }
  root.append(make('p','five-pdf-help',
    'To save a PDF, tap Save PDF and choose “Save as PDF” in the print dialog.'));
})();

// Export every finding, including collapsed evidence, then restore the reading view.
(() => {
  'use strict';
  window.addEventListener('beforeprint',()=>{
    if(!document.body.classList.contains('five-report-ui'))return;
    const report=document.getElementById('fiveReport');
    if(!report)return;
    report.querySelectorAll('details').forEach(el=>{
      if(el.hidden){el.dataset.fivePrintUnhidden='true';el.hidden=false;}
      if(!el.open){el.dataset.fivePrintOpened='true';el.open=true;}
    });
  });
  window.addEventListener('afterprint',()=>{
    const report=document.getElementById('fiveReport');
    if(!report)return;
    report.querySelectorAll('details[data-five-print-opened]').forEach(el=>{
      el.open=false;delete el.dataset.fivePrintOpened;
    });
    report.querySelectorAll('details[data-five-print-unhidden]').forEach(el=>{
      el.hidden=true;delete el.dataset.fivePrintUnhidden;
    });
  });
})();
