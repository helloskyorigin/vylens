/* VYLENS local digital product inspection v2. Original file bytes never leave this tab. */
(() => {
  'use strict';
  const MAX_FILE=15*1024*1024;
  const MAX_TEXT=400_000;
  const progress=(heading,description)=>window.VylensCore?.onProgress?.(heading,description);
  async function takeFile() {
    return new Promise((resolve,reject)=>{
      if (!('indexedDB' in window))return reject(new Error('This browser cannot access temporary file storage.'));
      const request=indexedDB.open('vylens-transient',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('transfer'))request.result.createObjectStore('transfer')};
      request.onerror=()=>reject(new Error('Could not open temporary file storage.'));
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction('transfer','readwrite');
        const store=tx.objectStore('transfer');
        const get=store.get('product');
        let result=null;
        get.onsuccess=()=>{
          result=get.result||null;
          // Always remove temporary file bytes, even when the previous tab left stale data.
          store.delete('product');
        };
        get.onerror=()=>tx.abort();
        tx.oncomplete=()=>{
          db.close();
          if(result && (!Number.isFinite(result.addedAt)||Date.now()-result.addedAt>15*60_000))
            reject(new Error('This file selection expired. Choose the file again to keep it private.'));
          else resolve(result);
        };
        tx.onerror=()=>{db.close();reject(new Error('Could not recover the selected file.'))};
        tx.onabort=()=>{db.close();reject(new Error('The temporary file handoff was interrupted.'))};
      };
    });
  }
  function issue(issues,category,severity,title,evidence,fix,location='',verify=''){
    issues.push({category,severity,title,evidence:String(evidence||'').slice(0,650),fix,location,verify});
  }
  function check(checks,name,status,detail){checks.push({name,status,detail:String(detail||'').slice(0,480)});}
  function wordCount(text){return (String(text).trim().match(/\S+/g)||[]).length}
  function inspectText(text,kind,filename,{pageMap=[]}={}){
    const issues=[],checks=[];
    const words=wordCount(text),lines=text.split(/\r?\n/);
    const headingLines=kind==='markdown'?lines.filter(x=>/^#{1,6}\s+\S/.test(x)):
      kind==='text'?lines.filter((x,i)=>i+1<lines.length&&x.trim().length>=3&&x.trim().length<=90&&/^[-=]{3,}$/.test(lines[i+1].trim())):[];
    const placeholders=[...text.matchAll(/\b(?:TODO|TBD|FIXME|lorem ipsum|insert (?:text|content|image|here)|your (?:company|name|brand) here|placeholder)\b/gi)]
      .slice(0,15).map(x=>x[0]);
    check(checks,'Readable content extracted',words?'passed':'attention',`${words.toLocaleString()} whitespace-separated words extracted.`);
    if(!words)issue(issues,'Readability','high','No searchable text was extracted',
      `The inspected ${filename} has no extractable text. This may be intentional for visual assets or a scanned document.`,
      'If buyers need to search or copy instructions, provide a selectable text layer or accessible text version.','File content','Open the file and try selecting or searching a sentence.');
    else if(words<90)issue(issues,'Content coverage','note','Very little readable text was found',
      `${words} words were extracted. This may be fine for a visual template, but check the promised deliverables.`,
      'Compare the actual content to your sales-page promises; add missing instructions if necessary.','File content','Open the purchased deliverable and compare it against the offer.');
    check(checks,'Placeholder markers',placeholders.length===0?'passed':'attention',placeholders.length?
      `${placeholders.length} marker(s) found, including “${placeholders.slice(0,4).join(', ')}”.`:'No common unfinished-draft markers found in readable text.');
    if(placeholders.length)issue(issues,'Completeness','note','Possible template or draft placeholders detected',
      `Detected ${placeholders.length} occurrences of common draft markers, e.g. “${placeholders.slice(0,5).join(', ')}”.`,
      'Review these passages before selling the file. Intentional template placeholders can remain if clearly explained.','Extracted text','Search the file for the listed words and verify each occurrence.');
    if(kind==='markdown'||kind==='text'){
      check(checks,'Section heading markers',headingLines.length?'passed':'observed',`${headingLines.length} recognized heading marker(s).`);
      if(words>900 && !headingLines.length)issue(issues,'Navigation','note','Long text has no recognized section headings',
        `${words.toLocaleString()} words were found without a supported heading marker.`,
        'Consider short section headings to make long guides easier to navigate.','Text structure','Check how quickly readers can locate each section.');
      if(kind==='markdown'){
        const malformed=lines.filter(line=>/!?(?:\[[^\]]+\]\(\s*\)|\[[^\]]*\]\(\s*#\s*\))/.test(line));
        check(checks,'Markdown link destinations',malformed.length?'attention':'passed',malformed.length?
          `${malformed.length} link(s) have empty/placeholder destinations.`:'No empty Markdown link destinations detected.');
        if(malformed.length)issue(issues,'Navigation','high','Markdown links contain empty destinations',
          `${malformed.length} text line(s) include a blank link target.`,
          'Replace placeholder links with working URLs or remove them.','Markdown links','Open the rendered Markdown and click each marked link.');
      }
    }
    if(pageMap.length>2){
      const empty=pageMap.filter(p=>p.words===0).map(p=>p.page);
      check(checks,'Text available on document pages',empty.length?'attention':'passed',empty.length?
        `${empty.length} of ${pageMap.length} inspected pages have no extractable words.`:'All inspected pages have at least some extractable text.');
      if(empty.length>=Math.max(3,Math.ceil(pageMap.length*.6)))issue(issues,'Accessibility','note','Many pages have no extractable text',
        `${empty.length}/${pageMap.length} inspected pages have no text layer (e.g. pages ${empty.slice(0,8).join(', ')}). Visual-only content is not necessarily defective.`,
        'If the PDF is intended to be read, provide searchable text or an accessible alternative.','PDF page text','Open the listed pages and try text selection.');
      const hashes=new Map();for(const p of pageMap){if(p.words<40)continue;const key=p.text.replace(/\s+/g,' ').slice(0,220); hashes.set(key,[...(hashes.get(key)||[]),p.page])}
      const duplicates=[...hashes.values()].filter(pages=>pages.length>=2);
      if(duplicates.length)issue(issues,'Content review','note','Similar page text detected',
        `Several pages share similar opening content, such as pages ${duplicates[0].slice(0,6).join(', ')}. This may be expected with repeated layouts.`,
        'Verify that repeated pages are intentional, not accidental duplicates.','PDF pages','Compare the referenced pages side by side.');
    }
    return {issues,checks,words,headings:headingLines.length};
  }
  async function loadPDFReader(){
    const urls=['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'];
    for(const url of urls){try{const pdf=await import(/* webpackIgnore: true */ url);
      pdf.GlobalWorkerOptions.workerSrc=url.replace('pdf.min.mjs','pdf.worker.min.mjs');return pdf;}catch{}}
    throw new Error('Could not load the PDF reader. Check your connection and retry; your file was not uploaded.');
  }
  async function pdfReview(file){
    progress('Reading your PDF…','Inspecting document pages on your device.');
    const reader=await loadPDFReader();
    let doc;try{doc=await reader.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise}
    catch{throw new Error('This PDF could not be opened. If it requires a password, unlock it first.');}
    const total=doc.numPages;
    // Bound CPU and memory; sample the beginning and end for very long documents.
    const pages=total<=120?Array.from({length:total},(_,i)=>i+1):
      [...Array.from({length:110},(_,i)=>i+1),...Array.from({length:10},(_,i)=>total-9+i)];
    const extracted=[];let stored=0;
    for(let i=0;i<pages.length;i++){
      const page=await doc.getPage(pages[i]); const content=await page.getTextContent();
      const raw=content.items.map(x=>x.str||'').join(' ').trim();
      const capped=raw.slice(0,Math.max(0,MAX_TEXT-stored));stored+=capped.length;
      extracted.push({page:pages[i],words:wordCount(raw),text:capped});
      page.cleanup();
      if(i%12===0)progress('Checking document content…',`Reading page ${pages[i]} of ${total}.`);
    }
    const all=extracted.map(p=>p.text).join('\n'),review=inspectText(all,'pdf',file.name,{pageMap:extracted});
    const issues=review.issues,checks=review.checks;
    for(const item of issues)if(item.title==='No searchable text was extracted')item.severity='note';
    check(checks,'PDF opens and has pages','passed',`${total} page(s) opened successfully.`);
    check(checks,'Page review coverage',pages.length===total?'passed':'observed',
      pages.length===total?`All ${total} pages were read for text content.`:
      `${pages.length}/${total} pages sampled: first 110 and final 10; remaining pages not assessed.`);
    if(pages.length!==total)issue(issues,'Coverage','note','Large PDF reviewed by sampling',
      `Read ${pages.length}/${total} pages rather than the entire PDF.`,
      'Review any untouched pages before drawing conclusions about the complete product.','PDF coverage','Reinspect the remaining pages manually.');
    if(stored>=MAX_TEXT)issue(issues,'Coverage','note','Text evidence was truncated',
      'Extracted text exceeded the local review limit; word counts and draft-marker checks may omit later content.',
      'Review long sections beyond the extracted text limit.','PDF text','Review later PDF pages directly.');
    let outline=[];try{outline=(await doc.getOutline())||[]}catch{}
    check(checks,'PDF navigation outline',outline.length?'passed':'observed',outline.length?
      `${outline.length} top-level bookmark(s) are present.`:'No navigation outline found; this may be fine for short or visual PDFs.');
    if(total>25&&!outline.length)issue(issues,'Usability','note','Long PDF has no bookmark outline',
      `${total} pages were found with no top-level bookmark outline.`,
      'Consider PDF bookmarks or a linked table of contents to help readers navigate long guides.','PDF navigation','Open the bookmark sidebar and verify navigation.');
    const words=extracted.reduce((n,p)=>n+p.words,0);
    await doc.destroy();
    return {issues,checks,summary:`${total} PDF pages. Extracted text from ${pages.length} page(s), with ${words.toLocaleString()} words.`,
      meta:`${total} pages · ${words.toLocaleString()} words`,coverageLabel:'PDF page text & navigation'};
  }
  function unsafeZipPath(name){
    const normalized=String(name).replace(/\\/g,'/');
    return normalized.startsWith('/') || /^[a-z]:\//i.test(normalized) || normalized.split('/').includes('..') || normalized.includes('\0');
  }
  function parseZip(bytes){
    const d=new DataView(bytes),u=new Uint8Array(bytes),start=Math.max(0,bytes.byteLength-65557);
    let eocd=-1;
    for(let i=bytes.byteLength-22;i>=start;i--){if(d.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error('This ZIP has no readable central directory.');
    const count=d.getUint16(eocd+10,true),size=d.getUint32(eocd+12,true),offset=d.getUint32(eocd+16,true);
    if(count===0xffff||size===0xffffffff||offset===0xffffffff)throw new Error('ZIP64 archives are not supported in this beta. Please provide a standard ZIP.');
    if(count>2000||offset+size>bytes.byteLength)throw new Error('This ZIP is too complex or has an invalid file list.');
    const entries=[];let pos=offset;
    for(let i=0;i<count;i++){
      if(pos+46>bytes.byteLength||d.getUint32(pos,true)!==0x02014b50)throw new Error('The ZIP file list is damaged.');
      const flags=d.getUint16(pos+8,true),method=d.getUint16(pos+10,true),comp=d.getUint32(pos+20,true),raw=d.getUint32(pos+24,true),nameLength=d.getUint16(pos+28,true),extra=d.getUint16(pos+30,true),comment=d.getUint16(pos+32,true),local=d.getUint32(pos+42,true);
      if(pos+46+nameLength+extra+comment>bytes.byteLength)throw new Error('ZIP entries are truncated.');
      const name=new TextDecoder('utf-8',{fatal:false}).decode(u.subarray(pos+46,pos+46+nameLength)).slice(0,300);
      entries.push({name,flags,method,compressed:comp,uncompressed:raw,local});
      pos+=46+nameLength+extra+comment;
    }
    return entries;
  }
  async function getZipText(buffer,entry){
    if(entry.compressed>250_000||entry.uncompressed>450_000 || entry.flags&1)return null;
    const data=new DataView(buffer),u=new Uint8Array(buffer),pos=entry.local;
    if(pos+30>buffer.byteLength||data.getUint32(pos,true)!==0x04034b50)return null;
    const start=pos+30+data.getUint16(pos+26,true)+data.getUint16(pos+28,true);
    if(start+entry.compressed>buffer.byteLength)return null;
    const compressed=u.subarray(start,start+entry.compressed);
    if(entry.method===0)return new TextDecoder().decode(compressed.subarray(0,250_000));
    if(entry.method!==8||!('DecompressionStream' in window))return null;
    try{
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader=stream.getReader();let total=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>450_000){await reader.cancel();return null}chunks.push(value)}
      const out=new Uint8Array(total);let p=0;for(const chunk of chunks){out.set(chunk,p);p+=chunk.byteLength}
      return new TextDecoder().decode(out).slice(0,250_000);
    }catch{return null}
  }
  async function zipReview(file){
    progress('Inspecting product bundle…','Reading file names, sizes and usage instructions.');
    const buffer=await file.arrayBuffer(),entries=parseZip(buffer),regular=entries.filter(e=>!e.name.endsWith('/'));
    const issues=[],checks=[];
    check(checks,'ZIP directory readable','passed',`${entries.length} entries enumerated.`);
    check(checks,'Product files present',regular.length?'passed':'attention',`${regular.length} regular file(s) listed.`);
    if(!regular.length)issue(issues,'Completeness','critical','ZIP contains no product files',
      'The central directory contains folders but no actual deliverable files.',
      'Include the downloadable product files before offering this ZIP to buyers.','Archive contents','Extract the ZIP and confirm at least one usable file exists.');
    const total=regular.reduce((n,e)=>n+e.uncompressed,0),empty=regular.filter(e=>!e.uncompressed);
    check(checks,'Nonempty files',regular.length>0&&empty.length<regular.length?'passed':'attention',`${empty.length} zero-byte file(s) of ${regular.length}.`);
    if(empty.length===regular.length&&regular.length)issue(issues,'Completeness','critical','All packaged files are empty',
      `${regular.length} files have zero bytes in the ZIP listing.`, 'Replace empty placeholders with the real deliverables.','ZIP content','Extract several files and confirm they open.');
    else if(empty.length)issue(issues,'Completeness','note','Some ZIP entries are empty',
      `${empty.length} zero-byte files, including ${empty.slice(0,4).map(x=>x.name).join(', ')}.`,
      'Check that empty files are intentional and not missing deliverables.','ZIP file list','Open the named files.');
    const encrypted=regular.filter(e=>e.flags&1),traversal=regular.filter(e=>unsafeZipPath(e.name));
    check(checks,'Archive entry paths',traversal.length?'attention':'passed',traversal.length?`${traversal.length} path(s) contain unsafe directory traversal.`:'No absolute or parent-traversal entry paths detected.');
    if(traversal.length)issue(issues,'Delivery safety','high','Unsafe paths inside ZIP',
      `${traversal.length} entry name(s) contain parent-directory segments or absolute paths.`,
      'Repackage without ../ or absolute-path entries.','ZIP paths','Verify archive extraction stays in the chosen folder.');
    check(checks,'Encrypted entries',!encrypted.length?'passed':'observed',`${encrypted.length} encrypted file(s).`);
    if(encrypted.length)issue(issues,'Access','note','Some files need a password',
      `${encrypted.length} entries are encrypted; their contents could not be reviewed.`,
      'Make sure buyers receive the password and access instructions.','ZIP content','Verify the buyer can extract the product.');
    const names=new Map();for(const e of regular){let key=e.name.replace(/\\/g,'/').toLowerCase();names.set(key,(names.get(key)||0)+1)}
    const repeats=[...names].filter(([,v])=>v>1).map(([k])=>k);
    check(checks,'Unique product filenames',!repeats.length?'passed':'attention',repeats.length?`Repeated paths: ${repeats.slice(0,4).join(', ')}.`:'No case-insensitive duplicate names found.');
    if(repeats.length)issue(issues,'File delivery','high','Product files have duplicate paths',
      `Duplicate (case-insensitive) ZIP names: ${repeats.slice(0,5).join(', ')}. Extraction may overwrite files.`,
      'Rename collisions before publishing.','ZIP file list','Extract on Windows/macOS and check for missing files.');
    const guide=regular.find(e=>/(^|\/)(readme|start[\s_-]?here|instructions|how[\s_-]?to|guide)\b/i.test(e.name)&&/\.(txt|md)$/i.test(e.name));
    const readable=guide?await getZipText(buffer,guide):null;
    check(checks,'Getting-started instructions',guide?(readable===null?'unverified':'passed'):'observed',guide?
      `Guide filename found: ${guide.name}. ${readable===null?'Content not decoded.':'Text content sampled.'}`:'No README/START HERE/instructions filename detected.');
    if(!guide&&regular.length>3)issue(issues,'Onboarding','note','Bundle has no recognizable getting-started file',
      `${regular.length} deliverables were found without a recognizable README/START HERE file.`,
      'Add clear usage and installation instructions where needed.','ZIP onboarding','Give the ZIP to a new user and ask them to locate instructions.');
    if(readable!==null){const rev=inspectText(readable,'text',guide.name);for(const i of rev.issues){
      if(i.severity==='high'&&i.title==='No searchable text was extracted')i.severity='note';
      i.location=`Instructions → ${guide.name}`;
      issues.push(i)
    }
      check(checks,'Instructions readability',rev.words>30?'passed':'observed',`${rev.words} readable words found in guide.`);
    }
    if(total>200*1024*1024)issue(issues,'Delivery','note','Bundle expands to a large download',
      `${(total/1048576).toFixed(1)} MB uncompressed from a ${(file.size/1048576).toFixed(1)} MB ZIP.`,
      'Mention the expanded size and test extraction on common devices.','ZIP download','Extract and inspect available storage requirements.');
    return {issues,checks,summary:`Inspected ${regular.length} file(s) in the ZIP directory${readable!==null?' and read the included guide':guide?' (guide content unavailable)':''}.`,
      meta:`${regular.length} files · ${(total/1048576).toFixed(1)} MB unpacked`,coverageLabel:'ZIP entries + instructions'};
  }
  async function imageReview(file){
    progress('Reading image properties…','Checking dimensions and file integrity locally.');
    let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw new Error('The image could not be decoded by this browser.');}
    const w=bitmap.width,h=bitmap.height;bitmap.close();
    const issues=[],checks=[];
    check(checks,'Image decodes','passed',`Image opened successfully (${w} × ${h}).`);
    check(checks,'Pixel dimensions available','passed',`${w} × ${h} pixels.`);
    if(w<640||h<360)issue(issues,'Asset suitability','note','Image may be small for some uses',
      `Image is ${w} × ${h} px; this is not necessarily an error for icons or thumbnails.`,
      'Keep a higher-resolution export if you plan to use this asset in large layouts.','Image dimensions','Preview the image at intended display size.');
    if(file.size>5*1024*1024)issue(issues,'Delivery','note','Large image file',
      `${(file.size/1048576).toFixed(1)} MB in one image.`,
      'Consider a smaller web export for previews while retaining the original.','Image size','Compare load time and quality at intended sizes.');
    return {issues,checks,summary:`Decoded a ${w} × ${h} image. Visual content and design quality were not judged.`,meta:`${w} × ${h} px`,coverageLabel:'Image metadata'};
  }
  async function productReview(file,payload={}){
    if(!file||!file.name||!file.size||file.size>MAX_FILE)throw new Error('Select a nonempty file no larger than 15 MB.');
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['pdf','txt','md','zip','png','jpg','jpeg','webp'].includes(ext))throw new Error('Choose a supported PDF, TXT, Markdown, ZIP or image file.');
    let result;
    if(ext==='pdf')result=await pdfReview(file);
    else if(ext==='zip')result=await zipReview(file);
    else if(['txt','md'].includes(ext)){
      progress('Reading your content…','Checking the real text and structure.');
      const raw=await file.text(); const r=inspectText(raw,ext==='md'?'markdown':'text',file.name);
      result={issues:r.issues,checks:r.checks,summary:`Read ${r.words.toLocaleString()} words in ${file.name}.`,
        meta:`${r.words.toLocaleString()} words · ${ext.toUpperCase()}`,coverageLabel:'Readable text + structure'};
    }else result=await imageReview(file);
    const issues=result.issues,checks=result.checks;
    check(checks,'Original file accessible','passed',`Read the selected ${ext.toUpperCase()} file locally (${(file.size/1048576).toFixed(2)} MB).`);
    const rank={critical:0,high:1,note:2};issues.sort((a,b)=>(rank[a.severity]??2)-(rank[b.severity]??2));
    issues.forEach((item,i)=>item.id=i+1);
    return {mode:'product',subject:file.name,pageTitle:file.name,summary:result.summary,
      meta:result.meta+(payload.price?` · Listed price: ${String(payload.price).slice(0,30)}`:''),coverageLabel:result.coverageLabel,checkedAt:new Date().toISOString(),
      checked:checks.map(x=>x.name),checks,checksRun:checks.length,issues,totalDetected:issues.length,
      scope:'Local file inspection only; files are not uploaded to VYLENS. PDF text, file structure, ZIP metadata, instruction files and image properties are examined where supported. Visual layout, claim accuracy, buyer intent and sales conversion cannot be determined from these checks alone.',
      engine:'vylens-file-v3',passed:issues.length===0&&!checks.some(c=>c.status==='unverified')};
  }
  window.VylensCore={takeFile,productReview,onProgress:null,_test:{inspectText,parseZip,unsafeZipPath}};
})();
