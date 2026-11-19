(() => {
  'use strict';
  // Deliberately independent of the technical-report renderer. It enhances
  // verified v1 conversion reports; older saved technical reports stay readable.
  const $=id=>document.getElementById(id);
  const clean=(value,limit=1000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,limit);
  const element=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=clean(text,1800);
    return el;
  };
  const write=(id,text)=>{const el=$(id);if(el)el.textContent=clean(text,1800);};
  let report;
  try {report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');}catch{return;}
  const d=report?.conversion;
  if(!report||!['website','product'].includes(report.mode)||!d||d.version!==1||
    !Array.isArray(d.blockers)||d.blockers.length>24||!Array.isArray(d.journey))return;
  const stages={clarity:'Offer clarity',value:'Value & pricing',trust:'Buyer confidence',action:'Next step'};
  const validStage=s=>Object.prototype.hasOwnProperty.call(stages,s)?s:'clarity';
  const blockers=d.blockers.filter(item=>item&&typeof item==='object'&&typeof item.title==='string').slice(0,12);
  const strengths=Array.isArray(d.strengths)?d.strengths.filter(item=>item&&typeof item==='object').slice(0,6):[];
  const unverified=Array.isArray(d.unverified)?d.unverified.filter(x=>typeof x==='string').slice(0,12):[];
  const count=blockers.length;
  const product=report.mode==='product';
  $('conversionReport').hidden=false;
  $('technicalAppendix').hidden=false;
  const appendix=$('technicalAppendixContent');
  // Keep every original check and detail, but outside the buyer-facing flow.
  for(const id of ['findingsSection','checksPanel']){
    const el=$(id);if(el)appendix.append(el);
  }
  const originalMetrics=document.querySelector('.metrics-section');
  if(originalMetrics)appendix.prepend(originalMetrics);
  $('impactSection').hidden=true;
  write('heroState',sessionStorage.getItem('vylens:imported')==='1'?
    'IMPORTED REPORT · NOT A NEW SCAN':
    product?'DIGITAL PRODUCT · BUYER REVIEW':'CONVERSION BLOCKER REVIEW');
  const shallow=!Number(d.inspectedOfferPages)&&!Number(d.renderedPages);
  write('reportHeadline',count?
    (count===1?'1 potential buying blocker to review.':count+' potential buying blockers to review.'):
    shallow?'Not enough buying evidence to diagnose yet.':
    'No specific buying blockers detected in the inspected pages.');
  write('conversionKicker',product?'PRODUCT & OFFER EVIDENCE':'PUBLIC BUYING EXPERIENCE');
  write('conversionCount',count?count+' possible blocker'+(count===1?'':'s'):'No confirmed blocker');
  write('conversionTitle',product?
    'What your product evidence can tell you.':'Where buying friction may exist.');
  write('conversionIntro',count?
    'These are prioritized observations. Each one explains the evidence, possible buyer concern and next improvement.':
    product?'No clear buyer-facing blocker was identified by the supported file checks. The sales funnel may still have issues the file cannot reveal.':
      'No specific buyer-facing blocker was detected in the rendered pages available to this scan. This is not proof that visitors convert.');
  write('conversionGoal',product?
    (d.inspectedOfferPages?'Coverage: local file + initial public sales-page HTML.':
      'Coverage: delivered file only · No sales page or checkout evaluated.'):
    'Possible conversion goal: '+clean(d.goal||'Not established',105)+' · Inferred, not measured.');
  const limitations=unverified.length?unverified:[
    'Visitor sessions, actual sales and checkout completion were not measured.'
  ];
  write('limitationsCount',limitations.length+' limitations');
  limitations.forEach(note=>$('conversionUnverified').append(element('p','',note)));
  const stageCopy={attention:'Needs review',observed:'Evidence found',unverified:'Not verified'};
  const journeyOrder=['clarity','value','trust','action'];
  const reliableJourney=journeyOrder.map(id=>
    d.journey.find(stage=>stage&&typeof stage==='object'&&stage.id===id)||
    {id,label:stages[id],status:'unverified',detail:'Not assessed from the available evidence'});
  reliableJourney.forEach((stage,i)=>{
    const key=validStage(stage.id),state=['attention','observed'].includes(stage.status)?stage.status:'unverified';
    const card=element('div','journey-stage '+state);
    card.append(element('span','journey-index',String(i+1).padStart(2,'0')),
      element('strong','',clean(stage.label||stages[key],70)),
      element('span','journey-stage-state',stageCopy[state]));
    const detail=element('small','',stage.detail||'');
    if(detail.textContent)card.append(detail);
    $('buyerJourney').append(card);
  });
  const confidenceLabel=confidence=>confidence==='observed'?'Evidence observed':
    confidence==='source-only'?'Source-only finding':'Potential buyer concern';
  const fields=(card,item)=>{
    const parts=[
      ['WHAT WE OBSERVED',item.evidence,'evidence'],
      ['WHY A BUYER MIGHT HESITATE',item.buyerConcern,'concern'],
      ['WHAT TO IMPROVE',item.fix,'fix'],
      ['HOW TO VERIFY',item.verify,'verify']
    ];
    for(const [name,value,role] of parts){
      if(!value)continue;
      const section=element('div','blocker-field '+role);
      section.append(element('span','blocker-field-label',name),
        element('p','',clean(value,900)));
      card.append(section);
    }
    const footer=element('div','blocker-evidence-meta');
    if(item.location)footer.append(element('span','',clean(item.location,150)));
    footer.append(element('span','',confidenceLabel(item.confidence)));
    if(item.source)footer.append(element('span','',clean(item.source,80)));
    card.append(footer);
  };
  const copyBlocker=(item,button)=>{
    const lines=[item.title,'Stage: '+stages[validStage(item.stage)],
      item.location?'Location: '+item.location:null,
      item.evidence?'Observed: '+item.evidence:null,
      item.buyerConcern?'Possible buyer concern: '+item.buyerConcern:null,
      item.fix?'Fix: '+item.fix:null,
      item.verify?'Verify: '+item.verify:null]
      .filter(Boolean).join('\n');
    if(!navigator.clipboard?.writeText){button.textContent='Copy unavailable';return;}
    navigator.clipboard.writeText(lines).then(()=>{
      button.textContent='Copied';
    }).catch(()=>{button.textContent='Copy unavailable';});
  };
  const makeCard=(item,index,featured=false)=>{
    const card=element(featured?'article':'details','buyer-blocker '+(featured?'featured':'compact'));
    if(featured){
      const top=element('div','blocker-topline');
      top.append(element('span','blocker-stage',stages[validStage(item.stage)]),
        element('span','blocker-priority',item.priority==='high'?'Review first':'Worth reviewing'));
      card.append(top,element('h3','blocker-heading',item.title));
      fields(card,item);
      const copy=element('button','blocker-copy','Copy this fix');
      copy.type='button';copy.addEventListener('click',()=>copyBlocker(item,copy));
      card.append(copy);
    }else{
      const summary=element('summary','blocker-summary');
      const title=element('span','blocker-summary-title');
      title.append(element('small','',stages[validStage(item.stage)]),
        element('strong','',item.title));
      summary.append(element('span','blocker-number',String(index+1).padStart(2,'0')),
        title,element('span','blocker-open','Details'));
      card.append(summary);
      const body=element('div','blocker-expanded');
      fields(body,item);
      const copy=element('button','blocker-copy','Copy this fix');
      copy.type='button';copy.addEventListener('click',()=>copyBlocker(item,copy));
      body.append(copy);card.append(body);
    }
    return card;
  };
  if(count){
    $('primaryBlocker').append(makeCard(blockers[0],0,true));
    blockers.slice(1).forEach((item,index)=>$('secondaryBlockers').append(makeCard(item,index+1)));
    write('blockerMeta',count===1?'1 area to review':count+' areas to review');
  }else{
    const empty=element('div','blocker-empty');
    empty.append(element('strong','','No specific buyer blocker was verified.'),
      element('p','','That does not mean there are no sales problems. Compare this review with real visitor and checkout data before deciding what to change.'));
    $('primaryBlocker').append(empty);
    write('blockerMeta','No measured funnel data');
  }
  const list=$('conversionPlan');
  if(count){
    blockers.slice(0,5).forEach((item,index)=>{
      const row=element('div','plan-row');
      row.append(element('span','plan-number',String(index+1).padStart(2,'0')));
      const body=element('div','plan-copy');
      body.append(element('strong','',clean(item.fix||item.title,350)));
      body.append(element('small','',stages[validStage(item.stage)]+' · '+confidenceLabel(item.confidence)));
      row.append(body);
      list.append(row);
    });
    const button=$('copyPlan');button.hidden=false;
    button.addEventListener('click',()=>{
      const lines=['VYLENS — improvement plan','Subject: '+clean(report.subject||report.url,120),
        'Evidence-based recommendations, not measured lost sales.',...blockers.slice(0,5).map((item,i)=>
          '\n'+(i+1)+'. '+item.title+'\nEvidence: '+(item.evidence||'Not verified')+
          '\nFix: '+(item.fix||'Review evidence')+'\nVerify: '+(item.verify||'Test manually'))].join('\n');
      if(!navigator.clipboard?.writeText){button.textContent='Copy unavailable';return;}
      navigator.clipboard.writeText(lines).then(()=>{button.textContent='Plan copied';})
        .catch(()=>{button.textContent='Copy unavailable';});
    });
  }else{
    list.append(element('p','plan-empty',product?
      'To evaluate why people hesitate before buying, add the public sales page and price, then compare the findings with actual customer feedback.':
      'Review the conversion path with actual signup, checkout or analytics data. No changes are recommended without stronger evidence.'));
  }
  // Compare *detected evidence*, never claim that a missing issue was fixed.
  if(sessionStorage.getItem('vylens:imported')!=='1'){
    try{
      const previous=JSON.parse(sessionStorage.getItem('vylens:previous-conversion')||'null');
      const sourceKey=report.mode==='website'?
        (()=>{try{const u=new URL(report.url);return u.origin+u.pathname.replace(/\/$/,'');}catch{return '';}})():
        String(report.subject||'').trim().toLowerCase();
      if(previous?.mode===report.mode&&previous.sourceKey===sourceKey&&
        Array.isArray(previous.blockers)&&previous.blockers.length<=12){
        const key=item=>clean(item.stage,40).toLowerCase()+'|'+
          clean(item.title,155).toLowerCase()+'|'+clean(item.location,190).toLowerCase();
        const oldKeys=new Set(previous.blockers.filter(x=>x&&typeof x==='object').map(key));
        const currentKeys=new Set(blockers.map(key));
        const added=blockers.filter(x=>!oldKeys.has(key(x)));
        const continuing=blockers.filter(x=>oldKeys.has(key(x)));
        const missing=previous.blockers.filter(x=>x&&typeof x==='object'&&!currentKeys.has(key(x)));
        if(previous.blockers.length||blockers.length){
          $('scanComparison').hidden=false;
          for(const [number,label] of [
            [added.length,'Newly detected'],
            [continuing.length,'Still detected'],
            [missing.length,'Not detected now']
          ]){
            const stat=element('div','comparison-stat');
            stat.append(element('strong','',String(number)),element('span','',label));
            $('scanComparisonSummary').append(stat);
          }
          if(added.length){
            const section=element('div','comparison-changes');
            section.append(element('strong','','New or newly visible'));
            added.slice(0,4).forEach(item=>section.append(element('p','',item.title)));
            $('scanComparisonDetails').append(section);
          }
          if(missing.length){
            const section=element('div','comparison-changes');
            section.append(element('strong','','Not detected in this scan'));
            missing.slice(0,4).forEach(item=>section.append(element('p','',item.title)));
            $('scanComparisonDetails').append(section);
          }
        }
      }
    }catch{/* No valid previous scan is available; keep comparison hidden. */}
  }
  if(strengths.length){
    $('strengthsSection').hidden=false;
    strengths.slice(0,4).forEach(item=>{
      const card=element('article','strength-item');
      card.append(element('strong','',item.title||'Observed detail'),
        element('p','',item.evidence||''),
        element('span','',item.location||''));
      $('conversionStrengths').append(card);
    });
  }
  // A printable conversion summary is inserted before the existing complete
  // technical appendix; old reports continue to print as before.
  const root=$('printAppendix');
  if(root){
    const printable=element('section','print-conversion');
    printable.append(element('h2','','Conversion & buyer-experience assessment'),
      element('p','','This review contains evidence-backed hypotheses, not proof of lost sales.'),
      element('p','','Possible goal: '+clean(d.goal||'Not verified',120)));
    printable.append(element('h3','','Potential buying blockers'));
    if(!count)printable.append(element('p','','No specific buyer-facing blocker verified by the supported evidence.'));
    blockers.forEach((item,i)=>{
      const part=element('section','print-buyer-blocker');
      part.append(element('h4','',(i+1)+'. '+item.title));
      for(const [label,val] of [['Stage',stages[validStage(item.stage)]],
        ['Observed evidence',item.evidence],['Possible buyer concern',item.buyerConcern],
        ['Recommended change',item.fix],['How to verify',item.verify],
        ['Location',item.location],['Evidence level',confidenceLabel(item.confidence)]])
        if(val)part.append(element('p','',label+': '+clean(val,850)));
      printable.append(part);
    });
    printable.append(element('h3','','Priority improvement plan'));
    if(!count)printable.append(element('p','','No unsupported fixes were recommended from the available evidence.'));
    blockers.slice(0,5).forEach((item,i)=>
      printable.append(element('p','',(i+1)+'. '+clean(item.fix||'Review the evidence.',700))));
    if(strengths.length){
      printable.append(element('h3','','Recorded positive observations'));
      strengths.slice(0,5).forEach(item=>
        printable.append(element('p','',clean(item.title||'',130)+' — '+clean(item.evidence||'',450))));
    }
    printable.append(element('h3','','Limitations and unverified areas'));
    limitations.forEach(note=>printable.append(element('p','',note)));
    root.prepend(printable);
  }
})();