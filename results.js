(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text ?? '');
    return el;
  };
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = String(text ?? ''); };
  const short = (value, limit = 800) => String(value ?? '').trim().slice(0,limit);
  const severity = issue => String(issue?.severity ?? '').toLowerCase();
  const preferReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadReport() {
    let result;
    try { result = JSON.parse(sessionStorage.getItem('vylens:result') || 'null'); }
    catch { return null; }
    if (!result || !['website','product'].includes(result.mode) || !Array.isArray(result.issues) || result.issues.length > 250) return null;
    return result;
  }
  function countChecks(report) {
    if (Array.isArray(report.checks)) return report.checks.length;
    if (Number.isSafeInteger(report.checksRun) && report.checksRun >= 0) return report.checksRun;
    return 0;
  }
  function buildFinding(issue, index, urgent) {
    const item = make('details','finding');
    if (urgent && index === 0) item.open = true;
    const head = make('summary','finding-summary');
    const number = make('span','finding-number',String(index + 1).padStart(2,'0'));
    const copy = make('span','finding-name');
    copy.append(make('strong','',short(issue.title || 'Something to review',160)));
    copy.append(make('small','',short(issue.location || issue.category || '',120)));
    head.append(number,copy);
    if (urgent) head.append(make('span',`severity-tag ${severity(issue) === 'critical' ? 'critical' : 'high'}`,severity(issue) === 'critical' ? 'Critical' : 'High'));
    head.append(make('span','finding-chevron','+'));
    item.append(head);
    const detail = make('div','finding-body');
    if (issue.evidence) detail.append(detailLine('What we found',issue.evidence));
    if (issue.fix) detail.append(detailLine('What to change',issue.fix,true));
    if (issue.verify && urgent) detail.append(detailLine('Check your fix',issue.verify));
    if (!detail.children.length) detail.append(make('p','', 'No additional evidence was recorded for this observation.'));
    const copyButton = make('button','copy-fix','Copy fix');
    copyButton.type='button';
    copyButton.addEventListener('click',async () => {
      const text = [issue.title,issue.evidence&&`Found: ${issue.evidence}`,issue.fix&&`Fix: ${issue.fix}`,issue.verify&&`Verify: ${issue.verify}`].filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(text); copyButton.textContent='Copied ✓'; }
      catch { copyButton.textContent='Select text to copy'; }
    });
    if (issue.fix) detail.append(copyButton);
    item.append(detail);
    return item;
  }
  function detailLine(label,value,highlight=false) {
    const block=make('div',`finding-detail${highlight?' fix':''}`);
    block.append(make('strong','',label));
    block.append(make('p','',short(value,1400)));
    return block;
  }
  function buildPrintAppendix(urgent,notes) {
    const parent=$('#printAppendix');
    const all=[...urgent,...notes];
    if (!all.length) return;
    parent.append(make('h2','','Full findings'));
    all.forEach((issue,i) => {
      const block=make('section','print-finding');
      block.append(make('h3','',`${i+1}. ${short(issue.title,160)}`));
      if (issue.location) block.append(make('p','',`Location: ${short(issue.location,160)}`));
      if (issue.evidence) block.append(make('p','',`What we found: ${short(issue.evidence,1400)}`));
      if (issue.fix) block.append(make('p','',`What to change: ${short(issue.fix,1400)}`));
      if (issue.verify) block.append(make('p','',`Verify: ${short(issue.verify,800)}`));
      parent.append(block);
    });
  }
  function render(report) {
    set('year',new Date().getFullYear());
    const urgent = report.issues.filter(item=>['critical','high'].includes(severity(item)))
      .sort((a,b)=>(severity(a)==='critical'?0:1)-(severity(b)==='critical'?0:1));
    const notes = report.issues.filter(item=>!['critical','high'].includes(severity(item)));
    const critical = urgent.filter(item=>severity(item)==='critical').length;
    const high = urgent.filter(item=>severity(item)==='high').length;
    set('criticalCount',critical);set('highCount',high);set('checksCount',countChecks(report));
    $('#criticalCard').classList.toggle('is-clear',critical===0);
    $('#highCard').classList.toggle('is-clear',high===0);
    set('reportType',report.mode==='website'?'WEBSITE AUDIT':'DIGITAL PRODUCT AUDIT');
    set('reportSubject',short(report.subject || report.url || 'Your product',180));
    const d=new Date(report.checkedAt||report.completedAt||Date.now());
    set('reportDate',Number.isNaN(d.valueOf())?'Recent audit':d.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}));

    if (urgent.length) {
      $('#reportSummary').classList.add('has-alerts');
      set('summaryIcon','!');
      set('summaryTitle',`${urgent.length} important issue${urgent.length===1?'':'s'} found.`);
      set('summaryCopy','Start with the first fix below. Each finding includes the evidence and what to change.');
      $('#urgentSection').hidden=false;
      set('urgentCount',`${urgent.length} to review`);
      const list=$('#urgentList');
      urgent.forEach((issue,index)=>list.append(buildFinding(issue,index,true)));
    } else {
      set('summaryIcon','✓');
      set('summaryTitle','No urgent issues detected.');
      set('summaryCopy',notes.length
        ? `${notes.length} smaller improvement${notes.length===1?'':'s'} worth reviewing below.`
        : 'Nothing urgent was flagged in the checks completed.');
    }
    if (notes.length) {
      $('#notesSection').hidden=false;
      set('notesTitle',urgent.length?'Also worth improving.':'A few things to improve.');
      set('notesCount',`${notes.length} observation${notes.length===1?'':'s'}`);
      notes.forEach((issue,index)=>$('#notesList').append(buildFinding(issue,index,false)));
    }
    set('scopeNote',report.mode==='website'
      ? 'Based on available webpage content. Visual design, sales and checkout behavior were not tested.'
      : 'Based on the supplied file and any available sales-page checks. Actual buyer behavior was not measured.');

    buildPrintAppendix(urgent,notes);
    $('#savePdf').addEventListener('click',()=>window.print());
    $('#recheck').addEventListener('click',()=>{
      if(report.mode==='website' && report.url) {
        sessionStorage.setItem('vylens:pending',JSON.stringify({mode:'website',url:report.url}));
        window.location.assign('./inspect.html');
      } else {
        sessionStorage.setItem('vylens:prefill-mode','product');
        window.location.assign('./index.html#audit-tool');
      }
    });
  }
  function init() {
    const report=loadReport();
    if (!report) { $('#missingReport').hidden=false; return; }
    $('#main').hidden=false;
    render(report);
  }
  init();
})();
