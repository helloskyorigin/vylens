/* Local product file inspection utilities. File bytes never leave this browser. */
(() => {
  'use strict';
  const MAX_FILE = 15 * 1024 * 1024;
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
    window.VylensCore.onProgress?.('Reading document pages…', 'Extracting text from your PDF locally.');
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
      if(files.length===0)addIssue(issues,'Completeness','critical','Archive contains no regular files','The archive listing appears to contain only folders.','Include the actual product deliverables before publishing.');
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
    const order={critical:0,high:1,medium:2,low:3};issues.sort((a,b)=>order[a.severity]-order[b.severity]);issues.forEach((v,i)=>v.id=i+1);
    // Only label checks as passed when the inspected bytes establish a narrow fact.
    const checks = checked.map(name=>({name,status:'observed',detail:'This source property was examined; it is not a complete quality certification.'}));
    if(['txt','md'].includes(ext)){
      checks.unshift({name:'Local file access',status:'passed',detail:'The submitted text file was readable.'});
      if(!issues.some(x=>x.title==='Readable text not found'))checks.push({name:'Readable text present',status:'passed',detail:'Text content could be extracted.'});
    }else if(ext==='pdf'){
      checks.unshift({name:'PDF opens',status:'passed',detail:'The PDF was opened and its page count read locally.'});
      if(!issues.some(x=>x.title==='Readable text not found'))checks.push({name:'Readable PDF text present',status:'passed',detail:'Text was extracted from the pages sampled.'});
    }else if(ext==='zip'){
      checks.unshift({name:'ZIP directory readable',status:'passed',detail:'The archive central directory could be parsed.'});
      if(!issues.some(x=>x.title==='Archive contains no regular files'))checks.push({name:'Regular files present',status:'passed',detail:'At least one regular file was found in the archive listing.'});
    }else{
      checks.unshift({name:'Image decodes',status:'passed',detail:'The browser successfully decoded the image file.'});
      checks.push({name:'Image dimensions available',status:'passed',detail:'Pixel dimensions were read without interpreting the image.'});
    }
    return {mode:'product',subject:name,pageTitle,summary,meta,coverageLabel,checked,checks,checksRun:checks.length,checkedAt:new Date().toISOString(),issues,totalDetected:issues.length,scope:'Local first-look file inspection only. Visual design, buyer intent, sales performance and claims about why a product is not selling cannot be established from metadata or text alone. Your file is not uploaded.',passed:issues.length===0};
  }

  window.VylensCore = { takeFile, productReview, onProgress: null };
})();
