(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const state={mode:'website',payload:null,data:null,selected:0};
  const MAX_FILE=15*1024*1024;
  const typeNames={website:'Website',product:'Digital product'};
  function setText(selector,value){const el=$(selector); if(el)el.textContent=String(value ?? '');}
  function setStage(i,status='working'){
    $$('.work-step').forEach((el,j)=>{el.classList.toggle('is-current',j===i);el.classList.toggle('is-done',j<i);el.setAttribute('aria-current',j===i?'step':'false')});
    const b=$('#subjectStatus'); b.classList.toggle('is-working',status==='working');b.classList.toggle('is-error',status==='error');
    setText('#statusLabel',status==='error'?'Inspection stopped':i===3?'First look ready':i===2?'Reviewing findings':i===1?'Inspecting source':'Getting ready');
  }
  function setLoading(heading,description){setText('#loadingLabel',heading);setText('#loadingDescription',description);}
  function showError(message){setStage(1,'error');setText('#errorMessage',message);$('#loadingView').hidden=true;$('#readyView').hidden=true;$('#errorView').hidden=false;$('#deepCard').hidden=true;setText('#resultHeading','We hit a snag.');setText('#findingCount','!')}
  function setMode(mode){state.mode=mode;
    setText('#modePill',mode==='website'?'Website inspection':'Digital product inspection');
    setText('#sourceType',typeNames[mode]);
    setText('#deepPrice',mode==='website'?'$19':'$9');
    setText('#sourceScope',mode==='website'?'Initial HTML':'Local file inspection');
    setText('#privacyStrip',mode==='website'?'We request public HTML only. No payment or account is required.':'The file is analyzed in your browser and is not uploaded to VYLENS. No payment is required.');
  }
  function valueError(e){return (e&&typeof e.message==='string'&&e.message)?e.message:'Something interrupted this inspection.'}
  function output(data){
    state.data=data;state.selected=0;
    setStage(2);
    const list=Array.isArray(data.issues)?data.issues.slice(0,3):[];
    $('#errorView').hidden=true;$('#loadingView').hidden=true;$('#readyView').hidden=false;$('#deepCard').hidden=false;
    setText('#findingCount',String(list.length).padStart(2,'0'));
    setText('#resultHeading',list.length?'Blind spots, made visible.':'A clean first pass.');
    setText('#resultLead',data.scope||'This is a limited first-look inspection.');
    setText('#resultStatusText',list.length?`Found ${list.length} issue${list.length===1?'':'s'} in the supported checks`:'Supported checks completed');
    setText('#sourceTitle',data.pageTitle||data.subject||'Submitted source');
    setText('#sourceDescription',data.summary||'Only details that could be read from the source are shown.');
    setText('#sourceDomain',data.subject||'Your source');
    setText('#subjectName',data.subject||'Your source');
    setText('#subjectMeta',data.meta||'Initial inspection completed');
    setText('#scopeNote',data.scope||'This report only covers the supported checks.');
    setText('#sourceScope',data.coverageLabel||'Source checks');
    const coverage=$('#coverageList');coverage.replaceChildren();
    (data.checked||[]).forEach(t=>{const row=document.createElement('div');row.className='coverage-row';const dot=document.createElement('span');dot.className='coverage-check';dot.textContent='✓';row.append(dot,document.createTextNode(t));coverage.append(row)});
    const rail=$('#findingRail');rail.replaceChildren();
    list.forEach((finding,i)=>{
      const b=document.createElement('button');b.type='button';b.className='finding-choice';b.setAttribute('aria-pressed',String(i===0));
      const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');
      const title=document.createElement('strong');title.textContent=finding.title;
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 24 24');const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','m9 18 6-6-6-6');arrow.append(p);
      b.append(n,title,arrow);b.addEventListener('click',()=>selectFinding(i));rail.append(b);
    });
    $('#findingDetail').hidden=!list.length;$('#emptyFindings').hidden=!!list.length;
    if(list.length)selectFinding(0);
    const more=(Number(data.totalDetected)||list.length)-list.length;
    $('#moreIndicator').hidden=more<=0;
    if(more>0)setText('#moreIndicator',`${more} additional source-level check${more===1?'':'s'} flagged possible issues. A deeper review is needed to prioritize them.`);
    const subject=data.subject||'source';
    const link=$('#deepAction');link.href=`mailto:hello.skyorigin@gmail.com?subject=${encodeURIComponent(`VYLENS ${state.mode==='website'?'Website':'Digital Product'} Full Review Request`)}&body=${encodeURIComponent(`Hello VYLENS,\n\nI'd like a full review of ${subject}.\n\nPlease share what is included and how the one-time payment works.\n\nThanks!`)}`;
    setStage(3,'ready');
  }
  function selectFinding(index){
    const list=state.data?.issues||[];const f=list[index];if(!f)return;state.selected=index;
    $$('.finding-choice').forEach((b,i)=>{b.classList.toggle('is-selected',i===index);b.setAttribute('aria-pressed',String(i===index))});
    setText('#detailCategory',(f.category||'REVIEW').toUpperCase());setText('#detailSeverity',(f.severity||'review').toUpperCase());
    const label=$('#detailSeverity');label.className='severity-tag '+(['high','low'].includes(f.severity)?f.severity:'medium');
    setText('#detailTitle',f.title);setText('#detailEvidence',f.evidence);setText('#detailFix',f.fix);
  }
  async function takeFile(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('Your browser cannot access the selected file. Please choose a newer browser.'));return}
      const request=indexedDB.open('vylens-transient',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('transfer');
      request.onerror=()=>reject(new Error('The browser could not open temporary file storage.'));
      request.onsuccess=()=>{
        const db=request.result;const transaction=db.transaction('transfer','readwrite');const store=transaction.objectStore('transfer');const get=store.get('product');
        get.onsuccess=()=>{const item=get.result;store.delete('product');resolve(item)};
        get.onerror=()=>reject(new Error('The selected file could not be read.'));
        transaction.oncomplete=()=>db.close();
        transaction.onerror=()=>reject(new Error('Temporary file retrieval failed.'));
      };
    });
  }
  function addIssue(issues,category,severity,title,evidence,fix){issues.push({id:issues.length+1,category,severity,title,evidence,fix})}
  function sourceTextReview(text,kind,filename,extra={}){
    const issues=[];const normalized=text.replace(/\s+/g,' ').trim();const words=normalized?normalized.split(/\s+/).length:0;
    const headings=kind==='markdown'? (text.match(/^#{1,4}\s+\S/gm)||[]).length : (text.match(/^[^\n]{3,70}\n(?:[-=]{3,})/gm)||[]).length;
    if(words===0)addIssue(issues,'Readability','high','Readable text not found',`No readable text was extracted from ${filename}. This could be a scanned or image-only document.`, 'Add a searchable text layer, or share pages that can be inspected visually.');
    else if(words<120)addIssue(issues,'Content depth','medium','Very little readable content',`Only ${words} words were available in this first-look extract. Whether that is enough depends on the intended format.`, 'Check that the file includes everything promised in your product description.');
    if(words>700 && headings===0 && kind!=='pdf')addIssue(issues,'Content structure','medium','Long text without clear section markers',`Around ${words.toLocaleString()} words were found, but this ${kind.toUpperCase()} file has no recognized heading markers.`, 'Use clear section headings, shorter paragraphs and navigational structure to improve scanning.');
    if(kind==='markdown' && text.includes('TODO'))addIssue(issues,'Completeness','low','Unfinished placeholder text found','The text contains “TODO”, which could be an internal note not meant for buyers.', 'Review internal notes and placeholders before publishing.');
    if(kind!=='pdf' && words>1000 && !/copyright|license|terms of use|usage rights|personal use/i.test(text))addIssue(issues,'Distribution details','low','Usage rights not immediately detectable','This content extract does not mention a license or permitted usage. That may be intentional, depending on how you sell the product.','If buyers need usage or redistribution rights, explain those terms clearly at purchase or in the file.');
    return {issues,words,headings};
  }
  async function pdfReview(file,issues){
    setLoading('Reading document pages','Extracting text locally so you can see document-specific feedback.');
    let library;
    try{library=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs')}
    catch{throw new Error('PDF text reader could not load. Please check your internet connection and retry; your file has not been uploaded.')}
    library.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    let doc;
    try{doc=await library.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise}
    catch{throw new Error('This PDF could not be opened. If it is password protected, unlock it before inspecting.')}
    const pages=doc.numPages;let text='';let sampled=0;
    const limit=Math.min(pages,12);
    for(let i=1;i<=limit;i++){
      const page=await doc.getPage(i);const content=await page.getTextContent();text+='\n'+content.items.map(x=>x.str||'').join(' ');sampled++;
    }
    const review=sourceTextReview(text,'pdf',file.name);
    issues.push(...review.issues);
    if(pages>12)addIssue(issues,'Review coverage','low','Only the first 12 pages were sampled',`This PDF contains ${pages} pages. Initial text extraction covered the first 12, not the entire document.`, 'Check the remaining pages before making publishing decisions.');
    return {pages,sampled,words:review.words,text};
  }
  function parseZipNames(bytes){
    const d=new DataView(bytes);let eocd=-1;
    for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i--){if(d.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error('This ZIP archive has no readable central directory.');
    const n=d.getUint16(eocd+10,true);const offset=d.getUint32(eocd+16,true);
    if(n>2000||offset>bytes.byteLength)throw new Error('This ZIP archive is too complex for a quick file-list check.');
    let ptr=offset;const names=[];
    for(let i=0;i<n;i++){
      if(ptr+46>bytes.byteLength||d.getUint32(ptr,true)!==0x02014b50)break;
      const size=d.getUint16(ptr+28,true),ext=d.getUint16(ptr+30,true),com=d.getUint16(ptr+32,true);
      if(ptr+46+size>bytes.byteLength)break;
      names.push(new TextDecoder().decode(new Uint8Array(bytes,ptr+46,size)).slice(0,220));
      ptr+=46+size+ext+com;
    }
    if(!names.length)throw new Error('Could not read files inside this ZIP.');
    return names;
  }
  async function productReview(file,payload){
    if(!file || !file.name || file.size<=0 || file.size>MAX_FILE)throw new Error('The selected file is missing or outside the supported 15 MB limit.');
    const name=file.name,ext=(name.match(/\.([a-z0-9]+)$/i)?.[1]||'').toLowerCase();
    if(!['pdf','txt','md','zip','png','jpg','jpeg','webp'].includes(ext))throw new Error('This file type is not supported in the first-look inspection.');
    const checked=[],issues=[];let pageTitle=name;let summary='This is a local file check, not an AI visual design review.';
    let coverageLabel='File basics';let meta=`${(file.size/1024/1024).toFixed(2)} MB · local file`;
    if(['txt','md'].includes(ext)){
      const text=await file.text();const rev=sourceTextReview(text,ext==='md'?'markdown':'text',name);
      issues.push(...rev.issues);checked.push('Readable content','Word count','Section markers','Common placeholders');
      pageTitle=name;summary=`${rev.words.toLocaleString()} readable words found. Use these findings as an initial structural review.`;
      coverageLabel='Text content';meta=`${rev.words.toLocaleString()} words · text only`;
    }else if(ext==='pdf'){
      const rev=await pdfReview(file,issues);checked.push('PDF access','Readable text in sampled pages','Page count','Basic content completeness');
      summary=`${rev.pages} document page${rev.pages===1?'':'s'}; first ${rev.sampled} page${rev.sampled===1?'':'s'} checked for text.`;
      coverageLabel='PDF text extract';meta=`${rev.pages} pages · ${rev.words.toLocaleString()} extracted words`;
    }else if(ext==='zip'){
      const bytes=await file.arrayBuffer();const names=parseZipNames(bytes);const files=names.filter(x=>!x.endsWith('/'));
      const hasGuide=names.some(x=>/(^|\/)(readme|start[-_ ]?here|instructions|how[-_ ]?to)\b/i.test(x));
      if(!hasGuide && files.length>2)addIssue(issues,'Onboarding','medium','No getting-started file detected',`Found ${files.length} files, but no filename resembling README, START HERE or instructions.`, 'Include short usage instructions so buyers can confidently open and use the bundle.');
      if(files.length===0)addIssue(issues,'Completeness','high','Archive contains no regular files','The archive listing appears to contain only folders.','Include the actual product deliverables before publishing.');
      if(files.length>30 && !names.some(x=>x.includes('/')))addIssue(issues,'File organization','low','Many files are stored at the archive root',`There are ${files.length} regular files and no visible folder hierarchy.`, 'Group related assets into clearly named folders when helpful.');
      checked.push('Archive file list','Basic organization','Getting-started file presence');
      summary=`${files.length} file${files.length===1?'':'s'} found. File contents were not opened or evaluated.`;
      coverageLabel='ZIP file list';meta=`${files.length} files · archive structure`;
    }else{
      let bitmap;
      try{bitmap=await createImageBitmap(file)}catch{throw new Error('The image could not be decoded by this browser.')}
      const w=bitmap.width,h=bitmap.height;bitmap.close();
      if(w<650||h<450)addIssue(issues,'Presentation','medium','Image resolution may limit reuse',`The image is ${w} × ${h} pixels. It may look soft in larger marketing layouts.`, 'Keep a higher-resolution master if this image is meant for large previews or print.');
      if(file.size>5*1024*1024)addIssue(issues,'Delivery','low','Large single-image file',`This image is ${(file.size/1024/1024).toFixed(1)} MB. Large files can slow previews and downloads.`, 'Test an optimized export while keeping the source-quality original.');
      checked.push('Readable image','Pixel dimensions','File size');
      summary=`Image dimensions: ${w} × ${h}. The image itself has not been visually judged or understood by AI.`;
      coverageLabel='Image metadata';meta=`${w} × ${h} px · local image`;
    }
    if(payload.price && !/^\s*[\$€£₹]?\s*\d+(?:[.,]\d{1,2})?\s*$/.test(payload.price)){
      addIssue(issues,'Offer context','low','Price context needs clarification',`The price field contains “${payload.price.slice(0,30)}”, which was not recognized as a simple amount.`, 'State the price and currency clearly on your sales page.');
    }
    const order={high:0,medium:1,low:2};issues.sort((a,b)=>order[a.severity]-order[b.severity]);issues.forEach((v,i)=>v.id=i+1);
    return {mode:'product',subject:name,pageTitle,summary,meta,coverageLabel,checked,issues:issues.slice(0,3),totalDetected:issues.length,scope:'Local first-look file inspection only. Visual design, buyer intent, sales performance and claims about why a product is not selling cannot be established from metadata or text alone. Your file is not uploaded.',passed:issues.length===0};
  }
  async function inspect(){
    $('#retryButton').disabled=true;$('#loadingView').hidden=false;$('#errorView').hidden=true;$('#readyView').hidden=true;$('#deepCard').hidden=true;
    $('#findingCount').textContent='—';setText('#resultHeading','Your first look.');setText('#resultLead','Evidence comes from the submitted source, not an invented score.');
    setStage(0);setLoading('Preparing your inspection','Checking the material you provided.');
    try{
      let result;
      if(state.mode==='website'){
        const url=state.payload?.url;if(!url)throw new Error('No website was provided. Start a new inspection from the homepage.');
        setText('#subjectName',new URL(url).hostname);setText('#sourceDomain',new URL(url).hostname);
        setStage(1);setLoading('Reading public HTML','Checking the page title, headings, metadata and accessibility basics.');
        const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),16000);
        let response;try{response=await fetch('./api/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:ctrl.signal,cache:'no-store'})}finally{clearTimeout(t)}
        let data;try{data=await response.json()}catch{throw new Error('The inspection service returned an unreadable response. Please try again.')}
        if(!response.ok)throw new Error(data?.error||'The website could not be reached.');
        result={...data,summary:data.pageTitle?'Page title captured from the initial HTML.':'The page title could not be captured.',meta:'Public HTML · no visual rendering',coverageLabel:'Page source'};
      }else{
        let file=state.file;
        if(!file){const item=await takeFile();file=item?.file;state.file=file}
        if(!file)throw new Error('Your selected file is no longer in this browser session. Please select it again from the homepage.');
        setStage(1);setLoading('Reading your local file','Checking its supported content and structure.');
        result=await productReview(file,state.payload||{});
      }
      output(result);
    }catch(e){showError(e.name==='AbortError'?'The website inspection timed out. Please try again.':valueError(e))}
    finally{$('#retryButton').disabled=false}
  }
  function printReport(){
    if(!state.data)return;
    const data=state.data;
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rows=(data.issues||[]).map((f,i)=>`<section style="break-inside:avoid;border:1px solid #d7e5cf;padding:16px;margin:12px 0;border-radius:10px"><h2 style="font-size:18px">${i+1}. ${esc(f.title)}</h2><p><b>Severity:</b> ${esc(f.severity)} · <b>Category:</b> ${esc(f.category)}</p><p><b>Evidence:</b> ${esc(f.evidence)}</p><p><b>Suggested improvement:</b> ${esc(f.fix)}</p></section>`).join('')||'<p>No issues detected by the supported checks.</p>';
    const child=window.open('','_blank','width=720,height=750');
    if(child) child.opener=null;
    if(!child){window.print();return}
    child.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VYLENS Free Audit</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#202820;max-width:700px;margin:30px auto;padding:0 22px}h1{line-height:1.15}small{color:#667360}@media print{body{margin:0 auto}}</style></head><body><h1>VYLENS / Free Inspection</h1><p><b>Subject:</b> ${esc(data.subject)}</p><small>${esc(data.scope)}</small>${rows}<p>Generated as a limited first look. Not a paid, comprehensive or visual inspection.</p><script>window.onload=function(){window.print()}<\/script></body></html>`);child.document.close();
  }
  async function init(){
    setText('#workspaceYear',new Date().getFullYear());
    try{state.payload=JSON.parse(sessionStorage.getItem('vylens:pending')||'null')}
    catch{state.payload=null}
    const mode=state.payload?.mode==='product'?'product':'website';setMode(mode);
    if(mode==='website' && state.payload?.url){
      setText('#subjectName',state.payload.url.replace(/^https?:\/\//,'').slice(0,90));
      setText('#sourceDomain',state.payload.url.replace(/^https?:\/\//,'').slice(0,90));
    }
    if(mode==='product'){setText('#subjectName','Your digital product');setText('#sourceType','Digital product');}
    $('#retryButton').addEventListener('click',inspect);
    $('#exportButton').addEventListener('click',printReport);
    await inspect();
  }
  init();
})();
