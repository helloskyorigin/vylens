/* VYLENS / Signal results — complete free report, simple evidence-based signals.
 * This is a presentation layer; all recorded results are visible without payment.
 * Never invent scores or claim to know why real visitors left. */
(() => {
  'use strict';
  const main = document.getElementById('main');
  if (!main || main.hidden || document.getElementById('signalReport')) return;
  let report;
  try { report = JSON.parse(sessionStorage.getItem('vylens:result') || 'null'); }
  catch { return; }
  const data = report && report.conversion;
  if (!data || data.version !== 1 || !Array.isArray(data.blockers) ||
      !['website','product'].includes(report.mode)) return;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const add = (parent, ...nodes) => {
    nodes.filter(Boolean).forEach(node => parent.append(node));
    return parent;
  };
  const tidy = (text, max = 220) => String(text ?? '').replace(/\s+/g,' ').trim().slice(0,max);
  const riskRank = issue => issue.priority === 'high' ? 0 : issue.priority === 'low' ? 2 : 1;
  const issues = data.blockers.filter(x => x && typeof x === 'object' && tidy(x.title))
    .slice(0, 120).sort((a,b) => riskRank(a) - riskRank(b));
  const uniqueIssues = [];
  const used = new Set();
  for (const issue of issues) {
    const id = tidy(issue.findingId || issue.id || issue.fingerprint ||
      [issue.stage,issue.title].join('|'),320).toLowerCase();
    if (used.has(id)) continue;
    used.add(id);
    uniqueIssues.push(issue);
  }
  const strengths = Array.isArray(data.strengths) ?
    data.strengths.filter(x => x && typeof x === 'object' && tidy(x.title)) : [];

  const stage = item => {
    const title = tidy([item.title,item.heading].join(' '),270).toLowerCase();
    if (/refund|return policy|cancel|purchase terms|billing|delivery|fulfil|fulfill|what happens after|privacy|payment terms|download access|buying conditions/i.test(title))
      return 'purchase';
    if (['clarity','value','trust','action'].includes(item.stage)) return item.stage;
    if (/price|value|benefit|offer worth|cost|expensive/.test(title)) return 'value';
    if (/trust|proof|review|testimonial|credib|guarantee|policy/.test(title)) return 'trust';
    if (/button|checkout|purchase link|buying action|next step|sign.?up|action label|tap/.test(title)) return 'action';
    if (/headlin|descrip|messag|unclear|audience/.test(title)) return 'clarity';
    return null;
  };
  const rendered = report.mode === 'website' && Number(data.renderedPages) > 0;
  // Preserve the conservative existing four-stage assessment; 20/55/85 are
  // editorial indicators from the same report, not recorded conversion rates.
  const originalStages = ['clarity','value','trust','action'].map(key => {
    const found = issues.filter(item => item.stage === key);
    const good = strengths.some(item => item.stage === key);
    if (!rendered || (!found.length && !good)) return null;
    return found.some(item => item.priority === 'high') ? 20 : found.length ? 55 : 85;
  });
  const overall = originalStages.every(v => v !== null) ?
    Math.round(originalStages.reduce((sum,n) => sum+n,0) / 4 / 5) * 5 : null;

  const modes = {
    clarity: {title:'Offer Clarity',
      warning:'New buyers may not quickly understand what this offer does for them.',
      good:'The page gives buyers a clearer idea of what is being offered.'},
    value: {title:'Value for Money',
      warning:'The benefits may not be clear enough to justify the asking price.',
      good:'Helpful details about the offer or its price were visible.'},
    trust: {title:'Buyer Trust',
      warning:'Buyers may need more proof or reassurance before they feel confident.',
      good:'Some helpful proof or trust information was visible.'},
    action: {title:'Buying Process',
      warning:'The next step to buy or sign up may be harder to find or use.',
      good:'The main next step looks easier to spot on the pages checked.'},
    purchase: {title:'Purchase Confidence',
      warning:'Buyers may have questions about terms, access or what happens after paying.',
      good:'Some purchase details were available to review.'}
  };
  const root = el('section','signal-report');
  root.id = 'signalReport';
  root.setAttribute('aria-label','Your VYLENS results');

  const strap = el('div','signal-topline');
  add(strap,el('span','signal-eyebrow','YOUR REPORT'),
    el('span','signal-top-mark',report.mode === 'website' ? 'Website Audit' : 'Digital Product Audit'));
  root.append(strap);
  const heading = el('h1','signal-title',"Your buyers' first impression.");
  root.append(heading);
  const subject = tidy(report.subject || report.url || 'Your offer',110);
  root.append(el('p','signal-subject',subject));

  const scoreBox = el('section','signal-score');
  const scoreTitle = el('div','signal-score-heading');
  add(scoreTitle,el('span','','OVERALL CONVERSION SCORE'),
    el('span','signal-score-type','Offer assessment'));
  scoreBox.append(scoreTitle);
  const scoreBody = el('div','signal-score-body');
  const scoreFigure = el('div','signal-score-number');
  add(scoreFigure,el('strong','',overall === null ? '—' : String(overall)),
    el('span','','/100'));
  const scoreText = el('div','signal-score-copy');
  const verdict = overall === null ? 'Not enough to score' :
    overall < 50 ? 'Your offer needs attention' :
    overall < 75 ? 'Some buying doubts need a closer look' : 'Promising signals found';
  add(scoreText,el('strong','',verdict),
    el('p','',overall === null ?
      (report.mode === 'product' ?
        'We checked your file, but a public sales page is needed to assess buying decisions.' :
        'We could not check enough of the offer to give a fair score.') :
      'A quick review of what buyers can see, not a measure of actual sales.'));
  add(scoreBody,scoreFigure,scoreText);
  scoreBox.append(scoreBody);
  root.append(scoreBox);

  const signals = el('section','signal-signals');
  add(signals,el('h2','','Your Buyer Signals'),
    el('p','signal-section-note','The strongest and weakest parts of your buying experience.'));
  const items = el('div','signal-items');
  const keys = ['clarity','value','trust','action','purchase'];
  for (const key of keys) {
    const matches = uniqueIssues.filter(x => stage(x) === key);
    const positive = strengths.some(x => stage(x) === key);
    const value = !rendered || (!matches.length && !positive) ? null :
      matches.some(x => x.priority === 'high') ? 20 : matches.length ? 55 : 85;
    const label = value === null ? 'Not checked' :
      value < 50 ? 'Weak' : value < 75 ? 'Needs work' : 'Looking good';
    const tone = value === null ? 'unknown' :
      value < 50 ? 'weak' : value < 75 ? 'review' : 'good';
    const description = value === null ?
      'We could not check this part properly, so no judgment was made.' :
      matches.length ? modes[key].warning : modes[key].good;
    const item = el('article','signal-item signal-'+tone);
    const top = el('div','signal-item-top');
    add(top,el('h3','',modes[key].title),
      add(el('div','signal-item-right'),
        el('span','signal-item-value',value === null ? '—' : String(value)),
        el('span','signal-status',label)));
    const bar = el('div','signal-bar');
    bar.setAttribute('role','img');
    bar.setAttribute('aria-label',modes[key].title + ': ' +
      (value === null ? 'Not checked' : 'Assessment '+value+' out of 100, '+label));
    const fill = el('span','signal-bar-fill');
    fill.style.width = (value === null ? 0 : value) + '%';
    bar.append(fill);
    add(item,top,bar,el('p','signal-item-note',description));
    items.append(item);
  }
  signals.append(items);
  root.append(signals);

  const reminder = el('p','signal-disclaimer',
    'These are possible buying concerns from what we could check, not recorded customer behavior.');
  root.append(reminder);

  // Full results are open while the purchase system is being refined.
  // A finding is described only once; other sections link back to its evidence.
  const section = (className,title,description) => {
    const node=el('section',className);
    add(node,el('h2','signal-full-heading',title),
      el('p','signal-section-note',description));
    return node;
  };
  const info = (parent,label,value) => {
    if (!tidy(value)) return;
    const item=el('div','signal-fact');
    add(item,el('strong','',label),el('p','',tidy(value,1200)));
    parent.append(item);
  };
  const priority = item => item.priority === 'high'?'High priority':
    item.priority === 'low'?'Low priority':'Review';
  const readLabel = item => tidy(item.title || item.heading || 'Possible issue',180);
  const findingRefs = [];
  const findings = section('signal-full-section signal-findings',
    report.mode === 'product'?'Problems Found in Your Product':"What's Stopping Buyers?",
    uniqueIssues.length?
      'All '+uniqueIssues.length+' recorded '+(uniqueIssues.length===1?'finding':'findings')+
      ', starting with the most important. Tap a finding to see the details.' :
      'No specific problem was found in the checks completed. This does not prove that every buyer will purchase.');
  findings.id='signalFindings';
  if (uniqueIssues.length) {
    const stack=el('div','signal-finding-list');
    uniqueIssues.forEach((item,index)=>{
      const row=el('details','signal-finding');
      row.id='signalFinding'+index;
      if(index===0) row.open=true;
      const head=el('summary','signal-finding-summary');
      const heading=el('span','signal-finding-name');
      add(heading,el('strong','',readLabel(item)),
        el('small','',priority(item)));
      add(head,el('span','signal-count',String(index+1).padStart(2,'0')),
        heading,el('span','signal-expand-icon','+'));
      const body=el('div','signal-finding-body');
      info(body,'What we found',item.evidence);
      info(body,'Where to look',item.location);
      info(body,'How to check it',item.verify);
      if (!body.children.length) body.append(el('p','signal-empty','No further details were recorded.'));
      row.append(head,body);
      stack.append(row);
      findingRefs.push(row);
    });
    findings.append(stack);
  } else {
    findings.append(el('p','signal-empty','Nothing specific was flagged in the areas checked.'));
  }
  root.append(findings);

  const questions = section('signal-full-section signal-questions',
    'Why People Might Hesitate',
    'Possible buyer questions suggested by the findings — not actual customer feedback.');
  const questionList=el('div','signal-question-list');
  const questionsSeen=new Set();
  uniqueIssues.forEach((item,index)=>{
    const question=tidy(item.buyerQuestion||item.buyerConcern||item.concern,260);
    if (!question || questionsSeen.has(question.toLowerCase())) return;
    questionsSeen.add(question.toLowerCase());
    const line=el('div','signal-question');
    add(line,el('span','signal-question-mark','?'),el('p','',question));
    const view=el('button','signal-text-link','See finding '+(index+1));
    view.type='button';
    view.addEventListener('click',()=>focusFinding(index));
    line.append(view);
    questionList.append(line);
  });
  if (!questionList.children.length)
    questionList.append(el('p','signal-empty',
      'We could not identify a specific buyer question from the available evidence.'));
  questions.append(questionList);
  root.append(questions);

  const focusFinding = index => {
    const target=findingRefs[index];
    if(!target)return;
    target.open=true;
    target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
      block:'center'});
    target.querySelector('summary')?.focus({preventScroll:true});
  };

  const changes = section('signal-full-section signal-changes',
    'Exactly What to Change',
    'Clear fixes for the problems found. You can copy each suggestion.');
  changes.id='signalChanges';
  const changeRefs=new Map();
  const changeList=el('div','signal-change-list');
  uniqueIssues.forEach((item,index)=>{
    const fix=tidy(item.fix,1300);
    if(!fix)return;
    const card=el('article','signal-change');
    card.id='signalChange'+index;
    card.tabIndex=-1;
    const head=el('div','signal-change-top');
    add(head,el('span','signal-count',String(index+1).padStart(2,'0')),
      el('strong','',readLabel(item)));
    const copy=el('button','signal-copy','Copy fix');
    copy.type='button';
    copy.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(fix);copy.textContent='Copied';}
      catch{copy.textContent='Select the text to copy';}
    });
    add(card,head,el('p','',fix),copy);
    changeList.append(card);
    changeRefs.set(index,card);
  });
  if(!changeList.children.length)
    changeList.append(el('p','signal-empty','No specific change can be recommended from these results.'));
  changes.append(changeList);

  // Only show ready-to-use wording actually produced from the inspection.
  const wording=Array.isArray(data.fixKit)?data.fixKit.filter(x=>x&&tidy(x.content)): [];
  const directCopy=uniqueIssues
    .filter(x=>tidy(x.copyTo))
    .map(x=>({title:readLabel(x),content:tidy(x.copyTo,1000),verify:x.verify||''}));
  const copyItems=[...wording,...directCopy];
  if(copyItems.length){
    const copyBox=el('div','signal-copy-kit');
    copyBox.append(el('h3','','Suggested Wording & Fix Kit'));
    copyBox.append(el('p','signal-section-note',
      'Suggestions based on the review. Check that the wording fits what you really offer.'));
    copyItems.forEach((item,i)=>{
      const c=el('div','signal-kit-item');
      add(c,el('strong','',tidy(item.title||item.label||'Suggested change',120)),
        el('p','',tidy(item.content,1200)));
      info(c,'How to verify',item.verify);
      const button=el('button','signal-copy','Copy');
      button.type='button';
      button.addEventListener('click',async()=>{
        try{await navigator.clipboard.writeText(tidy(item.content,1200));button.textContent='Copied';}
        catch{button.textContent='Select the text to copy';}
      });
      c.append(button);copyBox.append(c);
    });
    changes.append(copyBox);
  }
  root.append(changes);

  const plan = section('signal-full-section signal-action-plan',
    'Your Priority Action Plan',
    'Work through the highest-priority problems first. Each step opens its suggested fix.');
  const planList=el('ol','signal-plan-list');
  uniqueIssues.forEach((item,index)=>{
    if(!changeRefs.has(index))return;
    const li=el('li','');
    const step=el('button','signal-plan-step');
    step.type='button';
    add(step,el('span','signal-count',String(index+1).padStart(2,'0')),
      add(el('span','signal-plan-label'),el('strong','',readLabel(item)),
        el('small','',priority(item))),
      el('span','signal-plan-arrow','↗'));
    step.addEventListener('click',()=>{
      const target=changeRefs.get(index);
      target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
        block:'center'});
      target.focus({preventScroll:true});
    });
    li.append(step);planList.append(li);
  });
  if(!planList.children.length)
    planList.append(el('li','signal-empty','Review the available information before making changes.'));
  plan.append(planList);
  root.append(plan);

  if(strengths.length){
    const strengthsSection=section('signal-full-section signal-strengths',
      "What's Already Working",
      'Positive things noticed during the checks — not proof of conversion success.');
    const strengthsList=el('div','signal-strength-list');
    strengths.forEach(item=>{
      const line=el('div','signal-strength');
      add(line,el('span','signal-strength-mark','✓'),
        add(el('div',''),el('strong','',tidy(item.title,180)),
          el('p','',tidy(item.evidence,800))));
      strengthsList.append(line);
    });
    strengthsSection.append(strengthsList);root.append(strengthsSection);
  }

  if(Array.isArray(data.unverified) && data.unverified.length){
    const limits=el('details','signal-limits');
    limits.append(el('summary','','What we could not check'));
    const body=el('div','signal-limits-body');
    data.unverified.filter(Boolean).slice(0,25).forEach(note=>body.append(el('p','',tidy(note,450))));
    limits.append(body);root.append(limits);
  }

  const bottom = el('div','signal-bottom-actions');
  const pdf=el('button','signal-download','Download Full PDF');
  pdf.type='button';
  pdf.addEventListener('click',()=>{
    if(window.VylensPdfDownload?.save)window.VylensPdfDownload.save();
    else document.getElementById('savePdf')?.click();
  });
  const again = el('a','','Scan another website or product');
  again.href = './index.html#audit-tool';
  bottom.append(pdf,again);
  root.append(bottom);
  main.prepend(root);
  document.body.classList.add('signal-ui');
  // Existing report DOM stays available for the full PDF download.
})();