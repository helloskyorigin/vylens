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
    .slice(0,20).sort((a,b)=>({high:0,review:1,medium:1,low:2}[a.priority]??1)-
      ({high:0,review:1,medium:1,low:2}[b.priority]??1));
  const buyers=sorted.filter(item=>item.source!=='Locally inspected product file');
  const problemItems=report.mode==='product'?sorted:buyers;
  // Use the same evidence-backed issue collection for cards, counts and fixes.
  const primaryFindings=problemItems;
  const changes=primaryFindings.filter(item=>clean(item.fix).length).slice(0,12);
  const strengths=Array.isArray(data.strengths)?
    data.strengths.filter(item=>item&&typeof item==='object'&&item.title).slice(0,6):[];
  const counts={high:0,medium:0,low:0};
  problemItems.forEach(item=>{counts[level(item)]++;});

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
    if(t.includes('placeholder destination'))return 'placeholder-checkout';
    if(t.includes('not detected in the mobile'))return 'mobile-no-cta';
    if(t.includes('difficult to find on mobile'))return 'mobile-late-cta';
    if(t.includes('visible desktop price')||t.includes('mobile page')&&t.includes('price'))return 'mobile-price';
    if(t.includes('price text differs'))return 'price-mismatch';
    if(t.includes('covered by another element'))return 'mobile-covered';
    if(t.includes('extends beyond the screen'))return 'mobile-clipped';
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
      action:'Make the main buying action easy to find',
      fix:'Check the actual purchase button on a phone and desktop. If it is hard to spot, put a clearly labeled buying button beside the main offer, linked to the same real destination.'},
    'purchase-terms':{
      issue:'Purchase conditions may not be easy to find',
      question:'What are the purchase and refund conditions?',
      action:'Make purchase conditions easy to check',
      fix:'Place a clear link to your real purchase, cancellation or refund conditions close to the payment button, where applicable. Do not add promises the business cannot honor.'},
    'generic-headline':{
      issue:'The headline may not explain the offer',
      question:'What does this product actually help me do?',
      action:'Explain the real product benefit in the headline',
      fix:'Rewrite the headline to say who the product helps and what real outcome it provides. Use only benefits you can support.'},
    'draft-headline':{
      issue:'The offer headline contains unfinished wording',
      question:'Is this offer ready to purchase?',
      action:'Replace unfinished headline text',
      fix:'Replace the visible draft text with the actual product name and a clear, truthful description of the offer.'},
    'vague-cta':{
      issue:'The next-step button could be clearer',
      question:'What happens if I click this button?',
      action:'Give the button a clear, accurate label',
      fix:'Rename the button to describe what it really opens, such as “View pricing” for a pricing page. Keep the destination unchanged.'},
    'pricing-next':{
      issue:'The next step is unclear beside the price',
      question:'How do I buy at this price?',
      action:'Put a clear next step beside the price',
      fix:'Check the live pricing page. If visitors cannot see how to continue, show a clearly labeled buying or signup action near the displayed price.'},
    'signup-fields':{
      issue:'The signup form asks for many required fields',
      question:'Why is all this information needed to start?',
      action:'Check which signup fields are truly essential',
      fix:'Review each required signup field. Keep the fields needed to get started, and ask for optional details later where possible.'},
    'broken-buy-link':{
      issue:'A buying-related destination may be unavailable',
      question:'Will the buying page actually open?',
      action:'Repair or update the buying link',
      fix:'Open the reported link. If it is broken, correct its destination or restore the purchase page, then verify it opens normally.'},
    'placeholder-checkout':{
      issue:'Buy button may not open checkout',
      question:'Does the buy button actually work?',
      action:'Check the purchase button destination',
      fix:'Tap the button. If it only scrolls to the top or does nothing, replace its placeholder link with the real purchase destination.'},
    'mobile-no-cta':{
      issue:'A buying action may be missing on phones',
      question:'Where do I buy on my phone?',
      action:'Make the buying button reachable on mobile',
      fix:'Compare the desktop and phone versions. If the purchase action is missing on phones, show a working button near the offer.'},
    'mobile-late-cta':{
      issue:'Buy button may be hard to find on phones',
      question:'Where is the buying button on my phone?',
      action:'Move the mobile purchase action closer to the offer',
      fix:'Open the site on a phone. If the main purchase button is buried below the first screen, bring it closer to the offer without obscuring essential details.'},
    'mobile-price':{
      issue:'Price may be missing on mobile',
      question:'How much does this cost on my phone?',
      action:'Make the price easy to find on phones',
      fix:'Check the phone layout and show the accurate offer price near the buying decision if it is currently hidden.'},
    'price-mismatch':{
      issue:'The same price may appear differently across devices',
      question:'Why do the desktop and phone prices look different?',
      action:'Verify desktop and mobile pricing',
      fix:'Open the same plan in the same currency on both devices. Make the intended current price clear and consistent.'},
    'mobile-covered':{
      issue:'Something may be covering the mobile buying button',
      question:'Why can’t I tap this buying button on my phone?',
      action:'Make the mobile buying button unobstructed',
      fix:'Check the buying button with menus and overlays visible. Move any overlapping sticky element so the button can be tapped.'},
    'mobile-clipped':{
      issue:'The buying button may be cut off on mobile',
      question:'Why does the buying button extend off my screen?',
      action:'Fit the entire purchase button inside mobile width',
      fix:'Adjust the mobile layout so the complete button and label fit at 390px and 320px widths.'},
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
  const readableFix=item=>labels[issueKey(item)]?.fix||clean(item.fix,850);
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
  ring.append(inner);
  const problems=make('div','five-problems-card');
  append(problems,make('span','five-problems-label',report.mode==='product'?'Product issues':'Problems found'),
    make('strong','five-problems-value',String(problemItems.length)));
  const breakdown=make('div','five-problems-breakdown');
  if(counts.high)breakdown.append(make('span','high',counts.high+' High'));
  if(counts.medium)breakdown.append(make('span','medium',counts.medium+' Review'));
  if(counts.low)breakdown.append(make('span','low',counts.low+' Low'));
  if(!problemItems.length)breakdown.append(make('span','positive','No reported issues'));
  problems.append(breakdown);
  append(visual,ring,problems);
  const scoreCopy=make('div','five-score-copy');
  const verdict=make('span','five-verdict '+tone,score===null?'Not enough evidence':
    tone==='high'?'Needs attention':tone==='medium'?'Needs improvement':'Good signals found');
  const assessment=score===null?
    (report.mode==='product'?
      'Product issues below come from file checks. A public sales page is needed to assess pre-purchase hesitation.':
      'Not enough verified buyer-facing signals were found to give a useful score.'):
    buyers.length?('Review the '+buyers.length+' potential buying issue'+(buyers.length===1?'':'s')+' below.'):
      'No specific buying obstacle was detected in the assessed areas. That does not establish real sales performance.';
  append(scoreCopy,make('h2','five-score-title','Overall Conversion Score'),
    verdict,make('p','five-score-description',assessment));
  const metrics=make('div','five-score-meta');
  function metric(type,label,symbol){
    const badge=make('span','five-counter '+type);
    append(badge,make('span','five-symbol',symbol),make('span','',label));
    return badge;
  }
  append(metrics,metric('low',strengths.length+' Positive','✓'));
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
  scoreCopy.append(make('p','five-score-footnote',
    score===null?'Not enough evidence for a score.':'Indicative only, not actual sales data.'));
  append(summary,visual,scoreCopy);root.append(summary);

  const grid1=make('div','five-grid'),grid2=make('div','five-grid');
  function panel(id,title,subtitle){
    const section=make('section','five-panel');
    section.id=id;
    append(section,make('h2','five-panel-title',title),make('p','five-panel-subtitle',subtitle));
    return section;
  }
  const blockersPanel=panel('five-blockers',report.mode==='product'?'What Needs Fixing?':"What's Stopping Buyers?",
    report.mode==='product'?'Observed product or sales-page issues. Tap for evidence.':
      'Potential issues on inspected public pages. Tap for evidence.');
  const hesitationsPanel=panel('five-hesitations',report.mode==='product'?'Questions Buyers May Have':'Why People Hesitate',
    report.mode==='product'?'Questions about the supplied product, not surveyed customer feedback.':
      'Potential buyer questions, not real customer interviews.');
  const changesPanel=panel('five-changes','Exactly What to Change',
    'Do these changes first.');
  const planPanel=panel('five-action-plan','Your Priority Action Plan',
    'Tap a step for its fix.');

  // Feature inside section 2: observed path, not a recording of an actual visitor.
  function drawBuyerReplay(info){
    if(!info||info.version!==1||!Array.isArray(info.desktop)||!Array.isArray(info.mobile))return null;
    const widget=make('div','five-replay');
    widget.id='fiveBuyerReplay';
    const top=make('div','five-replay-heading');
    const intro=make('div','five-replay-intro');
    append(intro,make('strong','','Buyer Journey Replay'),
      make('small','','Observed public steps · no visitor recording'));
    const switcher=make('div','five-replay-switch');
    switcher.setAttribute('role','group');
    switcher.setAttribute('aria-label','Choose view for the public buying path');
    const desktop=make('button','','Desktop');
    const mobile=make('button','','Mobile');
    desktop.type='button';mobile.type='button';
    append(switcher,mobile,desktop);
    append(top,intro,switcher);widget.append(top);
    const stepsEl=make('div','five-replay-steps');
    stepsEl.setAttribute('aria-live','polite');widget.append(stepsEl);
    const allowed=['observed','review','unknown'];
    const render=(mode)=>{
      mobile.setAttribute('aria-pressed',String(mode==='mobile'));
      desktop.setAttribute('aria-pressed',String(mode==='desktop'));
      stepsEl.replaceChildren();
      const steps=mode==='mobile'?info.mobile:info.desktop;
      steps.slice(0,4).forEach(s=>{
        const state=allowed.includes(s.status)?s.status:'unknown';
        const row=make('div','five-replay-step '+state);
        const marker=make('span','five-replay-marker',
          state==='observed'?'✓':state==='review'?'!':'?');
        const details=make('div','five-replay-copy');
        append(details,make('strong','',clean(s.title,90)),
          make('p','',clean(s.description,250)));
        if(s.place)details.append(make('small','',clean(s.place,120)));
        append(row,marker,details);stepsEl.append(row);
      });
    };
    mobile.addEventListener('click',()=>render('mobile'));
    desktop.addEventListener('click',()=>render('desktop'));
    render('mobile');
    return widget;
  }
  const replay=report.mode==='website'?drawBuyerReplay(data.buyerReplay):null;
  if(replay)blockersPanel.append(replay);

  // Feature inside section 4: source-backed copy and implementable checklists.
  // Never manufacture claims, prices, testimonials or FAQ answers.
  const rawKit=Array.isArray(data.fixKit)?data.fixKit:
    changes.map((item,i)=>({
      id:'fallback-'+i,kind:'checklist',label:'Fix checklist',
      title:'Action '+(i+1),content:clean(item.fix,850),
      source:clean(item.location||item.source,160),verify:clean(item.verify,450)
    }));
  const safeKit=rawKit.filter(item=>item&&typeof item.content==='string'&&
    item.content.trim()&&['copy','checklist'].includes(item.kind)).slice(0,20);
  if(safeKit.length){
    const kit=make('div','five-fix-kit');kit.id='fiveConversionFixKit';
    const header=make('div','five-kit-heading');
    const title=make('div','five-kit-title');
    const copyItems=safeKit.filter(item=>item.kind==='copy');
    const copyCount=copyItems.length;
    append(title,make('strong','','Conversion Fix Kit'),
      make('small','',copyCount?
        copyCount+' source-backed wording option'+(copyCount===1?'':'s')+
          ' · all '+safeKit.length+' fixes in Copy kit':
        'All '+safeKit.length+' actions ready to copy together'));
    const copyAll=make('button','five-kit-copy-all','Copy kit');
    copyAll.type='button';
    copyAll.setAttribute('aria-label','Copy complete conversion fix kit');
    const copyContent=()=>safeKit.map((asset,i)=>
      (i+1)+'. '+clean(asset.title,100)+'\n'+clean(asset.content,950)+
      (asset.verify?'\nVerify: '+clean(asset.verify,450):'')).join('\n\n');
    copyAll.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(copyContent());copyAll.textContent='Copied!';}
      catch{copyAll.textContent='Copy unavailable';}
    });
    append(header,title,copyAll);kit.append(header);
    const list=make('div','five-kit-list');
    // Do not duplicate checklists already shown in the detailed action rows.
    copyItems.forEach((asset,i)=>{
      const item=make('article','five-kit-item');
      if(i>=3)item.hidden=true;
      const meta=make('div','five-kit-meta');
      append(meta,make('span','five-kit-tag '+asset.kind,
        asset.kind==='copy'?'Ready to paste':'Fix checklist'),
        make('span','five-kit-asset-type',clean(asset.label||'',55)));
      const content=make('p','five-kit-content',clean(asset.content,1100));
      const foot=make('div','five-kit-footer');
      const source=make('small','',clean(asset.source||'',150));
      const copy=make('button','five-kit-copy','Copy');
      copy.type='button';
      copy.setAttribute('aria-label','Copy '+clean(asset.title||'fix',100));
      copy.addEventListener('click',async()=>{
        try{await navigator.clipboard.writeText(clean(asset.content,1100));copy.textContent='Copied!';}
        catch{copy.textContent='Copy unavailable';}
      });
      append(foot,source,copy);
      append(item,meta,content,foot);list.append(item);
    });
    if(copyCount)kit.append(list);
    if(copyItems.length>3){
      const show=make('button','five-kit-more','Show all '+copyItems.length+' wording options');
      show.type='button';show.setAttribute('aria-expanded','false');
      let expanded=false;
      show.addEventListener('click',()=>{
        expanded=!expanded;
        Array.from(list.children).slice(3).forEach(el=>{el.hidden=!expanded;});
        show.textContent=expanded?'Show fewer options':'Show all '+copyItems.length+' wording options';
        show.setAttribute('aria-expanded',String(expanded));
      });
      kit.append(show);
    }
    if(!copyCount)kit.append(make('p','five-kit-summary-note',
      'Copy the full fix checklist with one tap, or open the detailed actions above.'));
    changesPanel.append(kit);
  }

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
  primaryFindings.forEach((item,i)=>{
    const row=blockerRow(item,i);
    if(i>=3)row.hidden=true;
    blockersPanel.append(row);
  });
  if(!primaryFindings.length)blockersPanel.append(make('p','five-empty',report.mode==='product'?
    'No delivery issue was detected in the supported file checks. This does not verify buyer satisfaction.':
    'No specific buying blocker was observed. This is not proof that every visitor converts.'));
  if(primaryFindings.length>3){
    const more=make('button','five-more','Show all '+primaryFindings.length+' findings');
    more.type='button';more.setAttribute('aria-expanded','false');
    let expanded=false;
    more.addEventListener('click',()=>{
      expanded=!expanded;
      Array.from(blockersPanel.querySelectorAll('.five-finding')).slice(3).forEach(el=>{el.hidden=!expanded;});
      more.textContent=expanded?'Show fewer':'Show all '+primaryFindings.length+' findings';
      more.setAttribute('aria-expanded',String(expanded));
    });
    blockersPanel.append(more);
  }

  // 3. Real buyer-voice questions, but clearly labeled as hypotheses.
  const seen=new Set();
  const productQuestions={
    'empty-bundle':'Where are the files I expected to receive?',
    'empty-files':'Why are the downloaded files empty?',
    'missing-links':'How do I open the linked resources?',
    'unsafe-zip':'Is this download safe to extract?',
    'duplicate-files':'Will files overwrite each other when I unzip this?',
    'no-start-guide':'How do I get started with this product?',
    'unfinished-product':'Is this the finished product I purchased?'
  };
  primaryFindings.forEach(item=>{
    const question=report.mode==='product'&&item.source==='Locally inspected product file'?
      (productQuestions[issueKey(item)]||''):buyerQuestion(item);
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
    if(clean(item.copyTo)){
      append(action,make('strong','','Suggested button wording'),
        make('span','',clean(item.copyTo,220)));
    }else{
      append(action,make('strong','','Do this'),make('span','',readableFix(item)));
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
          await navigator.clipboard.writeText(clean(item.copyTo||readableFix(item),950));
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
    'Potential concerns, not measured lost sales. Verify improvements with real buyers.'));
  original.insertAdjacentElement('beforebegin',root);
  const download=byId('navDownload');
  if(download){
    download.setAttribute('title','Download PDF report');
    download.setAttribute('aria-label','Download PDF report');
    const span=download.querySelector('span');
    if(span)span.textContent='Save PDF';
  }
  const bottom=make('div','five-bottom-actions');
  const pdf=make('button','five-bottom-download','↓  Download PDF');
  pdf.id='fiveBottomDownload';pdf.type='button';
  const next=make('button','five-bottom-new','New Check');
  next.id='fiveBottomNew';next.type='button';
  next.addEventListener('click',()=>{
    try{sessionStorage.removeItem('vylens:pending');sessionStorage.removeItem('vylens:prefill-mode');}catch{}
    window.location.assign('./index.html#audit-tool');
  });
  append(bottom,pdf,next);root.append(bottom);
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
