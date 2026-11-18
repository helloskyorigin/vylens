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
  const messages = {
    website: [
      ['Reading your website…', 'Requesting the publicly available page source.'],
      ['Looking for meaningful signals…', 'Checking the parts of the source we can verify.'],
      ['Still looking closely…', 'Some websites take longer to respond.']
    ],
    product: [
      ['Opening your digital product…', 'Your file stays on this device.'],
      ['Examining available content…', 'Looking for issues supported by the file itself.'],
      ['Making sense of the details…', 'Preparing a focused first look from the checks we can complete.']
    ]
  };
  function readableError(error) {
    if (error?.name === 'AbortError') return 'This website took too long to respond. Please try again.';
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
      if (isFinished || next >= messages[payload.mode].length) { clearInterval(waitingTimer); return; }
      changeMessage(...messages[payload.mode][next++]);
    }, 2700);
  }
  function stopWaitingMessages() { clearInterval(waitingTimer); waitingTimer = null; }
  function showError(message) {
    isFinished = true;
    stopWaitingMessages();
    $('#analysisRunning').hidden = true;
    $('#analysisError').hidden = false;
    $('#analysisErrorMessage').textContent = message;
    $('#analysisRetry').focus({preventScroll:true});
  }
  function normalizeResults(data) {
    if (!data || !Array.isArray(data.issues) || typeof data.mode !== 'string') throw new Error('The inspection response was incomplete. Please try again.');
    // The source inspection is limited; no conversion score is calculated or invented.
    return {...data, issues:data.issues.slice(0,3), completedAt:Date.now()};
  }
  async function run() {
    if (inspecting) return;
    inspecting = true; isFinished = false; currentMessage = 0;
    $('#analysisRunning').hidden = false;
    $('#analysisError').hidden = true;
    renderMessage(...messages[payload.mode][0]);
    beginWaitingMessages();
    try {
      let result;
      if (payload.mode === 'website') {
        const url = payload.url;
        if (!url) throw new Error('No website URL was provided. Please start from the homepage.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);
        let response;
        try {response = await fetch('./api/inspect', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:controller.signal,cache:'no-store'});}
        finally {clearTimeout(timeout);}
        let data;
        try {data = await response.json();} catch {throw new Error('We received an unreadable response from the inspection service.');}
        if (!response.ok) throw new Error(data?.error || 'Unable to inspect this website right now.');
        result={...data, summary:data.pageTitle?'Page title read from the initial HTML.':'No title was found in the initial HTML.',meta:'Public HTML · no visual rendering',coverageLabel:'Page source'};
      } else {
        if (!selectedFile) { const transfer = await window.VylensCore.takeFile(); selectedFile = transfer?.file || null; }
        const file = selectedFile;
        if (!file) throw new Error('The selected file is no longer available. Please select it again from the homepage.');
        window.VylensCore.onProgress = (headline,description) => { if(!isFinished)changeMessage(headline,description); };
        result=await window.VylensCore.productReview(file,payload);
      }
      const report = normalizeResults(result);
      stopWaitingMessages();
      await messageQueue;
      // Do not store source bytes; keep only limited findings in this tab's session.
      sessionStorage.setItem('vylens:result', JSON.stringify(report));
      await changeMessage('Your first look is ready.', 'Opening your findings now.');
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
    $('#analysisScope').textContent = payload.mode==='website' ? 'Checking public HTML only. Visual design and conversion performance are not measured in this free pass.' : 'Your file is read locally; only the supported structural checks are performed.';
    if(payload.mode==='product') $('#subjectGlyph').innerHTML='<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h6M8 13h8m-8 4h6"/>';
    $('#analysisRetry').addEventListener('click',run);
    run();
  }
  init();
})();
