/* VYLENS — five focused, evidence-grounded conversion report sections.
   Works alongside the existing audit/print flow; no synthetic testimonials,
   invented revenue or technical score is presented. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  let report;
  try{report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');}catch{return;}
  const data=report&&report.conversion;
  if(!data||data.version!==1||!Array.isArray(data.blockers)||data.blockers.length>24||
     !Array.isArray(data.journey)||!['website','product'].includes(report.mode))return;
  const clean=(value,length=900)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,length);
  const node=(tag,className,content)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(content!==undefined)el.textContent=clean(content,1400);
    return el;
  };
  const add=(parent,...children)=>{children.filter(Boolean).forEach(child=>parent.append(child));return parent;};
  const blockers=data.blockers.filter(b=>b&&typeof b==='object'&&typeof b.title==='string')
    .slice(0,12).sort((a,b)=>{
      const priority={high:0,review:1,medium:1,low:2};
      return (priority[a.priority]??1)-(priority[b.priority]??1);
    });
  const strengths=Array.isArray(data.strengths)?
    data.strengths.filter(s=>s&&typeof s==='object'&&s.title).slice(0,6):[];
  const level=blocker=>blocker.priority==='high'?'high':
    blocker.priority==='low'?'low':'medium';
  const count={high:0,medium:0,low:0};
  blockers.forEach(b=>count[level(b)]++);
  // Transparent editorial scoring rubric: only assess stages supported by rendered
  // public buyer-facing evidence. Never equate this with real conversion analytics.
  // Source-only sales pages, local product files and unverified stages are not graded.
  const renderedEvidence=Number(data.renderedPages)>0 && report.mode==='website';
  const stages=['clarity','value','trust','action'];
  const scoredStages=stages.map(stage=>{
    const items=blockers.filter(item=>item.stage===stage);
    const positives=strengths.filter(item=>item.stage===stage);
    if(!renderedEvidence||(!items.length&&!positives.length))return null;
    // 20 = observed high-priority blocker, 55 = review issue,
    // 85 = positive observation without detected blockers. Scores are
    // coarse, rounded indicators of inspected offer signals, not buyer intent.
    return items.some(item=>level(item)==='high')?20:
      items.length?55:85;
  }).filter(value=>value!==null);
  const score=scoredStages.length>=2?
    Math.round((scoredStages.reduce((sum,value)=>sum+value,0)/scoredStages.length)/5)*5:null;
  const tone=score===null?'medium':score>=75?'low':score>=50?'medium':'high';
  const stageNames={clarity:'Messaging',value:'Offer & value',trust:'Trust',action:'Next step'};
  document.body.classList.add('five-report-ui');
  if(byId('reportHeadline'))byId('reportHeadline').textContent='Your Conversion Report';
  if(byId('coverageMessage'))byId('coverageMessage').textContent=
    'A focused analysis of your offer, messaging, and buying experience.';
  const main=byId('main'),original=byId('conversionReport');
  if(!main||!original)return;
  const root=node('section','five-report');
  root.id='fiveReport';
  root.setAttribute('aria-label','Conversion report');
  const summary=node('section','five-score-card');
  summary.setAttribute('aria-label','Overall conversion score');
  const visual=node('div','five-score-visual');
  const ring=node('div','five-score-ring');
  // Ring colors represent the mix of recorded signals, *not* percentages of buyers.
  const signalTotal=count.high+count.medium+count.low+strengths.length;
  const redCut=signalTotal?100*count.high/signalTotal:0;
  const yellowCut=signalTotal?100*(count.high+count.medium)/signalTotal:0;
  const greenCut=signalTotal?100*(count.high+count.medium+count.low+strengths.length)/signalTotal:0;
  ring.style.setProperty('--red-cut',redCut.toFixed(2)+'%');
  ring.style.setProperty('--yellow-cut',yellowCut.toFixed(2)+'%');
  ring.style.setProperty('--green-cut',(score===null?'0':greenCut.toFixed(2))+'%');
  ring.setAttribute('role','img');
  ring.setAttribute('aria-label',score===null?
    'Offer score unavailable: insufficient buyer-facing evidence':
    'Offer evidence score '+score+' out of 100, based on '+scoredStages.length+' assessed stages');
  const number=node('strong','five-score-number',score===null?'—':score);
  const inner=add(node('span','five-score-inner'),number,
    node('span','five-score-denominator',score===null?'No score':'/ 100'));
  ring.append(inner);visual.append(ring);
  const summaryText=node('div','five-score-copy');
  const status=score===null?'Limited Evidence':
    tone==='low'?'Stronger Signals':tone==='high'?'Needs Attention':'Needs Improvement';
  const verdict=node('span','five-verdict '+tone,(tone==='high'?'! ':tone==='medium'?'△ ':'✓ ')+status);
  const description=score===null?
    (report.mode==='product'?
      'A product file alone cannot reveal why shoppers hesitate. A public sales page helps evaluate the buying offer.':
      'Not enough buyer-facing evidence was observed for a defensible score.'):
    blockers.length?
      'Review the most important observed offer signals before changing your messaging.':
      'No specific blocker was detected in the assessed stages; actual customer behavior remains unknown.';
  add(summaryText,node('h2','five-score-title','Overall Conversion Score'),
      verdict,node('p','five-score-description',description));
  const counters=node('div','five-score-meta');
  const counter=(cls,iconText,labelText)=>{
    const el=node('span','five-counter '+cls);
    add(el,node('span','',iconText),node('span','',labelText));return el;
  };
  add(counters,counter('high','✕',count.high+' High'),
    counter('medium','! ',count.medium+' Review'),
    counter('low','✓',strengths.length+' Positive'));
  add(summaryText,counters,
    node('p','five-caption',score===null?
      'Score withheld when evidence is limited; no sales or buyer behavior was measured.':
      'Coarse offer-evidence score: '+scoredStages.length+' of 4 stages assessed (20 high concern · 55 review · 85 observed). Not a conversion rate.'));
  add(summary,visual,summaryText);
  root.append(summary);

  const grid1=node('div','five-grid');
  const grid2=node('div','five-grid');
  function panel(title,subtitle,id){
    const section=node('section','five-panel');
    section.id=id;
    add(section,node('h2','five-panel-title',title),
      node('p','five-panel-subtitle',subtitle));
    return section;
  }
  const blockersPanel=panel('What’s Stopping Buyers?',
    'The most important potential obstacles to purchasing.','five-blockers');
  const concernsPanel=panel('Why People Hesitate',
    'Questions your buyer might have before deciding.','five-hesitations');
  const changesPanel=panel('Exactly What to Change',
    'Practical changes grounded in observed details.','five-changes');
  const planPanel=panel('Your Priority Action Plan',
    'Start with the most important improvement.','five-action-plan');

  const labelFor=type=>type==='high'?'High':type==='low'?'Low':'Medium';
  const reveal=(parent,heading,value)=>{
    if(!value)return;
    const p=node('p','');
    add(p,node('strong','',heading+': '),document.createTextNode(clean(value,900)));
    parent.append(p);
  };
  const renderIssue=(item,i)=>{
    const cls=level(item),details=node('details','five-finding');
    const head=node('summary','');
    add(head,node('span','five-index '+cls,String(i+1)),
      node('span','five-row-title',item.title),
      node('span','five-level '+cls,labelFor(cls)),
      node('span','five-chevron','›'));
    const body=node('div','five-reveal');
    reveal(body,'Observed',item.evidence);
    reveal(body,'Buyer concern',item.buyerConcern);
    reveal(body,'Location',item.location);
    reveal(body,'Suggested fix',item.fix);
    reveal(body,'Verify',item.verify);
    add(details,head,body);
    return details;
  };
  blockers.forEach((item,i)=>{
    const issue=renderIssue(item,i);
    if(i>=3)issue.hidden=true;
    blockersPanel.append(issue);
  });
  if(!blockers.length)blockersPanel.append(node('p','five-empty',
    'No specific blocker was verified. More offer evidence or real buyer feedback may be needed.'));
  if(blockers.length>3){
    const more=node('button','five-more','Show all '+blockers.length+' findings');
    more.type='button';more.setAttribute('aria-expanded','false');
    let expanded=false;
    more.addEventListener('click',()=>{
      expanded=!expanded;
      Array.from(blockersPanel.querySelectorAll('.five-finding')).slice(3)
        .forEach(el=>{el.hidden=!expanded;});
      more.textContent=expanded?'Show fewer':'Show all '+blockers.length+' findings';
      more.setAttribute('aria-expanded',String(expanded));
    });blockersPanel.append(more);
  }
  const seen=new Set();let hesitationCount=0;
  blockers.forEach(item=>{
    const question=clean(item.buyerConcern,280);
    if(!question||seen.has(question.toLowerCase())||hesitationCount>=4)return;
    seen.add(question.toLowerCase());hesitationCount++;
    const type=level(item);
    const row=node('div','five-concern '+type);
    add(row,node('span','five-concern-icon','?'),node('span','',question));
    concernsPanel.append(row);
  });
  if(!hesitationCount)concernsPanel.append(node('p','five-empty',
    'No specific buyer hesitation was supported by the available evidence.'));

  const actionable=blockers.filter(item=>clean(item.fix).length>0).slice(0,5);
  function makeChange(item,i){
    const cls=level(item),details=node('details','five-change');
    details.id='five-change-'+i;
    const head=node('summary','');
    const copy=node('div','five-change-content');
    copy.append(node('strong','five-change-title',
      item.copyFrom&&item.copyTo?'Suggested messaging update':item.title));
    const beforeAfter=node('div','five-before-after');
    const before=node('div','five-before');
    add(before,node('strong','',item.copyFrom?'Current':'Evidence'),
      node('span','',clean(item.copyFrom||item.evidence,170)||'Evidence not verified'));
    const after=node('div','five-after');
    add(after,node('strong','',item.copyTo?'Rewrite':'Action'),
      node('span','',clean(item.copyTo||item.fix,215)));
    add(beforeAfter,before,after);add(copy,beforeAfter);
    add(head,node('span','five-index '+cls,String(i+1)),copy,
      node('span','five-chevron','›'));
    const body=node('div','five-reveal');
    reveal(body,'Full observation',item.evidence);
    reveal(body,'What to change',item.fix);
    reveal(body,'How to verify',item.verify);
    if(item.fix){
      const button=node('button','five-copy-btn','Copy suggested fix');
      button.type='button';
      button.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(clean(item.fix,900));
          button.textContent='Copied';
        }catch{button.textContent='Copy unavailable';}
      });
      body.append(button);
    }
    add(details,head,body);
    return details;
  }
  actionable.forEach((item,i)=>changesPanel.append(makeChange(item,i)));
  if(!actionable.length)changesPanel.append(node('p','five-empty',
    'No reliable change can be recommended from the information reviewed.'));
  actionable.forEach((item,i)=>{
    const cls=level(item);
    const row=node('button','five-plan-row');
    row.type='button';
    row.setAttribute('aria-label','Open recommended fix '+(i+1));
    const copy=node('span','five-plan-text');
    add(copy,node('strong','',clean(item.title,120)),
      node('small','',(stageNames[item.stage]||'Offer review')+' · '+labelFor(cls)+' priority · Tap to view fix'));
    add(row,node('span','five-index '+cls,String(i+1)),copy,
      node('span','five-level '+cls,labelFor(cls)));
    row.addEventListener('click',()=>{
      const target=byId('five-change-'+i);
      if(!target)return;
      target.open=true;
      const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
      target.querySelector('summary')?.focus({preventScroll:true});
    });
    planPanel.append(row);
  });
  if(!actionable.length)planPanel.append(node('p','five-empty',
    'Review the offer or collect buyer feedback before prioritizing edits.'));
  add(grid1,blockersPanel,concernsPanel);
  add(grid2,changesPanel,planPanel);
  add(root,grid1,grid2);
  root.append(node('p','five-disclaimer',
    'VYLENS identifies evidence-backed possibilities, not measured conversion rates. '+
    'Verify recommendations before making claims or changing your offer.'));
  original.insertAdjacentElement('beforebegin',root);
  const navDownload=byId('navDownload');
  if(navDownload){
    const title=navDownload.querySelector('span');
    if(title)title.textContent='Download Report';
  }
})();
/* Expand evidence for the five-section PDF, then restore the interactive view. */
(() => {
  'use strict';
  window.addEventListener('beforeprint',()=>{
    if(!document.body.classList.contains('five-report-ui'))return;
    const report=document.getElementById('fiveReport');
    if(!report)return;
    report.querySelectorAll('details').forEach(d=>{
      if(d.hidden){d.dataset.fivePrintUnhidden='true';d.hidden=false;}
      if(!d.open){d.dataset.fivePrintOpened='true';d.open=true;}
    });
  });
  window.addEventListener('afterprint',()=>{
    const report=document.getElementById('fiveReport');
    if(!report)return;
    report.querySelectorAll('details[data-five-print-opened]').forEach(d=>{
      d.open=false;delete d.dataset.fivePrintOpened;
    });
    report.querySelectorAll('details[data-five-print-unhidden]').forEach(d=>{
      d.hidden=true;delete d.dataset.fivePrintUnhidden;
    });
  });
})();
