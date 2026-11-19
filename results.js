(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const by = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value ?? '');
    return node;
  };
  const put = (id, value) => { const node = $(id); if (node) node.textContent = String(value ?? ''); };
  const clean = (value, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const rank = value => value === 'critical' ? 0 : value === 'high' ? 1 : 2;
  const severity = issue => {
    const value = String(issue?.severity ?? '').toLowerCase();
    return ['critical', 'high'].includes(value) ? value : 'other';
  };
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readReport() {
    let value;
    try { value = JSON.parse(sessionStorage.getItem('vylens:result') || 'null'); }
    catch { return null; }
    if (!value || !['website', 'product'].includes(value.mode) || !Array.isArray(value.issues) || value.issues.length > 250) return null;
    if (value.issues.some(issue => !issue || typeof issue !== 'object')) return null;
    return value;
  }
  function issueCategory(issue) {
    const category = clean(issue.category, 48);
    return category || 'Other';
  }
  function checkCount(report) {
    if (Array.isArray(report.checks)) return report.checks.length;
    return Number.isSafeInteger(report.checksRun) && report.checksRun >= 0 ? report.checksRun : 0;
  }
  function impactFor(category) {
    const name = category.toLowerCase();
    if (/discover|seo|index|search/.test(name)) return 'Search visibility|Search engines may receive less clear information about this page.';
    if (/access/.test(name)) return 'Accessibility|Some visitors may find the content harder to navigate or understand.';
    if (/navigation|broken.link|links/.test(name)) return 'Navigation|Visitors may have difficulty reaching linked pages.';
    if (/security|transport|https/.test(name)) return 'Security|Some expected safeguards may be missing.';
    if (/policy|legal/.test(name)) return 'Policy clarity|Visitors may find some policy information incomplete or unclear.';
    if (/completeness|draft|placeholder/.test(name)) return 'Product readiness|Some parts of the deliverable may need finishing or review before sharing.';
    if (/mobile|viewport|responsive/.test(name)) return 'Mobile experience|Viewing the page on smaller screens may be affected.';
    if (/sharing|social/.test(name)) return 'Link previews|Links shared elsewhere may show incomplete information.';
    if (/brand|favicon/.test(name)) return 'Brand recognition|The browser tab or shared identity may be harder to recognize.';
    if (/form|input/.test(name)) return 'Forms & usability|Visitors may find some controls harder to use.';
    if (/page structure|document structure|heading|content|readability|text|quality/.test(name)) return 'Content clarity|The page or product structure may be harder to follow.';
    if (/file|pdf|zip|archive|image|format|metadata/.test(name)) return 'File usability|Opening or navigating the delivered content may be affected.';
    return category + '|This area has findings that may need attention.';
  }
  function areaMap(issues) {
    const areas = new Map();
    for (const issue of issues) {
      const name = issueCategory(issue);
      const key = name.toLowerCase();
      const current = areas.get(key) || {name, count:0, most:2};
      current.count += Number.isSafeInteger(issue.affectedCount)&&issue.affectedCount>0?issue.affectedCount:1;
      current.most = Math.min(current.most, rank(severity(issue)));
      areas.set(key, current);
    }
    return [...areas.values()].sort((a,b) => a.most-b.most || b.count-a.count || a.name.localeCompare(b.name));
  }
  function impactMap(issues) {
    const impacts = new Map();
    for (const issue of issues) {
      const [title, description] = impactFor(issueCategory(issue)).split('|');
      const current = impacts.get(title) || {title, description, count:0, most:2};
      current.count += Number.isSafeInteger(issue.affectedCount)&&issue.affectedCount>0?issue.affectedCount:1;
      current.most = Math.min(current.most, rank(severity(issue)));
      impacts.set(title, current);
    }
    return [...impacts.values()].sort((a,b) => a.most-b.most || b.count-a.count || a.title.localeCompare(b.title));
  }
  function dateLabel(report) {
    const date = new Date(report.checkedAt || report.completedAt || Date.now());
    if (!Number.isFinite(date.valueOf())) return 'Recent audit';
    return date.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  }

  function sectionLabel(text, kind) { return by('span', 'detail-label' + (kind ? ' detail-label-' + kind : ''), text); }
  function detail(title, text, cls) {
    const wrapper = by('div', 'issue-detail' + (cls ? ' ' + cls : ''));
    wrapper.append(sectionLabel(title), by('p','',clean(text, 1800)));
    return wrapper;
  }
  function finding(issue, number, expand) {
    const node = by('details', 'finding');
    if (expand) node.open = true;
    const head = by('summary', 'finding-head');
    const numberEl = by('span', 'finding-number', String(number));
    const main = by('span', 'finding-main');
    const pages=Number.isSafeInteger(issue.affectedCount)&&issue.affectedCount>1?issue.affectedCount:0;
    main.append(by('strong','',clean(issue.title || 'Finding',160)),
      by('small','',issueCategory(issue)+(pages?' · '+pages+' pages':'')));
    const sev = severity(issue);
    const sevEl = by('span', 'severity ' + sev, sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : 'Note');
    const chevron = document.createElementNS('http://www.w3.org/2000/svg','svg');
    chevron.setAttribute('class','chevron');
    chevron.setAttribute('viewBox','0 0 24 24');
    chevron.setAttribute('aria-hidden','true');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','m6 9 6 6 6-6');
    chevron.append(path);
    head.append(numberEl, main, sevEl, chevron);
    node.append(head);
    const body = by('div', 'finding-body');
    if (issue.location) body.append(detail('LOCATION', issue.location));
    if (Array.isArray(issue.affectedPages) && issue.affectedPages.length>1)
      body.append(detail('AFFECTED PAGES',issue.affectedPages.join(', ')));
    if (issue.evidence) body.append(detail('EVIDENCE', issue.evidence));
    if (issue.fix) body.append(detail('HOW TO FIX', issue.fix, 'fix-detail'));
    if (issue.verify) body.append(detail('VERIFY', issue.verify));
    if (!body.children.length) body.append(by('p','unverified-detail','No additional details were recorded for this finding.'));
    if (issue.fix) {
      const button = by('button','copy-fix','Copy fix');
      button.type = 'button';
      button.setAttribute('aria-label','Copy fix for ' + clean(issue.title || 'finding',80));
      button.addEventListener('click', async () => {
        const content = [issue.title, issue.location && 'Location: ' + issue.location, issue.evidence && 'Evidence: ' + issue.evidence, issue.fix && 'Fix: ' + issue.fix, issue.verify && 'Verify: ' + issue.verify].filter(Boolean).join('\n');
        try {
          await navigator.clipboard.writeText(content);
          button.textContent = 'Copied';
        } catch { button.textContent = 'Copy unavailable'; }
      });
      body.append(button);
    }
    node.append(body);
    return node;
  }
  function printDetails(issues, report) {
    const root = $('printAppendix');
    // The impact and affected areas already appear on the printable page.
    // Keep one complete list of findings rather than repeating each section.
    if (issues.length) root.append(by('h2','','Full findings'));
    issues.forEach((issue, index) => {
      const item = by('section','print-finding');
      item.append(by('h3','', String(index + 1) + '. ' + clean(issue.title || 'Finding',160) + ' — ' + severity(issue).toUpperCase()));
      item.append(by('p','', 'Area: ' + issueCategory(issue)));
      if (issue.location) item.append(by('p','', 'Location: ' + clean(issue.location,500)));
      if (Array.isArray(issue.affectedPages)&&issue.affectedPages.length>1)
        item.append(by('p','', 'Affected pages: ' + issue.affectedPages.join(', ')));
      if (issue.evidence) item.append(by('p','', 'Evidence: ' + clean(issue.evidence,1800)));
      if (issue.fix) item.append(by('p','', 'Fix: ' + clean(issue.fix,1800)));
      if (issue.verify) item.append(by('p','', 'Verify: ' + clean(issue.verify,1200)));
      root.append(item);
    });
    if (report.mode==='website' && Array.isArray(report.pages) && report.pages.length) {
      root.append(by('h2','','Page coverage'));
      for(const page of report.pages.slice(0,70))
        root.append(by('p','print-line',(page.path||'/')+' — '+page.status+(page.type==='legal'?' (policy)':'')));
    }
    const scope = by('p','print-small', report.mode === 'website'
      ? 'Public page source and supported rendered DOM/mobile checks were inspected where available. Actual user behavior, sales and legal compliance were not tested.'
      : 'Product-file audit. Visual quality, buyer intent and actual sales were not measured.');
    root.append(scope);
  }

  function renderCheckBreakdown(report) {
    if(!Array.isArray(report.checks)||!report.checks.length)return;
    const counts={passed:0,attention:0,unverified:0};
    for(const check of report.checks)
      counts[Object.hasOwn(counts,check?.status)?check.status:'unverified']++;
    const parts=[
      counts.passed+' passed',
      counts.attention+' flagged',
      counts.unverified+' not verified'
    ];
    put('checkBreakdownSummary',parts.join(' · '));
    const root=$('checkBreakdownList');
    for(const check of report.checks.slice(0,650)){
      const status=Object.hasOwn(counts,check?.status)?check.status:'unverified';
      const row=by('div','check-breakdown-row');
      const text=by('div','check-breakdown-text');
      text.append(by('strong','',clean(check?.name||'Check',130)));
      if(check?.detail)text.append(by('p','',clean(check.detail,400)));
      row.append(text,by('span','check-breakdown-state '+status,status==='passed'?'Passed':status==='attention'?'Flagged':'Not verified'));
      root.append(row);
    }
    $('checkBreakdown').hidden=false;
  }
  function renderCoverage(report) {
    const c=report.coverage;
    if(!c || !Array.isArray(report.pages))return;
    $('siteCoverage').hidden=false;
    const total=Math.max(1,Number(c.discovered)||0),inspected=Number(c.inspected)||0;
    put('coverageTitle',inspected+' of '+(Number(c.discovered)||0)+' pages inspected');
    const pending=(Number(c.remaining)||0)+(Number(c.skipped)||0);
    put('coverageSubtitle',c.complete?'All discovered pages checked.':
      pending?pending+' page'+(pending===1?'':'s')+' not fully checked.':
      c.sourceOnly?c.sourceOnly+' page'+(c.sourceOnly===1?'':'s')+' checked without browser rendering.':
      'Only discovered public pages are included.');
    put('legalCount',(Number(c.legal)||0)+' legal / policy');
    $('coverageFill').style.width=Math.max(0,Math.min(100,Math.round(inspected/total*100)))+'%';
    for(const p of report.pages.slice(0,70)) {
      const row=by('div','coverage-page');
      const path=by('span','coverage-path',clean(p.path||'/',160));
      path.title=clean(p.url||p.path,300);
      const meta=by('span','coverage-page-meta');
      if(p.type==='legal')meta.append(by('small','coverage-policy','Policy'));
      const text=p.status==='rendered'?'Rendered':p.status==='source'?'Source only':p.status==='skipped'?'Skipped':'Unverified';
      meta.append(by('small','coverage-status '+(p.status==='rendered'?'is-verified':'is-unverified'),text));
      row.append(path,meta);
      if(p.reason)row.title=clean(p.reason,150);
      $('coveragePages').append(row);
    }
  }
  function render(report) {
    const issues = report.issues.slice().sort((a,b) => rank(severity(a))-rank(severity(b)));
    const issueWeight = item => Number.isSafeInteger(item.affectedCount)&&item.affectedCount>0?item.affectedCount:1;
    const count = severityName => issues.filter(item => severity(item) === severityName).reduce((n,item)=>n+issueWeight(item),0);
    const critical = count('critical'), high = count('high'), other = count('other');
    put('criticalCount',critical);
    put('highCount',high);
    put('otherCount',other);
    put('checksCount',checkCount(report));
    $('criticalCard').classList.toggle('is-clear',critical === 0);
    $('highCard').classList.toggle('is-clear',high === 0);
    $('otherCard').classList.toggle('is-clear',other === 0);
    put('reportType',report.mode === 'website' ? 'WEBSITE' : 'DIGITAL PRODUCT');
    put('reportSubject',clean(report.subject || report.url || 'Your product',180));
    put('reportDate',dateLabel(report));
    put('year',new Date().getFullYear());
    renderCheckBreakdown(report);
    renderCoverage(report);

    const impacts = impactMap(issues);
    const areas = areaMap(issues);
    const impactList = $('impactList');
    if (!issues.length) {
      const calm = by('div','empty-state');
      calm.append(by('span','empty-symbol','✓'),by('div','',''));
      const attempts = checkCount(report);
      const unavailable = Array.isArray(report.checks) ? report.checks.filter(check => check?.status === 'unverified').length : 0;
      const cleanResult = attempts > 0 && unavailable === 0;
      const mainText = attempts === 0 ? 'No checks completed.' : cleanResult ? 'No problems flagged by completed checks.' : 'No confirmed issues found.';
      const helpText = attempts === 0 ? 'Please run a new audit.' : unavailable > 0 ? 'Some checks could not be verified.' : 'Nothing was flagged by the checks completed.';
      calm.lastChild.append(by('strong','',mainText),by('p','',helpText));
      impactList.append(calm);
      $('areasSection').hidden = true;
      $('findingsSection').hidden = true;
    } else {
      impacts.forEach(impact => {
        const entry = by('article','impact-row');
        const left = by('span','impact-symbol','');
        left.setAttribute('aria-hidden','true');
        const center = by('div','impact-copy');
        center.append(by('h3','',impact.title),by('p','',impact.description));
        entry.append(left,center);
        impactList.append(entry);
      });
      $('areasSection').hidden = false;
      $('findingsSection').hidden = false;
      const chips = $('areasList');
      const list = $('findingsList');
      let activeArea = null;
      const showFindings = () => {
        const filtered = activeArea
          ? issues.filter(issue => issueCategory(issue).toLowerCase() === activeArea)
          : issues;
        list.replaceChildren();
        filtered.forEach((issue,index) => list.append(finding(issue,index+1,index===0)));
        const occurrences=filtered.reduce((n,item)=>n+issueWeight(item),0);
        put('findingsCount',occurrences+(occurrences===1?' issue':' issues'));
        for (const chip of chips.children) {
          if (chip.tagName && chip.tagName.toLowerCase() !== 'button') continue;
          const selected = chip.dataset.area === (activeArea ?? 'all');
          chip.classList.toggle('is-active',selected);
          chip.setAttribute('aria-pressed',String(selected));
        }
      };
      // A single area needs no redundant filter. Multiple areas get an explicit reset.
      if (areas.length > 1) {
        const allChip = by('button','area-chip');
        allChip.type='button';
        allChip.dataset.area='all';
        allChip.setAttribute('aria-controls','findingsList');
        allChip.append(by('span','','All areas'),by('strong','',issues.reduce((sum,item)=>sum+issueWeight(item),0)));
        allChip.addEventListener('click',() => {activeArea=null;showFindings();});
        chips.append(allChip);
      }
      areas.forEach(area => {
        const interactive=areas.length > 1;
        const chip = by(interactive?'button':'span','area-chip'+(interactive?'':' is-static'));
        if (interactive) {
          chip.type='button';
          chip.dataset.area=area.name.toLowerCase();
          chip.setAttribute('aria-controls','findingsList');
          chip.setAttribute('aria-pressed','false');
          chip.setAttribute('aria-label','Show findings in '+area.name);
          chip.addEventListener('click',() => {activeArea=chip.dataset.area;showFindings();});
        }
        chip.append(by('span','',area.name),by('strong','',area.count));
        chips.append(chip);
      });
      showFindings();
    }
    put('scopeNote',report.mode === 'website'
      ? clean(report.scope || 'Only supported public checks were performed; real conversions were not measured.',650)
      : 'Based on the supplied file and supported checks. Actual buyer behavior was not measured.');
    printDetails(issues, report);

    $('savePdf').addEventListener('click', () => window.print());
    if (report.mode === 'product') $('recheck').lastChild.textContent = 'Scan another file';
    $('recheck').addEventListener('click', () => {
      if (report.mode === 'website' && report.url) {
        try {
          sessionStorage.setItem('vylens:pending',JSON.stringify({mode:'website',url:report.url}));
          window.location.assign('./inspect.html');
        } catch { window.location.assign('./index.html#audit-tool'); }
      } else {
        try { sessionStorage.setItem('vylens:prefill-mode','product'); } catch {}
        window.location.assign('./index.html#audit-tool');
      }
    });
  }
  const report = readReport();
  if (!report) { $('missingReport').hidden = false; return; }
  $('main').hidden = false;
  render(report);
})();
