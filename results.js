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
  const priority=issue=>{
    if(Number.isFinite(issue?.priorityScore)&&issue.priorityScore>=0&&issue.priorityScore<500)
      return issue.priorityScore;
    const level={critical:0,high:100,other:200}[severity(issue)];
    const name=String(issue?.title||'').toLowerCase();
    const weight=/broken|server error|404|410|insecure|unsafe|unreachable/.test(name)?0:
      /form|button|unlabeled|inaccessible|mobile overflow|viewport|clipp/.test(name)?9:
      /heading|contrast|accessibility|duplicate|navigation/.test(name)?18:
      /meta|canonical|favicon|social preview|title length/.test(name)?70:35;
    return level+weight;
  };
  const occurrenceCount=issue=>Number.isSafeInteger(issue?.affectedCount)&&issue.affectedCount>0?issue.affectedCount:1;
  const checkState=check=>['passed','attention','observed','unverified','not_applicable'].includes(check?.status)?check.status:'unverified';
  function validReport(report){
    if(!report||typeof report!=='object'||!['website','product'].includes(report.mode)||
      !Array.isArray(report.issues)||report.issues.length>250)return false;
    if(report.issues.some(issue=>!issue||typeof issue!=='object'||Array.isArray(issue)||
      (issue.occurrences!==undefined&&(!Array.isArray(issue.occurrences)||issue.occurrences.length>50||
        issue.occurrences.some(entry=>!entry||typeof entry!=='object'||Array.isArray(entry))))))return false;
    if(report.checks!==undefined&&(!Array.isArray(report.checks)||report.checks.length>5000||
      report.checks.some(item=>!item||typeof item!=='object'||Array.isArray(item))))return false;
    if(report.pages!==undefined&&(!Array.isArray(report.pages)||report.pages.length>200||
      report.pages.some(item=>!item||typeof item!=='object'||Array.isArray(item))))return false;
    return true;
  }
  function readReport(){
    try{
      const report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');
      return validReport(report)?report:null;
    }catch{return null;}
  }
  const category=issue=>clean(issue?.category,50)||'Other';
  const checkCount=report=>Array.isArray(report.checks)?report.checks.length:
    Number.isSafeInteger(report.checksRun)&&report.checksRun>=0?report.checksRun:0;
  function dateLabel(report){
    const date=new Date(report.checkedAt||report.completedAt||Date.now());
    return Number.isFinite(date.valueOf())?date.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'Recent audit';
  }
  function field(title,value,extra){
    const wrapper=node('div','finding-field'+(extra?' '+extra:''));
    wrapper.append(node('span','field-label',title),node('p','',clean(value,1800)));
    return wrapper;
  }
  function safePageLink(raw,site){
    try{
      const root=new URL(site),target=new URL(String(raw),root);
      if(['https:','http:'].includes(target.protocol)&&target.hostname===root.hostname)return target.toString();
    }catch{}
    return null;
  }
  function occurrencesPanel(issue,site){
    const entries=Array.isArray(issue.occurrences)?issue.occurrences:
      Array.isArray(issue.affectedPages)?issue.affectedPages.map(path=>({path,url:null,location:null,evidence:null})):[];
    if(!entries.length)return null;
    const count=occurrenceCount(issue),wrapper=node('details','occurrences-panel');
    wrapper.append(node('summary','occurrences-summary',count+' affected '+(count===1?'page':'pages')+' · view exact locations'));
    const list=node('div','occurrences-list');
    for(const entry of entries.slice(0,18)){
      const row=node('div','occurrence-row');
      const path=clean(entry.path||'/',150),url=safePageLink(entry.url||path,site);
      const heading=url?node('a','occurrence-link',path):node('span','occurrence-path',path);
      if(url){heading.href=url;heading.target='_blank';heading.rel='noopener noreferrer';}
      row.append(heading);
      const where=clean(entry.location||'',220);
      if(where&&!where.startsWith('pages affected'))row.append(node('small','',where));
      const proof=clean(entry.evidence||'',400);
      if(proof&&proof!==clean(issue.evidence,400))row.append(node('p','',proof));
      list.append(row);
    }
    if(count>entries.length)list.append(node('p','occurrence-capped','Showing '+entries.length+' of '+count+' affected pages.'));
    wrapper.append(list);
    return wrapper;
  }
  function issueElement(issue,index,site){
    const item=node('details','finding');
    const summary=node('summary','finding-head');
    summary.append(node('span','finding-index',String(index).padStart(2,'0')));
    const copy=node('span','finding-copy');
    const pages=occurrenceCount(issue);
    const level=severity(issue);
    const badge=node('span','severity '+level,level==='critical'?'Critical':level==='high'?'High':'Other');
    const meta=node('small','finding-meta');
    meta.append(node('span','',category(issue)+(pages>1?' · '+pages+' affected pages':'')),badge);
    copy.append(node('strong','',clean(issue.title||'Finding',170)),meta);
    const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');
    chevron.setAttribute('viewBox','0 0 24 24');
    chevron.setAttribute('class','chevron');
    chevron.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','m6 9 6 6 6-6');
    chevron.append(path);
    summary.append(copy,node('span','details-label','Details'),chevron);
    item.append(summary);
    const body=node('div','finding-body');
    if(occurrenceCount(issue)===1&&issue.location)body.append(field('LOCATION',issue.location));
    if(issue.evidence)body.append(field('EVIDENCE',issue.evidence));
    if(issue.fix)body.append(field('HOW TO FIX',issue.fix,'fix-field'));
    if(issue.verify)body.append(field('VERIFY',issue.verify));
    const pageGroup=occurrencesPanel(issue,site);
    if(pageGroup)body.append(pageGroup);
    if(!body.children.length)body.append(node('p','panel-empty','No additional details were recorded.'));
    if(issue.fix){
      const button=node('button','copy-fix','Copy instructions');
      button.type='button';
      button.setAttribute('aria-label','Copy instructions for '+clean(issue.title||'finding',75));
      button.addEventListener('click',async()=>{
        const recorded=Array.isArray(issue.occurrences)?issue.occurrences:
          Array.isArray(issue.affectedPages)?issue.affectedPages.map(path=>({path})):[];
        const affected=recorded.slice(0,18).map(entry=>
          'Affected: '+clean(entry.path||'/',170)+(entry.location?' · '+clean(entry.location,220):'')+
          (entry.evidence?' · '+clean(entry.evidence,320):''));
        const content=[issue.title,issue.location&&'Location: '+issue.location,issue.evidence&&'Evidence: '+issue.evidence,
          ...affected,issue.fix&&'Fix: '+issue.fix,issue.verify&&'Verify: '+issue.verify].filter(Boolean).join('\n');
        try{
          await navigator.clipboard.writeText(content);
          button.textContent='Copied instructions';
        }catch{button.textContent='Copy unavailable';}
      });
      body.append(button);
      item.addEventListener('toggle',()=>{if(!item.open)button.textContent='Copy instructions';});
    }
    item.append(body);
    return item;
  }
  function renderChecks(report){
    const checks=Array.isArray(report.checks)?report.checks:[];
    const counts={passed:0,attention:0,observed:0,unverified:0,not_applicable:0};
    for(const check of checks)counts[checkState(check)]++;
    const primary=counts.passed+' passed · '+counts.attention+' flagged';
    const secondary=[
      counts.observed?counts.observed+' observed':null,
      counts.unverified?counts.unverified+' not verified':null,
      counts.not_applicable?counts.not_applicable+' not applicable':null
    ].filter(Boolean).join(' · ');
    put('checksSummary',primary);
    put('checksExtra',secondary);
    put('checkBreakdownSummary',primary+(secondary?' · '+secondary:''));
    const ordered=checks.map((item,i)=>({item,index:i})).sort((a,b)=>
      ({attention:0,unverified:1,observed:2,passed:3,not_applicable:4}[checkState(a.item)]-
       {attention:0,unverified:1,observed:2,passed:3,not_applicable:4}[checkState(b.item)])||a.index-b.index);
    function addRow(target,check){
      const status=checkState(check),row=node('div','check-row'),info=node('div','check-row-text');
      info.append(node('strong','',clean(check?.name||'Check',160)));
      if(check?.detail)info.append(node('p','',clean(check.detail,450)));
      row.append(info,node('span','check-status '+status,
        status==='passed'?'Passed':status==='attention'?'Flagged':
          status==='not_applicable'?'N/A':status==='observed'?'Observed':'Not verified'));
      target.append(row);
    }
    const root=$('checkBreakdownList'),na=$('notApplicableList');
    const relevant=ordered.filter(({item})=>checkState(item)!=='not_applicable');
    const notRelevant=ordered.filter(({item})=>checkState(item)==='not_applicable');
    for(const {item} of notRelevant)addRow(na,item);
    if(!checks.length)root.append(node('p','panel-empty','No checks were recorded.'));
    if(counts.not_applicable){
      $('notApplicableGroup').hidden=false;
      put('notApplicableSummary',counts.not_applicable+' checks not applicable to these pages');
    }
    const more=$('moreChecks');let shown=0;
    const addNext=()=>{
      const next=Math.min(relevant.length,shown+40);
      for(const {item} of relevant.slice(shown,next))addRow(root,item);
      shown=next;
      more.hidden=shown>=relevant.length;
      if(!more.hidden)more.textContent='Show next '+Math.min(40,relevant.length-shown)+
        ' checks · '+shown+' of '+relevant.length+' shown';
    };
    if(relevant.length)addNext();
    more.addEventListener('click',addNext);
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
      if(occurrenceCount(issue)===1&&issue.location)section.append(node('p','','Location: '+clean(issue.location,600)));
      if(issue.evidence)section.append(node('p','','Evidence: '+clean(issue.evidence,1800)));
      if(Array.isArray(issue.occurrences)&&issue.occurrences.length){
        section.append(node('p','','Affected locations ('+occurrenceCount(issue)+' pages):'));
        issue.occurrences.slice(0,18).forEach(entry=>{
          section.append(node('p','print-line',clean(entry.path||'/',170)+' · '+clean(entry.location||'',260)+
            (entry.evidence&&entry.evidence!==issue.evidence?' · '+clean(entry.evidence,360):'')));
        });
      }else if(Array.isArray(issue.affectedPages)&&issue.affectedPages.length>1)
        section.append(node('p','','Affected pages: '+issue.affectedPages.join(', ')));
      if(issue.fix)section.append(node('p','','Fix: '+clean(issue.fix,1800)));
      if(issue.verify)section.append(node('p','','Verify: '+clean(issue.verify,1300)));
      root.append(section);
    });
    if(report.mode==='website'&&Array.isArray(report.pages)&&report.pages.length){
      root.append(node('h2','','Page coverage'));
      report.pages.forEach(page=>root.append(node('p','print-line',
        clean(page.path||'/',190)+' — '+clean(page.status,30)+(page.type==='legal'?' (policy)':'')+
        (page.reason?' · '+clean(page.reason,260):''))));
    }
    root.append(node('h2','','All completed and attempted checks'));
    const allChecks=Array.isArray(report.checks)?report.checks:[];
    if(!allChecks.length)root.append(node('p','','No check-by-check details were recorded.'));
    const names={passed:'Passed',attention:'Flagged',observed:'Observed',unverified:'Not verified',not_applicable:'Not applicable'};
    for(const item of allChecks){
      const section=node('div','print-check');
      section.append(node('strong','',names[checkState(item)]+' · '+clean(item?.name||'Check',260)));
      if(item?.detail)section.append(node('p','print-line',clean(item.detail,650)));
      root.append(section);
    }
    root.append(node('p','print-small','Total recorded checks: '+allChecks.length+'. This report distinguishes observations from confirmed problems; unsupported tests are not a pass.'));
    root.append(node('p','print-small',report.mode==='website'?
      clean(report.scope||'Public HTML and supported rendered-page checks where available; actual user behavior or sales not tested.',800):
      'Supported product-file checks. Actual buyer behavior and sales were not measured.'));
  }
  function render(report){
    const issues=report.issues.slice().sort((a,b)=>priority(a)-priority(b));
    const totals={critical:0,high:0,other:0};
    for(const issue of issues)totals[severity(issue)]++;
    const total=issues.length;
    const occurrences=issues.reduce((sum,item)=>sum+occurrenceCount(item),0);
    const checks=checkCount(report);
    put('problemsCount',total);
    put('criticalCount',totals.critical);
    put('highCount',totals.high);
    put('otherCount',totals.other);
    put('affectedOccurrences',report.mode==='website'?
      occurrences+' affected-page '+(occurrences===1?'occurrence':'occurrences'):
      'Findings from the supplied product');
    put('checksCount',checks);
    put('reportType',report.mode==='website'?'WEBSITE':'DIGITAL PRODUCT');
    put('reportSubject',clean(report.subject||report.url||'Your product',180));
    put('reportDate',dateLabel(report));
    put('year',new Date().getFullYear());
    renderChecks(report);
    renderCoverage(report);
    const highPriority=totals.critical+totals.high;
    const c=report.coverage;
    const partial=report.mode==='website'&&c&&!c.complete;
    const incompleteChecks=Array.isArray(report.checks)?
      report.checks.filter(item=>checkState(item)==='unverified').length:0;
    const inspected=Number(c?.inspected)||0,discovered=Number(c?.discovered)||0;
    put('heroState',report.mode==='product'?'FILE REVIEW READY':partial?'PARTIAL SITE AUDIT':'AUDIT READY');
    put('reportHeadline',!checks?'No completed checks.':
      highPriority?highPriority+' high-priority '+(highPriority===1?'finding':'findings')+' to review.':
      issues.length?issues.length+' '+(issues.length===1?'finding':'findings')+' worth reviewing.':
      'No confirmed issues in the completed checks.');
    const coverageCopy=report.mode==='website'?
      (discovered?inspected+' of '+discovered+' discovered pages inspected':
        inspected+' pages inspected')+
      (c?.rendered?', '+c.rendered+' browser-rendered':'')+
      (c?.sourceOnly?', '+c.sourceOnly+' source-only':'')+
      (partial?' · Coverage is partial.':' · Within discovered public-page coverage.'):
      'Local file review only · Your original file was not uploaded.'+
      (incompleteChecks?' Some checks could not be verified.':'');
    put('coverageMessage',coverageCopy);
    const first=issues[0];
    if(first){
      put('priorityStep','START HERE · PRIORITY 01');
      put('prioritySeverity',severity(first)==='critical'?'Critical':severity(first)==='high'?'High priority':'Review');
      $('prioritySeverity').className='priority-severity '+severity(first);
      put('impactTitle',highPriority?'Start with this fix.':'Start with this finding.');
      put('priorityFindingTitle',clean(first.title||'Finding',180));
      put('impactText',clean(first.evidence||'This issue needs closer review. Only recorded evidence is shown.',650));
      const location=clean(
        (Array.isArray(first.occurrences)?first.occurrences[0]?.location:'')||first.location||'',240);
      $('priorityLocation').hidden=!location;
      if(location)put('priorityLocation','Found at · '+location+
        (occurrenceCount(first)>1?' · '+occurrenceCount(first)+' affected pages':''));
      $('priorityFixBox').hidden=!first.fix;
      put('priorityFix',clean(first.fix||'',750));
      $('priorityDetails').hidden=false;
    }else{
      put('priorityStep',!checks?'CHECKS NOT COMPLETED':'SUPPORTED CHECKS');
      put('prioritySeverity',incompleteChecks?'Some unverified':'No flagged findings');
      $('prioritySeverity').className='priority-severity other';
      put('impactTitle',!checks?'No check results available.':'No confirmed problems in the checked areas.');
      put('priorityFindingTitle','');
      put('impactText',!checks?
        'The inspection did not produce recorded checks. Retry the audit to inspect the selected source.':
        incompleteChecks||partial?
        'Nothing was flagged by completed checks. Some pages or checks were not verified, so this is not an all-clear.':
        'No problems were flagged by the supported checks. This does not certify complete website or product quality.');
      $('priorityLocation').hidden=true;
      $('priorityFixBox').hidden=true;
      $('priorityDetails').hidden=true;
      $('impactSection').classList.add('no-findings');
    }
    put('findingsTitle',totals.critical+totals.high?'Fix these first':'Findings to review');
    put('findingsCount',issues.length?(issues.length+' distinct '+(issues.length===1?'finding':'findings')):'No findings');
    const list=$('findingsList'),initial=Math.min(3,issues.length);
    $('priorityDetails').addEventListener('click',()=>{
      const item=list.querySelector('.finding');
      if(!item)return;
      item.open=true;
      item.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      item.querySelector('summary')?.focus({preventScroll:true});
    });
    // A single open issue keeps the page compact on narrow screens.
    list.addEventListener('click',event=>{
      const heading=event.target.closest?.('summary.finding-head');
      if(!heading)return;
      const current=heading.parentElement;
      if(current.open)return; // Clicking the open item closes it naturally.
      // Close sibling details synchronously, before the native summary toggle.
      list.querySelectorAll('.finding[open]').forEach(item=>{
        if(item!==current)item.open=false;
      });
    });
    const add=(start,end)=>issues.slice(start,end).forEach((issue,i)=>list.append(issueElement(issue,start+i+1,report.url)));
    if(issues.length){
      add(0,initial);
      if(issues.length>initial){
        const more=$('moreProblems');
        more.hidden=false;
        let shown=initial,created=initial;
        const pageSize=10;
        const update=()=>{
          const next=Math.min(issues.length,shown);
          if(next>created){add(created,next);created=next;}
          Array.from(list.children).forEach((item,index)=>{
            if(index>=initial)item.hidden=index>=next;
          });
          list.classList.toggle('is-expanded',next>initial);
          more.setAttribute('aria-expanded',String(next>initial));
          put('moreProblemsText',next===issues.length?
            'Show fewer findings':'Show next '+Math.min(pageSize,issues.length-next)+
            ' findings · '+next+' of '+issues.length+' shown');
        };
        update();
        more.addEventListener('click',()=>{
          shown=shown>=issues.length?initial:Math.min(issues.length,shown+pageSize);
          update();
        });
      }
    }else{
      list.append(node('p','panel-empty',checks?'No findings were confirmed by the supported checks.':'No findings available.'));
    }
    put('scopeNote',report.mode==='website'?
      clean(report.scope||'Only supported public pages and checks were inspected; actual conversions were not measured.',900):
      'Based on supplied supported files. Actual buyer behavior was not measured.');
    printDetails(issues,report);
    $('savePdf').addEventListener('click',()=>window.print());
    $('exportData').addEventListener('click',()=>{
      try{
        const filename='vylens-'+clean(report.subject||report.url||'audit',70)
          .toLowerCase().replace(/[^a-z0-9.-]+/g,'-').replace(/^-+|-+$/g,'')+
          '-'+(Number.isFinite(new Date(report.checkedAt||Date.now()).valueOf())?
          new Date(report.checkedAt||Date.now()):new Date()).toISOString().slice(0,10)+'.json';
        const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
        const href=URL.createObjectURL(blob);
        const anchor=document.createElement('a');
        anchor.href=href;anchor.download=filename;
        document.body.append(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(href),60000);
      }catch(error){
        const control=$('exportData');
        control.textContent='Could not export. Try printing the report.';
        console.warn('VYLENS report export failed:',error?.name||'unknown');
      }
    });
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
  if(!report){
    $('missingReport').hidden=false;
    const file=$('reportFile'),error=$('reportImportError');
    $('importReport').addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];
      if(!selected)return;
      try{
        if(selected.size>3*1024*1024)throw new Error('This report file is too large (3 MB limit).');
        const parsed=JSON.parse(await selected.text());
        if(!validReport(parsed))throw new Error('This is not a supported VYLENS report JSON file.');
        sessionStorage.setItem('vylens:result',JSON.stringify(parsed));
        sessionStorage.setItem('vylens:imported','1');
        window.location.reload();
      }catch(reason){
        error.hidden=false;
        error.textContent=reason instanceof Error?reason.message:'Could not open this report.';
        file.value='';
      }
    });
    return;
  }
  $('main').hidden=false;
  render(report);
  if(sessionStorage.getItem('vylens:imported')==='1'){
    put('heroState','IMPORTED REPORT · NOT A NEW SCAN');
    $('coverageMessage').insertAdjacentText('beforeend',' · Opened from a local JSON export.');
  }
})();
