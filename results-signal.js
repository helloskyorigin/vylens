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
  const openNoData=report.mode==='website'&&(
    data.scanDiagnostic?.status==='insufficient-offer-evidence'||
    (Number(data.inspectedOfferPages)===0&&data.blockers.length===0));
  if(openNoData){
    // A failed content capture is an incomplete scan, not "zero problems".
    // Never show five empty cards or offer a "full PDF" with no buyer analysis.
    const diagnostic=data.scanDiagnostic||{};
    const count=Math.max(0,Number(diagnostic.openedPages??report.coverage?.inspected??0));
    const analyzed=Math.max(0,Number(diagnostic.offerEvidencePages??data.inspectedOfferPages??0));
    const root=el('section','signal-report signal-no-data');
    root.id='signalReport';
    root.setAttribute('aria-label','Incomplete website inspection');
    const top=el('div','signal-topline');
    add(top,el('span','signal-eyebrow','WEBSITE INSPECTION'),
      el('span','signal-top-mark','Incomplete scan'));
    root.append(top);
    add(root,el('h1','signal-title','We couldn’t inspect the buying experience.'),
      el('p','signal-subject',tidy(report.subject||report.url||'Website',140)));
    const box=el('section','signal-diagnostic-panel');
    add(box,el('div','signal-diagnostic-kicker','NO BUYER ASSESSMENT AVAILABLE'),
      el('h2','','The website opened, but the offer wasn’t verified.'),
      el('p','',tidy(diagnostic.reason||
        'The scanner did not capture enough readable sales-page content to produce buyer findings.',260)));
    const counts=el('div','signal-diagnostic-stats');
    const opened=el('div','');
    add(opened,el('strong','',String(count)),el('span','',count===1?'page opened':'pages opened'));
    const usable=el('div','');
    add(usable,el('strong','',String(analyzed)),el('span','','offer pages analyzed'));
    add(counts,opened,usable);
    box.append(counts);
    const warnings=Array.isArray(diagnostic.examples)?diagnostic.examples:[];
    if(warnings.length){
      const more=el('details','signal-diagnostic-reasons');
      add(more,el('summary','','See why some pages could not be checked'));
      warnings.slice(0,4).forEach(item=>
        more.append(el('p','',tidy(item.page||'Page',85)+': '+
          tidy(item.reason||'Could not fully inspect',170))));
      box.append(more);
    }
    const preview=data.sourcePreview;
    if(Array.isArray(preview?.observations)&&preview.observations.length){
      const source=el('div','signal-diagnostic-source');
      add(source,el('h3','','What we could read from the page source'),
        el('p','',
          'These are limited observations—not a verified buying analysis.'));
      preview.observations.slice(0,3).forEach(ob=>
        add(source,el('strong','',tidy(ob.title,90)),
          el('p','',tidy(ob.evidence,230))));
      box.append(source);
    }
    root.append(box);
    const actions=el('div','signal-diagnostic-actions');
    const retry=el('button','signal-download','Try this scan again');
    retry.type='button';
    retry.addEventListener('click',()=>{
      try{
        sessionStorage.setItem('vylens:pending',
          JSON.stringify({mode:'website',url:report.url}));
        window.location.assign('./inspect.html');
      }catch{window.location.assign('./index.html#audit-tool');}
    });
    const specific=el('a','','Check a specific offer or pricing page');
    specific.href='./index.html#audit-tool';
    add(actions,retry,specific);
    root.append(actions);
    root.append(el('p','signal-no-data-foot',
      'A successful page load does not mean its content was inspected. No score, buying blockers, or fixes were invented.'));
    main.prepend(root);
    document.body.classList.add('signal-ui','signal-incomplete');
    return;
  }
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
    if (['clarity','value','trust','action','purchase'].includes(item.stage)) return item.stage;
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
  // Prefer the scanner's evidence-aware assessment for new reports.
  // Legacy reports retain their earlier calculation rather than losing results.
  const assessment=data.assessment?.version===1 ? data.assessment : null;
  const assessedSignals=new Map(
    (Array.isArray(assessment?.signals)?assessment.signals:[]).filter(x=>
      x&&['clarity','value','trust','action','purchase'].includes(x.key)&&
      (x.score===null||(Number.isFinite(x.score)&&x.score>=0&&x.score<=100)))
      .map(x=>[x.key,x]));
  const legacyOverall=originalStages.every(v => v !== null) ?
    Math.round(originalStages.reduce((sum,n) => sum+n,0) / 4 / 5) * 5 : null;
  const overall=assessment ?
    (Number.isFinite(assessment.overall)?assessment.overall:null) : legacyOverall;

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
  root.setAttribute('aria-label','VYLENS buyer report');
  const smartTone=value=>value===null?'unknown':value<50?'red':value<75?'yellow':'green';
  const priorityTone=item=>item.priority==='high'?'red':item.priority==='low'?'green':'yellow';
  const plainTitle=item=>tidy(item.title||item.heading||'Buying concern',150);
  const small=(text,max=180)=>tidy(text,max);
  const isLimited=report.mode==='product'||report.coverage?.complete===false||!rendered;
  const remark=el('div','signal-topline');
  add(remark,el('span','signal-eyebrow','YOUR CONVERSION REPORT'),
    el('span','signal-top-mark',report.mode==='website'?'Website Audit':'Digital Product Audit'));
  root.append(remark);
  root.append(el('h1','signal-title',"Here's what may be holding buyers back."));
  root.append(el('p','signal-subject',tidy(report.subject||report.url||'Your offer',100)));

  // One visual score, only when enough buyer-facing evidence exists.
  const scoreBox=el('section','signal-score');
  scoreBox.setAttribute('aria-label','Overall conversion score');
  scoreBox.append(el('div','signal-score-heading',report.mode==='product'&&data.kind==='product+offer'?'PUBLIC SALES PAGE ASSESSMENT':'OVERALL CONVERSION SCORE'));
  const scoreBody=el('div','signal-score-body');
  const circle=el('div','signal-score-ring signal-tone-'+smartTone(overall));
  circle.style.setProperty('--score-fill',(overall===null?0:overall)+'%');
  circle.setAttribute('role','img');
  circle.setAttribute('aria-label',overall===null?
    'Not enough evidence for an offer score':overall+' out of 100, offer assessment');
  const center=el('div','signal-score-center');
  add(center,el('strong','',overall===null?'—':String(overall)),
    el('span','',overall===null?'Not rated':'/ 100'));
  circle.append(center);
  const scoreCopy=el('div','signal-score-copy');
  const verdict=overall===null?'Not enough to score':
    overall<50?'Buyers may face major obstacles':
    overall<75?'Some buying doubts need attention':'Promising signals found';
  const tone=smartTone(overall);
  add(scoreCopy,el('span','signal-score-status signal-tone-'+tone,
      overall===null?'Limited review':overall<50?'Needs attention':
      overall<75?'Needs work':'Looking good'),
    el('h2','',verdict),
    el('p','',overall===null?
      (assessment?.explanation || (report.mode==='product'?
        'We checked the file, but could not confirm how its sales page looks to buyers.':
        'There was not enough visible information to give a fair score.')) :
       (report.mode==='product'&&data.kind==='product+offer')?'Public sales-page assessment only. Delivered-product findings are listed separately.':isLimited?'Based on the sections we could check.':
        'A quick assessment of the offer, not actual sales.'));
  add(scoreBody,circle,scoreCopy);
  scoreBox.append(scoreBody);
  root.append(scoreBox);

  // Keep the five compact, visually meaningful signal lines.
  const signals=el('section','signal-signals');
  add(signals,el('h2','','Your Buyer Signals'),
    el('p','signal-section-note','See what looks strong and what needs work.'));
  const items=el('div','signal-items');
  for(const key of ['clarity','value','trust','action','purchase']){
    const found=uniqueIssues.filter(x=>stage(x)===key);
    const positive=strengths.some(x=>stage(x)===key);
    const measured=assessedSignals.get(key);
    const value=measured?
      measured.score:(!rendered||(!found.length&&!positive)?null:
        found.some(x=>x.priority==='high')?20:found.length?55:85);
    const hue=smartTone(value);
    const status=value===null?'Not checked':
      hue==='red'?'Weak':hue==='yellow'?'Needs work':'Looking good';
    // A brief reason tied to actual observed evidence, not the same generic
    // promise repeated five times. Never reveal unsupported buyer certainty.
    const explanation=measured ?
      tidy(measured.explanation||'Insufficient evidence to judge this area.',178):
      value===null?'We could not check this well enough to rate it.':
      found.length?modes[key].warning:modes[key].good;
    const item=el('article','signal-item signal-tone-'+hue);
    const top=el('div','signal-item-top');
    add(top,el('h3','',modes[key].title),
      add(el('div','signal-item-right'),
        el('span','signal-item-value',value===null?'—':String(value)),
        el('span','signal-status',status)));
    const line=el('div','signal-bar');
    line.setAttribute('role','img');
    line.setAttribute('aria-label',modes[key].title+': '+status+
      (value===null?'':', '+value+' out of 100'));
    const fill=el('span','signal-bar-fill');
    fill.style.width=(value===null?0:value)+'%';
    line.append(fill);
    add(item,top,line,el('p','signal-item-note',explanation));
    items.append(item);
  }
  signals.append(items);
  // A small coverage receipt explains how many pages were actually reviewed,
  // without dumping dozens of technical checks into the five-card experience.
  if(report.mode==='website'&&Number(report.coverage?.inspected)>0){
    const inspected=Math.max(0,Math.floor(Number(report.coverage.inspected)));
    const analyzed=Math.max(0,Math.floor(Number(report.coverage?.buyerEvidencePages??
      data.inspectedOfferPages??0)));
    const received=Math.max(0,Math.floor(Number(report.coverage?.rendered||0)));
    const note=inspected+' '+(inspected===1?'page':'pages')+' opened · '+
      analyzed+' offer '+(analyzed===1?'page':'pages')+' analyzed'+
      (received<inspected?' · some pages were only partially checked':'')+
      ' · '+uniqueIssues.length+' possible buyer '+(uniqueIssues.length===1?'concern':'concerns');
    signals.append(el('p','signal-coverage-note',note));
  }
  root.append(signals);


  const cardsRoot=el('section','signal-report-cards');
  add(cardsRoot,el('h2','',"Your Full Report"),
    el('p','signal-section-note','Open a card for the problems, reasons and fixes that matter.'));
  const cards=[];
  const card=(title,hint,count,tone,render)=>{
    const details=el('details','signal-detail-card signal-tone-'+tone);
    const summary=el('summary','signal-card-head');
    const mark=el('span','signal-card-mark');
    mark.setAttribute('aria-hidden','true');
    const copy=el('div','signal-card-title');
    add(copy,el('h3','',title),el('p','',count+' · '+hint));
    add(summary,mark,copy,el('span','signal-card-chevron','⌄'));
    const contents=el('div','signal-card-content');
    render(contents);
    details.append(summary,contents);
    // Close siblings before the native <details> opens (no two expanded cards flash).
    summary.addEventListener('click',()=>{
      if(!details.open)cards.forEach(other=>{if(other!==details)other.open=false;});
    });
    details.addEventListener('toggle',()=>{
      if(details.open)cards.forEach(other=>{if(other!==details)other.open=false;});
    });
    cards.push(details);
    cardsRoot.append(details);
    return details;
  };
  const toneForFindings=uniqueIssues.some(x=>x.priority==='high')?'red':
    uniqueIssues.length?'yellow':rendered?'green':'unknown';
  const issueCounter=uniqueIssues.length+' '+(uniqueIssues.length===1?'problem':'problems')+' found';

  const addMore=(parent,rows,limit=5)=>{
    rows.forEach((row,i)=>{if(i>=limit)row.hidden=true;parent.append(row);});
    if(rows.length>limit){
      let expanded=false;
      const more=el('button','signal-show-more','Show all '+rows.length+' items');
      more.type='button';
      more.setAttribute('aria-expanded','false');
      more.addEventListener('click',()=>{
        expanded=!expanded;
        rows.forEach((row,i)=>{row.hidden=!expanded&&i>=limit;});
        more.textContent=expanded?'Show fewer':'Show all '+rows.length+' items';
        more.setAttribute('aria-expanded',String(expanded));
      });
      parent.append(more);
    }
  };
  const createRow=(tone,headline,detail='',foot='')=>{
    const row=el('div','signal-mini-row signal-tone-'+tone);
    add(row,el('span','signal-mini-dot'),
      add(el('div','signal-mini-text'),
        el('strong','',headline),
        detail?el('p','',detail):null,
        foot?el('small','',foot):null));
    return row;
  };
  card("What's Stopping Buyers?",'Most important concerns',issueCounter,
    toneForFindings,(body)=>{
      if(!uniqueIssues.length){
        body.append(el('p','signal-empty',rendered?
          'No specific buying blocker was flagged in the areas checked.':
          'We could not inspect enough of the offer to identify blockers.'));
        return;
      }
      const rows=uniqueIssues.map(item=>
        createRow(priorityTone(item),plainTitle(item),
          small(item.evidence,190),
          item.location?'Found at '+small(item.location,85):''));
      addMore(body,rows,5);
    });

  // Optional AI review never affects the measured/observed score above.
  // Display only verbatim-anchored second-opinion hypotheses from the server.
  const aiReview=data.aiReview;
  if(aiReview?.status==='completed'&&
      Array.isArray(aiReview.signals)&&aiReview.signals.length){
    const reviewed=aiReview.signals.slice(0,5);
    card('AI Evidence Review',report.mode==='product'?'Product and sales-page suggestions':'Page-linked improvement suggestions',
      reviewed.length+' '+(reviewed.length===1?'suggestion':'suggestions'),
      'yellow',(body)=>{
        body.append(el('p','signal-section-note',
          report.mode==='product'?'AI suggestions based on limited file findings and public sales-page observations. No product file bytes were sent. These are hypotheses.' : 'AI suggestions based on captured public text. These are hypotheses, not confirmed reasons for lost sales.'));
        const rows=reviewed.map(item=>{
          const row=createRow('yellow',small(item.title,130),
            small(item.evidence,230),small(item.location,115));
          const copy=row.querySelector('.signal-mini-text');
          if(copy){
            copy.append(el('p','','Buyer concern: '+small(item.buyerConcern,270)));
            copy.append(el('p','','Suggested fix: '+small(item.fix,330)));
            copy.append(el('small','','Verify: '+small(item.verify,215)));
          }
          return row;
        });
        addMore(body,rows,5);
      });
  }

  const questionItems=[];
  const seenQuestions=new Set();
  uniqueIssues.forEach(item=>{
    const question=small(item.buyerQuestion||item.buyerConcern||item.concern,220);
    if(!question||seenQuestions.has(question.toLowerCase()))return;
    seenQuestions.add(question.toLowerCase());
    questionItems.push({question,tone:priorityTone(item)});
  });
  card('Why People Hesitate','Possible buyer doubts',
    questionItems.length+' '+(questionItems.length===1?'concern':'concerns'),
    questionItems.some(q=>q.tone==='red')?'yellow':
      questionItems.length?'yellow':'unknown',(body)=>{
      if(!questionItems.length){
        body.append(el('p','signal-empty',
          'No specific buyer doubt could be supported by the available findings.'));
        return;
      }
      const rows=questionItems.map(q=>createRow(q.tone,q.question));
      addMore(body,rows,5);
    });

  const fixItems=uniqueIssues.filter(item=>small(item.fix));
  const copyButton=(value)=>{
    const btn=el('button','signal-copy','Copy');
    btn.type='button';
    btn.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(value);
        btn.textContent='Copied';
      }catch{
        btn.textContent='Select text to copy';
      }
    });
    return btn;
  };
  card('Exactly What to Change','Specific, practical fixes',
    fixItems.length+' '+(fixItems.length===1?'fix':'fixes')+' ready',
    fixItems.length?'green':'unknown',(body)=>{
      if(!fixItems.length){
        body.append(el('p','signal-empty',
          'We need clearer evidence before suggesting a change.'));
        return;
      }
      const rows=fixItems.map((item,i)=>{
        const row=el('div','signal-fix-row signal-tone-'+priorityTone(item));
        add(row,el('span','signal-fix-index',String(i+1).padStart(2,'0')),
          add(el('div','signal-fix-body'),
            el('strong','',small(item.fix,600)),
            item.location?el('small','','Where: '+small(item.location,115)):null,
            copyButton(small(item.fix,1100))));
        return row;
      });
      addMore(body,rows,5);
    });

  // Only real suggested wording belongs here. Other technical fixes stay in card 3.
  const wording=[];
  const usedWording=new Set();
  const offerCopy=(title,value,why)=>{
    const phrase=small(value,1100);
    if(!phrase||usedWording.has(phrase.toLowerCase()))return;
    usedWording.add(phrase.toLowerCase());
    wording.push({title:small(title,90)||'Suggested wording',value:phrase,why:small(why,140)});
  };
  uniqueIssues.forEach(item=>{
    if(item.copyTo)offerCopy('Suggested button wording',item.copyTo,'Check it matches the real next step.');
  });
  if(Array.isArray(data.fixKit))data.fixKit.forEach(item=>{
    if(!item||typeof item!=='object')return;
    // A checklist/action is not a copy rewrite.
    if(!/^(copy|rewrite|headline|cta|messaging)$/i.test(String(item.kind||'')))return;
    offerCopy(item.title||item.label,item.content,'Check this wording against your real offer.');
  });
  card('Better Copy & Rewrites','Ready-to-use wording when available',
    wording.length?wording.length+' copy '+(wording.length===1?'suggestion':'suggestions'):'No rewrite suggested',
    wording.length?'green':'unknown',(body)=>{
      if(!wording.length){
        body.append(el('p','signal-empty',
          'No clear rewrite was needed from the findings. Start with the fixes above.'));
        return;
      }
      const rows=wording.map(item=>{
        const row=el('div','signal-rewrite-row');
        add(row,el('span','signal-rewrite-tag',item.title),
          el('p','',item.value),
          el('small','',item.why),
          copyButton(item.value));
        return row;
      });
      addMore(body,rows,5);
    });

  card('Your Priority Action Plan','Start with the biggest issues',
    fixItems.length?fixItems.length+' steps in order':'No steps yet',
    fixItems.length?'yellow':'unknown',(body)=>{
      if(!fixItems.length){
        body.append(el('p','signal-empty','No specific action plan can be made from this scan.'));
        return;
      }
      const rows=fixItems.map((item,index)=>{
        const row=el('div','signal-step-row');
        add(row,el('span','signal-step-num',String(index+1).padStart(2,'0')),
          add(el('div','signal-step-copy'),
            el('strong','',small(item.fix,150)),
            item.verify?el('small','','Check: '+small(item.verify,135)):null));
        return row;
      });
      addMore(body,rows,5);
    });

  root.append(cardsRoot);
  const actions=el('div','signal-bottom-actions');
  const pdf=el('button','signal-download','Download Full PDF');
  pdf.type='button';
  pdf.addEventListener('click',()=>{
    if(window.VylensPdfDownload?.save)window.VylensPdfDownload.save();
    else document.getElementById('savePdf')?.click();
  });
  const again=el('a','','Scan another website or product');
  again.href='./index.html#audit-tool';
  add(actions,pdf,again);
  root.append(actions);

  main.prepend(root);
  document.body.classList.add('signal-ui');
  // The original complete report remains available to the existing PDF builder.
})();