(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let payload = null;
  let selectedFile = null;
  let inspecting = false;
  let currentMessage = 0;
  let messageQueue = Promise.resolve();
  let isFinished = false;
  let waitingTimer = null;
  let retryTimer = null;
  let retryUntil = 0;
  let elapsedTimer = null;
  const messages = {
    website: [
      ['Reading your website…', 'Getting a closer look at your website.'],
      ['Discovering linked pages…', 'Checking the pages we can access.'],
      ['Inspecting page layouts…', 'Reviewing what the browser renders.'],
      ['The audit is still running…', 'Larger websites can take longer to inspect.'],
      ['Continuing the website checks…', 'Your final report will show what was verified and what could not be checked.']
    ],
    product: [
      ['Opening your digital product…', 'Your file stays on this device.'],
      ['Examining available content…', 'Looking for issues supported by the file itself.'],
      ['Making sense of the details…', 'Getting your findings ready.']
    ]
  };
  function readableError(error) {
    if (error?.name === 'AbortError') return 'The website audit ran too long. Please retry.';
    return error?.message || 'Something interrupted this inspection.';
  }
  function renderMessage(headline, description) {
    $('#analysisTitle').textContent = headline.replace(/…$/, '');
    const dot = document.createElement('span'); dot.textContent = headline.endsWith('…') ? '…' : '.';
    $('#analysisTitle').appendChild(dot);
    $('#analysisDescription').textContent = description;
  }
  function changeMessage(headline, description) {
    messageQueue = messageQueue.then(async () => {
      if (isFinished) return;
      const copy = $('#analysisCopy');
      if (motionReduced) { renderMessage(headline, description); return; }
      copy.classList.remove('is-entering'); copy.classList.add('is-leaving');
      await new Promise(resolve => setTimeout(resolve, 225));
      if (isFinished) return;
      renderMessage(headline, description);
      copy.classList.remove('is-leaving');
      void copy.offsetWidth;
      copy.classList.add('is-entering');
    });
    return messageQueue;
  }
  function beginWaitingMessages() {
    let next = 1;
    clearInterval(waitingTimer);
    waitingTimer = setInterval(() => {
      if (isFinished) { stopWaitingMessages(); return; }
      if (next >= messages[payload.mode].length) {
        if (payload.mode !== 'website') { stopWaitingMessages(); return; }
        next = 3; // Repeat truthful heartbeat updates, never fabricated progress percentages.
      }
      changeMessage(...messages[payload.mode][next++]);
    }, payload.mode === 'website' ? 8000 : 2700);
  }
  function beginElapsed() {
    const display=$('#analysisElapsed');
    display.hidden=payload.mode!=='website';
    if(display.hidden)return;
    clearInterval(elapsedTimer);
    const started=Date.now();
    const update=()=>{
      const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
      display.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+
        String(seconds%60).padStart(2,'0')+
        ' elapsed · Inspecting up to 24 public pages';
    };
    update();
    elapsedTimer=setInterval(update,1000);
  }
  function stopWaitingMessages() {
    clearInterval(waitingTimer);waitingTimer=null;
    clearInterval(elapsedTimer);elapsedTimer=null;
  }
  function updateRetryState() {
    const button=$('#analysisRetry');
    const remaining=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
    button.disabled=remaining>0;
    button.firstChild.textContent=remaining?'Retry in '+remaining+'s ':'Try again ';
    if(!remaining&&retryTimer){clearInterval(retryTimer);retryTimer=null;}
  }
  function showError(message) {
    isFinished = true;
    stopWaitingMessages();
    $('#analysisRunning').hidden = true;
    $('#analysisError').hidden = false;
    $('#analysisErrorMessage').textContent = message;
    if(retryTimer){clearInterval(retryTimer);retryTimer=null;}
    updateRetryState();
    if(retryUntil>Date.now())retryTimer=setInterval(updateRetryState,1000);
    if(!$('#analysisRetry').disabled)$('#analysisRetry').focus({preventScroll:true});
    else{
      $('#analysisErrorTitle').setAttribute('tabindex','-1');
      $('#analysisErrorTitle').focus({preventScroll:true});
    }
  }
  function normalizeResults(data) {
    if (!data || !Array.isArray(data.issues) || typeof data.mode !== 'string') throw new Error('The inspection response was incomplete. Please try again.');
    // The source inspection is limited; no conversion score is calculated or invented.
    return {...data, issues:data.issues, completedAt:Date.now()};
  }
  async function run() {
    if (inspecting) return;
    if(Date.now()<retryUntil){showError('Another audit was requested recently. Please use the retry countdown.');return;}
    if(retryTimer){clearInterval(retryTimer);retryTimer=null;}
    inspecting = true; isFinished = false; currentMessage = 0;
    $('#analysisRunning').hidden = false;
    $('#analysisError').hidden = true;
    renderMessage(...messages[payload.mode][0]);
    beginElapsed();
    beginWaitingMessages();
    try {
      let result;
      if (payload.mode === 'website') {
        const url = payload.url;
        if (!url) throw new Error('No website URL was provided. Please start from the homepage.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 135000);
        let response;
        try {
          response = await fetch('./api/inspect-site', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:controller.signal,cache:'no-store'});
        } finally {clearTimeout(timeout);}
        const type=response.headers.get('content-type')||'';
        if (!type.includes('application/json')) {
          if(response.status===404) throw new Error('The scanner service is not available on this deployment (HTTP 404).');
          throw new Error(`Scanner service returned an unexpected response (HTTP ${response.status}).`);
        }
        let data;
        try {data = await response.json();} catch {throw new Error('The scanner service returned invalid JSON.');}
        if (!response.ok) {
          if(response.status===429){
            const seconds=Math.max(1,Math.min(120,Number(data?.retryAfter||response.headers.get('retry-after'))||25));
            retryUntil=Date.now()+seconds*1000;
            throw new Error(data?.error||'The scanner is temporarily busy. You can retry when the countdown finishes.');
          }
          throw new Error(data?.error || `Scanner service returned HTTP ${response.status}.`);
        }
        result={...data,summary:data.summary||'Multi-page inspection completed.',meta:data.meta||'Public pages',coverageLabel:data.coverageLabel||'Site audit'};
      } else {
        if (!selectedFile) { const transfer = await window.VylensCore.takeFile(); selectedFile = transfer?.file || null; }
        const file = selectedFile;
        if (!file) throw new Error('The selected file is no longer available. Please select it again from the homepage.');
        window.VylensCore.onProgress = (headline,description) => { if(!isFinished)changeMessage(headline,description); };
        result=await window.VylensCore.productReview(file,payload);
        // An optional sales URL is audited separately; the file itself is NEVER uploaded.
        if (payload.salesPage && /^https?:\/\//i.test(payload.salesPage)) {
          changeMessage('Checking your sales page…', 'Comparing the public offer page with your product file.');
          const salesTimeout=new AbortController();
          const salesTimer=setTimeout(()=>salesTimeout.abort(),18000);
          try {
            const response=await fetch('./api/inspect', {
              method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({url:payload.salesPage}),signal:salesTimeout.signal,cache:'no-store'
            });
            const scan=await response.json();
            if (!response.ok) throw new Error(scan.error||'The sales page could not be checked.');
            const url=new URL(scan.url).hostname;
            result.issues.push(...scan.issues.map(item=>({
              ...item,id:result.issues.length+item.id,
              category:'Sales page · '+item.category,
              location:`${url} · ${item.location||'public page source'}`
            })));
            result.checks.push(...scan.checks.map(item=>({...item,name:'Sales page · '+item.name})));
            result.checked.push('Public sales page checks');
            result.checksRun=result.checks.length;
            result.scope+=' Optional sales page was also checked using public HTML source and selected same-origin links. No actual purchase was attempted or conversion analytics measured.';
            result.salesPage=scan.url;
            result.summary+=' Public sales-page source checks completed.';
            result.issues.sort((a,b)=>( {critical:0,high:1,note:2}[a.severity]??2)-({critical:0,high:1,note:2}[b.severity]??2));
            result.issues.forEach((item,index)=>item.id=index+1);
            result.totalDetected=result.issues.length;
            result.passed=result.issues.length===0;
          } catch (error) {
            result.checks.push({name:'Optional sales page fetch',status:'unverified',detail:
              `Sales URL could not be inspected: ${String(error?.message||'request failed').slice(0,160)}. No conclusions about sales performance were made.`});
            result.checksRun=result.checks.length;
            result.scope+=' The optional sales page could not be verified.';
          } finally {clearTimeout(salesTimer)}
        }
      }
      const report = normalizeResults(result);
      stopWaitingMessages();
      await messageQueue;
      // Do not store source bytes; keep only limited findings in this tab's session.
      sessionStorage.setItem('vylens:result', JSON.stringify(report));
      sessionStorage.removeItem('vylens:imported');
      // Avoid rerunning a completed (potentially expensive) inspection when this page is refreshed.
      sessionStorage.removeItem('vylens:pending');
      await changeMessage('Your audit is ready.', 'Opening your full results now.');
      if (!motionReduced) await new Promise(resolve => setTimeout(resolve, 530));
      isFinished = true;
      window.location.replace('./results.html');
    } catch(error) { showError(readableError(error)); }
    finally {window.VylensCore.onProgress = null;inspecting = false;}
  }
  function init() {
    $('#analysisYear').textContent = new Date().getFullYear();
    try { payload = JSON.parse(sessionStorage.getItem('vylens:pending') || 'null'); } catch { payload = null; }
    if (!payload || !['website','product'].includes(payload.mode)) {
      $('#analysisRunning').hidden=true; $('#analysisError').hidden=false;
      $('#analysisErrorMessage').textContent='Start with a website URL or product file on the homepage.';
      $('#analysisRetry').hidden=true;
      return;
    }
    $('#analysisType').textContent = payload.mode==='website'?'WEBSITE AUDIT':'DIGITAL PRODUCT AUDIT';
    $('#analysisSubject').textContent = payload.mode==='website' ? (() => { try {return new URL(payload.url).hostname;}catch{return 'Your website';}})() : 'Your uploaded file';
    if(payload.mode==='product') $('#subjectGlyph').innerHTML='<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h6M8 13h8m-8 4h6"/>';
    $('#analysisRetry').addEventListener('click',run);
    run();
  }
  init();
})();
