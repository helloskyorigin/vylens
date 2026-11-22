(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let payload = null;
  let selectedFile = null;
  let inspecting = false;
  let messageQueue = Promise.resolve();
  let isFinished = false;
  let waitingTimer = null;
  let retryTimer = null;
  let retryUntil = 0;
  let elapsedTimer = null;
  const stages={
    connecting:['Opening the website…','Reaching the pages behind your offer.'],
    discovering:['Finding the buying pages…','Locating the product, pricing, and purchase steps.'],
    rendering:['Checking the buyer experience…','Reviewing the offer and how visitors take the next step.'],
    source:['Checking what we can access…','Some pages could not be fully checked. We will show what was verified.'],
    links:['Checking key links and buttons…','Looking for broken or confusing next steps.'],
    diagnosing:['Building your buyer report…','Connecting the findings to practical changes.'],
    'ai-review':['Checking the evidence with AI…','Reviewing the verified page details for useful suggestions.']
  };
  let lastStageAt=0;
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
    lastStageAt=Date.now();
    clearInterval(waitingTimer);
    waitingTimer=setInterval(()=>{
      if(payload.mode==='website'&&Date.now()-lastStageAt>18000){
        lastStageAt=Date.now();
        changeMessage('The check is still running…','Slow or unavailable pages will appear in the coverage notes.');
      }
    },5000);
  }
  async function readScanStream(response){
    if(!response.body)throw new Error('The scanner returned no response body.');
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let pending='',report=null;
    const consume=line=>{
      if(!line.trim())return;
      const update=JSON.parse(line);
      if(update.error)throw new Error(update.error);
      if(stages[update.stage]){
        lastStageAt=Date.now();
        changeMessage(...stages[update.stage]);
      }
      if(update.report)report=update.report;
    };
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        pending+=decoder.decode(value,{stream:true});
        let end;
        while((end=pending.indexOf('\n'))!==-1){
          consume(pending.slice(0,end));
          pending=pending.slice(end+1);
        }
      }
      consume(pending+decoder.decode());
      if(!report)throw new Error('The connection ended before the report was ready. Please retry.');
      return report;
    }finally{reader.releaseLock();}
  }
  function beginElapsed() {
    const display=$('#analysisElapsed');
    display.hidden=false;
    clearInterval(elapsedTimer);
    const started=Date.now();
    const update=()=>{
      const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
      display.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+
        String(seconds%60).padStart(2,'0');
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
  // Keep product-delivery findings distinct from public offer findings. Neither proves why a visitor left.
  function combineProductAndOffer(fileReview,salesReview,{sourceOnly=false}={}){
    if(!fileReview||!salesReview)return fileReview;
    const unique=new Map();
    const add=(items,origin)=>items.forEach(item=>{
      if(!item||!item.title)return;
      const key=[origin,item.fingerprint||item.stage,item.title,item.location].join('|').toLowerCase();
      if(!unique.has(key))unique.set(key,{...item,source:item.source||
        (origin==='file'?'Locally inspected product file':'Public sales page')});
    });
    add(salesReview.blockers||[],'sales');add(fileReview.blockers||[],'file');
    const blockers=[...unique.values()].sort((a,b)=>(
      {high:0,review:1,medium:1,low:2}[a.priority]??1)-(
      {high:0,review:1,medium:1,low:2}[b.priority]??1)).slice(0,20);
    blockers.forEach((item,i)=>item.id='buyer-'+(i+1));
    const strengths=[...(salesReview.strengths||[]),...(fileReview.strengths||[])].slice(0,12);
    const labels=[['clarity','Offer clarity'],['value','Price & delivered value'],
      ['trust','Buyer confidence'],['action','Purchase & use']];
    const journey=labels.map(([id,label])=>({
      id,label,status:blockers.some(x=>x.stage===id)?'attention':
        strengths.some(x=>x.stage===id)?'observed':'unverified',
      detail:blockers.some(x=>x.stage===id)?'A possible issue has supporting inspection evidence':
        strengths.some(x=>x.stage===id)?'An observation was recorded':'Insufficient evidence for this area'
    }));
    const salesAssessment=sourceOnly?null:salesReview.assessment?.version===1?salesReview.assessment:null;
    return {...fileReview,kind:'product+offer',blockers,strengths,journey,
      renderedPages:Number(salesReview.renderedPages)||0,
      inspectedOfferPages:sourceOnly?0:Number(salesReview.inspectedOfferPages)||0,
      // This remains the PUBLIC OFFER assessment; it never rates quality of the private product.
      assessment:salesAssessment?{...salesAssessment,
        explanation:'Based on the public sales-page evidence only. Product delivery findings are listed separately.'}:null,
      offerUnderstanding:salesReview.offerUnderstanding,
      fixKit:Array.isArray(salesReview.fixKit)?salesReview.fixKit:[],
      aiReview:salesReview.aiReview||null,
      unverified:[...(fileReview.unverified||[]),...(salesReview.unverified||[]),
        'The public offer assessment does not measure satisfaction with the delivered product or real checkout conversions.'],
      scope:'Local digital-product diagnostics + '+(sourceOnly?'initial public sales-page HTML':'rendered public sales-page evidence')+
        '. Neither view establishes actual buyer decisions or sales losses.'};
  }
  async function inspectAttachedSalesPage(url){
    // Prefer the SAME rendered buyer journey used for website audits.
    // Explicitly fall back to source-only analysis when a store blocks rendering.
    let deepError='';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),126000);
    try{
      const response=await fetch('./api/inspect-site',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({url}),signal:controller.signal,cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Rendered sales-page scan unavailable.');
      if(!data?.conversion||Number(data.conversion.inspectedOfferPages)<1)
        throw new Error('No readable rendered buying offer could be verified.');
      return {scan:data,sourceOnly:false};
    }catch(error){deepError=String(error?.message||'rendering unavailable').slice(0,175);}
    finally{clearTimeout(timer);}
    // Shallow fallback is correctly labelled and must never imply the rendered buy flow was checked.
    const fallback=new AbortController();
    const fallbackTimer=setTimeout(()=>fallback.abort(),18000);
    try{
      const response=await fetch('./api/inspect',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url}),signal:fallback.signal,cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'The public sales page could not be checked.');
      return {scan:data,sourceOnly:true,deepError};
    }finally{clearTimeout(fallbackTimer);}
  }
  function productAiEvidence(fileReview,salesReview,payload){
    const pick=items=>Array.isArray(items)?items.slice(0,14).map(x=>({
      title:String(x?.title||'').slice(0,140),
      evidence:String(x?.evidence||'').slice(0,500),
      location:String(x?.location||'').slice(0,140)
    })):[];
    return {fileType:String(fileReview?.subject||'').split('.').pop().slice(0,16),
      price:String(payload?.price||'').slice(0,30),
      salesPageUrl:String(payload?.salesPage||'').slice(0,400),
      salesCoverage:salesReview?.renderedPages>0?'rendered':salesReview?'source-only':'none',
      fileIssues:pick(fileReview?.conversion?.blockers),
      fileStrengths:pick(fileReview?.conversion?.strengths),
      salesIssues:pick(salesReview?.blockers),
      salesStrengths:pick(salesReview?.strengths)};
  }
  async function compareProductWithAi(fileReview,salesReview,payload){
    if(payload?.aiProductConsent!==true)return null;
    changeMessage('Comparing the evidence with AI…',
      'Reviewing limited product findings alongside the public sales-page observations.');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),17500);
    try{
      const response=await fetch('./api/review-product',{
        method:'POST',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({consent:true,fileEvidence:productAiEvidence(fileReview,salesReview,payload)})
      });
      if(!response.ok)throw new Error('The optional AI comparison was unavailable.');
      const review=await response.json();
      if(!review||!Array.isArray(review.signals))throw Error('Invalid AI comparison response.');
      return review;
    }catch{return {status:'unavailable',signals:[]};}
    finally{clearTimeout(timer);}
  }
  async function run() {
    if (inspecting) return;
    if(Date.now()<retryUntil){showError('Another audit was requested recently. Please use the retry countdown.');return;}
    if(retryTimer){clearInterval(retryTimer);retryTimer=null;}
    inspecting = true; isFinished = false;
    $('#analysisRunning').hidden = false;
    $('#analysisError').hidden = true;
    if(payload.mode==='website')renderMessage('Starting your check…','Waiting for the website inspector to respond.');
    else renderMessage('Opening your delivered product…','Your original file stays on this device.');
    beginElapsed();
    beginWaitingMessages();
    try {
      let result;
      if (payload.mode === 'website') {
        const url = payload.url;
        if (!url) throw new Error('No website URL was provided. Please start from the homepage.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 135000);
        let data;
        try{
          const response=await fetch('./api/inspect-site',{
            method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson, application/json'},
            body:JSON.stringify({url}),signal:controller.signal,cache:'no-store'
          });
          const type=response.headers.get('content-type')||'';
          if(response.ok&&type.includes('application/x-ndjson'))data=await readScanStream(response);
          else{
            if(!type.includes('application/json')){
              if(response.status===404)throw new Error('The scanner service is unavailable (HTTP 404).');
              if(response.status===504)throw new Error('The scanner timed out. Try checking the specific offer page.');
              throw new Error('Scanner service returned an unexpected response (HTTP '+response.status+').');
            }
            try{data=await response.json();}
            catch(error){if(error.name==='AbortError')throw error;throw new Error('The scanner service returned invalid JSON.');}
            if(!response.ok){
              if(response.status===429){
                const seconds=Math.max(1,Math.min(120,Number(data?.retryAfter||response.headers.get('retry-after'))||25));
                retryUntil=Date.now()+seconds*1000;
              }
              throw new Error(data?.error||'Scanner service returned HTTP '+response.status+'.');
            }
          }
        }finally{clearTimeout(timeout);}
        result={...data,summary:data.summary||'Multi-page inspection completed.',meta:data.meta||'Public pages',coverageLabel:data.coverageLabel||'Site audit'};
      } else {
        if (!selectedFile) { const transfer = await window.VylensCore.takeFile(); selectedFile = transfer?.file || null; }
        const file = selectedFile;
        if (!file) throw new Error('The selected file is no longer available. Please select it again from the homepage.');
        window.VylensCore.onProgress = (headline,description) => { if(!isFinished)changeMessage(headline,description); };
        result=await window.VylensCore.productReview(file,payload);
        const localReview={...result,conversion:{...result.conversion}};
        let salesReview=null;
        // The file always remains in the browser. A sales URL is inspected separately.
        if(payload.salesPage&&/^https?:\/\//i.test(payload.salesPage)){
          changeMessage('Checking your public sales page…',
            'Inspecting the offer, important linked pages and phone buying steps.');
          try{
            const {scan,sourceOnly,deepError}=await inspectAttachedSalesPage(payload.salesPage);
            salesReview=scan.conversion||null;
            if(salesReview)result.conversion=combineProductAndOffer(
              result.conversion,salesReview,{sourceOnly});
            result.issues.push(...(scan.issues||[]).map(item=>({
              ...item,category:'Sales page · '+String(item.category||'Other'),
              location:'Sales page · '+String(item.location||'Public page')
            })));
            result.checks.push(...(scan.checks||[]).map(item=>({
              ...item,name:'Sales page · '+String(item.name||'Check')
            })));
            result.checked.push('Public sales-page checks');
            result.salesPage=scan.url||payload.salesPage;
            result.salesPageCoverage={
              mode:sourceOnly?'source-only':'rendered',
              inspected:scan.coverage?.inspected||1,
              rendered:scan.coverage?.rendered||0,
              complete:scan.coverage?.complete===true
            };
            result.scope+=' The supplied public sales page was independently inspected '+
              (sourceOnly?'through initial HTML only.':'with supported browser rendering.')+
              ' The private product file was not uploaded.';
            result.summary+=' Public sales-page '+(sourceOnly?'source':'rendered')+' checks completed.';
            if(sourceOnly){
              result.conversion.unverified.push(
                'Full sales-page rendering was unavailable: '+(deepError||'not fully verified')+
                '. Checkout flow and visible dynamic content were not confirmed.');
            }
            result.issues.sort((a,b)=>(
              {critical:0,high:1,note:2}[a.severity]??2)-(
              {critical:0,high:1,note:2}[b.severity]??2));
            result.issues.length=Math.min(result.issues.length,250);
            result.issues.forEach((item,index)=>item.id=index+1);
            result.totalDetected=result.issues.length;
            result.passed=result.passed&&result.issues.length===0&&
              !sourceOnly&&scan.coverage?.complete===true;
          }catch(error){
            result.checks.push({name:'Public sales-page inspection',status:'unverified',
              detail:'Sales page could not be inspected: '+
                String(error?.message||'request failed').slice(0,140)});
            result.scope+=' The public sales page could not be verified.';
            result.conversion.unverified.push('The public sales page could not be verified; '+
              'the file report cannot establish why shoppers did not buy.');
            result.passed=false;
          }
        }
        result.checksRun=result.checks.length;
        // Consent applies only to limited extracted findings; never send original file bytes.
        if(payload.aiProductConsent===true){
          const reviewed=await compareProductWithAi(localReview,salesReview,payload);
          if(reviewed?.status==='completed')result.conversion.aiReview=reviewed;
          else if(reviewed)result.conversion.aiProductStatus=reviewed.status;
        }

      }
      const report = normalizeResults(result);
      stopWaitingMessages();
      await messageQueue;
      // Keep a tiny previous-buyer-finding snapshot for an honest before/after
      // comparison. No original file bytes or browsing history are stored.
      try{
        const previous=JSON.parse(sessionStorage.getItem('vylens:result')||'null');
        const key=value=>{
          if(value.mode==='website'){
            try{
              const u=new URL(value.url);return u.origin+u.pathname.replace(/\/$/,'');
            }catch{return '';}
          }
          return String(value.subject||'').trim().toLowerCase();
        };
        const same=previous&&previous.mode===report.mode&&
          !sessionStorage.getItem('vylens:imported')&&key(previous)===key(report);
        const buyer=previous?.conversion;
        if(same&&buyer?.version===1&&Array.isArray(buyer.blockers)){
          sessionStorage.setItem('vylens:previous-conversion',JSON.stringify({
            mode:previous.mode,sourceKey:key(previous),checkedAt:previous.checkedAt||null,
            complete:previous.coverage?.complete===true,
            blockers:buyer.blockers.slice(0,20).map(item=>({
              fingerprint:String(item.fingerprint||'').slice(0,350),
              affectedPages:Array.isArray(item.affectedPages)?item.affectedPages.slice(0,10):[],
              destinationPath:String(item.destinationPath||'').slice(0,160),
              stage:String(item.stage||'').slice(0,40),
              title:String(item.title||'').slice(0,155),
              location:String(item.location||'').slice(0,190)
            }))
          }));
        }else sessionStorage.removeItem('vylens:previous-conversion');
      }catch{sessionStorage.removeItem('vylens:previous-conversion');}
      // Do not store source bytes; keep only limited findings in this tab's session.
      sessionStorage.setItem('vylens:result', JSON.stringify(report));
      sessionStorage.removeItem('vylens:imported');
      // Avoid rerunning a completed (potentially expensive) inspection when this page is refreshed.
      sessionStorage.removeItem('vylens:pending');
      const limited=report.mode==='website'&&(report.coverage?.complete===false||!report.conversion?.renderedPages);
      await changeMessage(limited?'Your review is ready with coverage gaps.':'Your review is ready.',
        limited?'Opening the available evidence and what to verify next.':'Opening your findings and improvement plan.');
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
