(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const put=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'');};
  const node=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=String(text??'');
    return el;
  };
  const clean=(value,max=1200)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const severity=issue=>['critical','high'].includes(String(issue?.severity||'').toLowerCase())?String(issue.severity).toLowerCase():'other';
  const priority=issue=>({critical:0,high:1,other:2}[severity(issue)]);
  const occurrenceCount=issue=>Number.isSafeInteger(issue?.affectedCount)&&issue.affectedCount>0?issue.affectedCount:1;
  const checkState=check=>['passed','attention','unverified'].includes(check?.status)?check.status:'unverified';
  function readReport(){
    try{
      const report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');
      if(!report||!['website','product'].includes(report.mode)||!Array.isArray(report.issues)||report.issues.length>250)return null;
      if(report.issues.some(issue=>!issue||typeof issue!=='object'||Array.isArray(issue)))return null;
      return report;
    }catch{return null;}
  }
  const category=issue=>clean(issue?.category,50)||'Other';
  const checkCount=report=>Array.isArray(report.checks)?report.checks.length:
    Number.isSafeInteger(report.checksRun)&&report.checksRun>=0?report.checksRun:0;
  function dateLabel(report){
    const date=new Date(report.checkedAt||report.completedAt||Date.now());
    return Number.isFinite(date.valueOf())?date.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'Recent audit';
  }
  const impactLookup=name=>{
    const c=name.toLowerCase();
    if(/discover|seo|index|search/.test(c))return {title:'Search visibility',description:'Search engines may receive less clear information about this page.'};
    if(/access/.test(c))return {title:'Accessibility',description:'Some visitors may find parts of this page harder to use.'};
    if(/navigation|broken.link|links/.test(c))return {title:'Navigation',description:'Some visitors may struggle to reach linked pages or sections.'};
    if(/security|transport|https/.test(c))return {title:'Security',description:'Some expected website safeguards may be missing.'};
    if(/policy|legal/.test(c))return {title:'Policy clarity',description:'Some published policy information may be incomplete or unclear.'};
    if(/completeness|draft|placeholder/.test(c))return {title:'Product readiness',description:'Parts of the deliverable may need review before sharing.'};
    if(/mobile|viewport|responsive/.test(c))return {title:'Mobile experience',description:'Some small-screen visitors may experience layout or usability issues.'};
    if(/sharing|social/.test(c))return {title:'Shared previews',description:'Links shared elsewhere may show incomplete previews.'};
    if(/brand|favicon/.test(c))return {title:'Brand recognition',description:'Some browser or sharing cues may be harder to recognize.'};
    if(/form|input/.test(c))return {title:'Form usability',description:'Some visitors may have difficulty understanding form controls.'};
    if(/page structure|document structure|heading|content|readability|text|quality/.test(c))return {title:'Content clarity',description:'The page or product structure may be harder to follow.'};
    if(/file|pdf|zip|archive|image|format|metadata/.test(c))return {title:'File usability',description:'Opening or navigating the delivered content may be affected.'};
    return {title:name,description:'This area may need attention based on the findings.'};
  };
  function deriveImpact(issues){
    const list=new Map();
    for(const issue of issues){
      const mapped=impactLookup(category(issue));
      const item=list.get(mapped.title)||{...mapped,count:0,priority:2};
      item.count+=occurrenceCount(issue);
      item.priority=Math.min(item.priority,priority(issue));
      list.set(mapped.title,item);
    }
    return [...list.values()].sort((a,b)=>a.priority-b.priority||b.count-a.count||a.title.localeCompare(b.title));
  }
  function field(title,value,extra){
    const wrapper=node('div','finding-field'+(extra?' '+extra:''));
    wrapper.append(node('span','field-label',title),node('p','',clean(value,1800)));
    return wrapper;
  }
  function issueElement(issue,index){
    const item=node('details','finding');
    const summary=node('summary','finding-head');
    summary.append(node('span','finding-index',String(index).padStart(2,'0')));
    const copy=node('span','finding-copy');
    const pages=occurrenceCount(issue);
    copy.append(node('strong','',clean(issue.title||'Finding',170)),
      node('small','',category(issue)+(pages>1?' · '+pages+' affected pages':'')));
    const level=severity(issue);
    const badge=node('span','severity '+level,level==='critical'?'Critical':level==='high'?'High':'Other');
    const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');
    chevron.setAttribute('viewBox','0 0 24 24');
    chevron.setAttribute('class','chevron');
    chevron.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','m6 9 6 6 6-6');
    chevron.append(path);
    summary.append(copy,badge,node('span','details-label','Details'),chevron);
    item.append(summary);
    const body=node('div','finding-body');
    if(issue.location)body.append(field('LOCATION',issue.location));
    if(Array.isArray(issue.affectedPages)&&issue.affectedPages.length>1)
      body.append(field('AFFECTED PAGES',issue.affectedPages.slice(0,40).join(', ')));
    if(issue.evidence)body.append(field('EVIDENCE',issue.evidence));
    if(issue.fix)body.append(field('HOW TO FIX',issue.fix,'fix-field'));
    if(issue.verify)body.append(field('VERIFY',issue.verify));
    if(!body.children.length)body.append(node('p','panel-empty','No additional details were recorded.'));
    if(issue.fix){
      const button=node('button','copy-fix','Copy fix');
      button.type='button';
      button.setAttribute('aria-label','Copy fix for '+clean(issue.title||'finding',75));
      button.addEventListener('click',async()=>{
        const content=[issue.title,issue.location&&'Location: '+issue.location,issue.evidence&&'Evidence: '+issue.evidence,
          issue.fix&&'Fix: '+issue.fix,issue.verify&&'Verify: '+issue.verify].filter(Boolean).join('\n');
        try{
          await navigator.clipboard.writeText(content);
          button.textContent='Copied';
        }catch{button.textContent='Copy unavailable';}
      });
      body.append(button);
    }
    item.append(body);
    return item;
  }
  function renderChecks(report){
    const checks=Array.isArray(report.checks)?report.checks:[];
    const counts={passed:0,attention:0,unverified:0};
    for(const check of checks)counts[checkState(check)]++;
    const countParts=[counts.passed+' passed',counts.attention+' flagged'];
    if(counts.unverified)countParts.push(counts.unverified+' unverified');
    put('checkBreakdownSummary',checks.length?countParts.join(' · '):'No check details recorded');
    put('checksSummary',checks.length?countParts.join(' · '):'No check details recorded');
    const ordered=checks.map((item,i)=>({item,index:i})).sort((a,b)=>
      ({attention:0,unverified:1,passed:2}[checkState(a.item)]-({attention:0,unverified:1,passed:2}[checkState(b.item)]))||a.index-b.index);
    const root=$('checkBreakdownList');
    for(const {item} of ordered.slice(0,650)){
      const type=checkState(item);
      const row=node('div','check-row');
      const info=node('div','check-row-text');
      info.append(node('strong','',clean(item?.name||'Check',160)));
      if(item?.detail)info.append(node('p','',clean(item.detail,450)));
      row.append(info,node('span','check-status '+type,type==='passed'?'Passed':type==='attention'?'Flagged':'Not verified'));
      root.append(row);
    }
    if(!checks.length)root.append(node('p','panel-empty','No checks were recorded.'));
    if(ordered.length>650)root.append(node('p','panel-empty','Showing the first 650 checks.'));
  }
  function renderCoverage(report){
    if(report.mode!=='website'||!report.coverage||!Array.isArray(report.pages))return;
    const c=report.coverage,inspected=Number(c.inspected)||0,discovered=Number(c.discovered)||0;
    $('siteCoverage').hidden=false;
    put('coverageTitle',inspected+' of '+discovered+' pages inspected');
    const pending=(Number(c.remaining)||0)+(Number(c.skipped)||0);
    put('coverageSubtitle',c.complete?'All discovered public pages checked.':
      pending?pending+' pages not fully inspected.':
      c.sourceOnly?c.sourceOnly+' pages checked using source only.':
      'Coverage includes only discovered public pages.');
    put('legalCount',(Number(c.legal)||0)+' policy');
    $('coverageFill').style.width=Math.max(0,Math.min(100,Math.round(inspected/Math.max(discovered,1)*100)))+'%';
    for(const page of report.pages.slice(0,70)){
      const line=node('div','coverage-page');
      const path=node('span','coverage-path',clean(page.path||'/',180));
      path.title=clean(page.url||page.path,400);
      const meta=node('span','coverage-page-meta');
      if(page.type==='legal')meta.append(node('small','coverage-policy','Policy'));
      const label=page.status==='rendered'?'Rendered':page.status==='source'?'Source only':page.status==='skipped'?'Skipped':'Unverified';
      meta.append(node('small','coverage-status'+(page.status==='rendered'?' is-verified':''),label));
      if(page.reason)line.title=clean(page.reason,200);
      line.append(path,meta);
      $('coveragePages').append(line);
    }
  }
  function printDetails(issues,report){
    const root=$('printAppendix');
    root.append(node('h2','','Full findings'));
    if(!issues.length)root.append(node('p','','No problems flagged by completed supported checks.'));
    issues.forEach((issue,index)=>{
      const section=node('section','print-finding');
      section.append(node('h3','',String(index+1)+'. '+clean(issue.title||'Finding',180)+' — '+severity(issue).toUpperCase()),
        node('p','','Area: '+category(issue)));
      if(issue.location)section.append(node('p','','Location: '+clean(issue.location,600)));
      if(Array.isArray(issue.affectedPages)&&issue.affectedPages.length>1)
        section.append(node('p','','Affected pages: '+issue.affectedPages.join(', ')));
      if(issue.evidence)section.append(node('p','','Evidence: '+clean(issue.evidence,1800)));
      if(issue.fix)section.append(node('p','','Fix: '+clean(issue.fix,1800)));
      if(issue.verify)section.append(node('p','','Verify: '+clean(issue.verify,1300)));
      root.append(section);
    });
    if(report.mode==='website'&&Array.isArray(report.pages)&&report.pages.length){
      root.append(node('h2','','Page coverage'));
      report.pages.slice(0,70).forEach(page=>root.append(node('p','print-line',(page.path||'/')+' — '+page.status+(page.type==='legal'?' (policy)':''))));
    }
    root.append(node('p','print-small',report.mode==='website'?
      clean(report.scope||'Public HTML and supported rendered-page checks where available; actual user behavior or sales not tested.',800):
      'Supported product-file checks. Actual buyer behavior and sales were not measured.'));
  }
  function render(report){
    const issues=report.issues.slice().sort((a,b)=>priority(a)-priority(b));
    const totals={critical:0,high:0,other:0};
    for(const issue of issues)totals[severity(issue)]+=occurrenceCount(issue);
    const total=totals.critical+totals.high+totals.other;
    const checks=checkCount(report);
    put('problemsCount',total);
    put('criticalCount',totals.critical);
    put('highCount',totals.high);
    put('otherCount',totals.other);
    put('checksCount',checks);
    put('reportType',report.mode==='website'?'WEBSITE':'DIGITAL PRODUCT');
    put('reportSubject',clean(report.subject||report.url||'Your product',180));
    put('reportDate',dateLabel(report));
    put('year',new Date().getFullYear());
    renderChecks(report);
    renderCoverage(report);
    const impacts=deriveImpact(issues);
    if(issues.length){
      const top=impacts.slice(0,2);
      const descriptions=top.map(i=>i.description);
      put('impactText',descriptions.join(' '));
      impacts.slice(0,3).forEach(i=>$('impactTags').append(node('span','impact-chip',i.title)));
    }else{
      const unverified=Array.isArray(report.checks)?report.checks.filter(x=>checkState(x)==='unverified').length:0;
      put('impactText',checks===0?'No checks were completed. Run another audit to inspect the site.':
        unverified?'No confirmed problems in the completed checks. Some checks could not be verified.':
        'No problems were flagged by the checks completed. Other issues may still exist.');
    }
    put('findingsCount',issues.length?(issues.length+' issue '+(issues.length===1?'type':'types')):'No issues');
    const list=$('findingsList'),initial=Math.min(4,issues.length);
    const add=(start,end)=>issues.slice(start,end).forEach((issue,i)=>list.append(issueElement(issue,start+i+1)));
    if(issues.length){
      add(0,initial);
      if(issues.length>initial){
        const more=$('moreProblems');
        more.hidden=false;
        let expanded=false;
        const update=()=>{
          if(expanded){add(initial,issues.length);list.classList.add('is-expanded');}
          else{list.replaceChildren();add(0,initial);list.classList.remove('is-expanded');}
          more.setAttribute('aria-expanded',String(expanded));
          put('moreProblemsText',expanded?'Show fewer problems':'View all '+issues.length+' issue types');
        };
        put('moreProblemsText','View all '+issues.length+' issue types');
        more.addEventListener('click',()=>{expanded=!expanded;update();});
      }
    }else{
      list.append(node('p','panel-empty',checks?'No detected problems to fix.':'No findings available.'));
    }
    put('scopeNote',report.mode==='website'?
      clean(report.scope||'Only supported public pages and checks were inspected; actual conversions were not measured.',900):
      'Based on supplied supported files. Actual buyer behavior was not measured.');
    printDetails(issues,report);
    $('savePdf').addEventListener('click',()=>window.print());
    if(report.mode==='product')$('recheck').lastChild.textContent=' New file';
    $('recheck').addEventListener('click',()=>{
      if(report.mode==='website'&&report.url){
        try{
          sessionStorage.setItem('vylens:pending',JSON.stringify({mode:'website',url:report.url}));
          window.location.assign('./inspect.html');
        }catch{window.location.assign('./index.html#audit-tool');}
      }else{
        try{sessionStorage.setItem('vylens:prefill-mode','product');}catch{}
        window.location.assign('./index.html#audit-tool');
      }
    });
  }
  const report=readReport();
  if(!report){$('missingReport').hidden=false;return;}
  $('main').hidden=false;
  render(report);
})();
