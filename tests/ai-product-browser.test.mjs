// Browser integration: real landing → local File → inspect → combined report → PDF.
// Public site inspection and Groq responses are mocked, no secrets or network needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const offerBlock={
  stage:'clarity',priority:'review',title:'Buyers may need clearer delivery details',
  evidence:'The published offer promises instant downloads of the full template pack.',
  buyerConcern:'The offer describes files but does not explain how to start using them.',
  fix:'List the supplied files and explain how to begin using the template pack.',
  verify:'Open the public sales page and compare the listed deliverables.',
  location:'/item · public page',source:'Rendered public page'
};
const sale={
  mode:'website',url:'https://store.example/item',subject:'store.example',checkedAt:new Date().toISOString(),
  summary:'2 pages opened, 1 offer page reviewed.',issues:[],checks:[{name:'Public offer',status:'observed',detail:'Offer seen'}],
  coverage:{inspected:2,rendered:2,complete:true,buyerEvidencePages:1},
  conversion:{version:1,kind:'website',blockers:[offerBlock],strengths:[
    {stage:'value',title:'Price present',evidence:'The public offer shows a one-time price of $19.',location:'/item'}
  ],renderedPages:2,inspectedOfferPages:1,journey:[],unverified:[],
  assessment:{version:1,overall:65,signals:[],explanation:'Offer-only view.'},
  aiReview:{status:'completed',signals:[]}}
};
const fallback={...sale,coverage:{inspected:1,rendered:0,complete:false},
  conversion:{version:1,kind:'sales-page-source',blockers:[],strengths:[
    {stage:'clarity',title:'Headline appears in source',
      evidence:'Source headline: Instant downloads of the full template pack.',location:'/item'}],
    journey:[],renderedPages:0,inspectedOfferPages:1,unverified:['Dynamic offer was not verified.']}};
const reviewResult={status:'completed',comparedBoth:true,signals:[{
  title:'Clarify the delivered product guide',stage:'action',
  evidence:'Local file instructions and public offer evidence should be compared.',
  buyerConcern:'New buyers may need a clearer setup guide.',
  fix:'Add a start-here step linked from the public offer.',
  verify:'Read the downloaded guide and the published offer.',
  location:'Local file / /item',confidence:'hypothesis'
}]};

test('browser verifies opt-in product + rendered sales-page + combined PDF and no-consent fallback',async()=>{
  let reviewCalls=0,received=null,deepMode='stream';
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST'&&url.pathname==='/api/inspect-site'){
      if(deepMode==='stream'){
        res.setHeader('content-type','application/x-ndjson; charset=utf-8');
        res.write(JSON.stringify({stage:'rendering'})+'\n');
        res.write(JSON.stringify({stage:'diagnosing'})+'\n');
        res.end(JSON.stringify({report:sale})+'\n');
      }else{
        res.statusCode=deepMode==='rendered'?200:422;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(deepMode==='rendered'?sale:{error:'Rendered buyer offer blocked.'}));
      }
      return;
    }
    if(req.method==='POST'&&url.pathname==='/api/inspect'){
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify(fallback));return;
    }
    if(req.method==='POST'&&url.pathname==='/api/review-product'){
      let raw='';for await(const part of req)raw+=part;
      received=JSON.parse(raw);reviewCalls++;
      res.setHeader('content-type','application/json');res.end(JSON.stringify(reviewResult));return;
    }
    const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const file=resolve(ROOT,'.'+requested);
    if(!file.startsWith(ROOT+'/')){res.statusCode=403;res.end('blocked');return;}
    try{
      const data=await readFile(file);
      const ext=extname(file);
      res.setHeader('content-type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':
        ext==='.html'?'text/html':ext==='.svg'?'image/svg+xml':'application/octet-stream');
      res.end(data);
    }catch{res.statusCode=404;res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width:390,height:800},acceptDownloads:true,reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https:\/\/fonts\./,route=>route.abort());
    const base='http://127.0.0.1:'+server.address().port;
    const asset='# Product guide\nTODO: replace draft introduction before shipping.\n'+'Usage details. '.repeat(50);
    const submit=async(consent)=>{
      await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
      await page.locator('#productTab').click();
      await page.locator('#productFile').setInputFiles({name:'product.md',mimeType:'text/markdown',buffer:Buffer.from(asset)});
      await page.locator('#optionalToggle').click();
      await page.locator('#salesPageUrl').fill('https://store.example/item');
      if(consent)await page.locator('#aiProductConsent').check();
      await page.locator('#submitAudit').click();
      await page.waitForURL(/\/results\.html$/, {timeout:45000});
      await page.locator('#signalReport').waitFor({timeout:12000});
      return page.evaluate(()=>JSON.parse(sessionStorage.getItem('vylens:result')));
    };
    const combined=await submit(true);
    assert.equal(combined.mode,'product');
    assert.equal(combined.salesPageCoverage.mode,'rendered');
    assert.ok(combined.conversion.blockers.some(b=>/public page/i.test(b.source)), 'Sales page blockers retained');
    assert.ok(combined.conversion.blockers.some(b=>/local/i.test(b.source)), 'Local file blockers retained');
    assert.equal(combined.conversion.aiReview.status,'completed');
    assert.equal(reviewCalls,1);
    assert.equal(received.consent,true);
    assert.ok(received.fileEvidence.fileIssues.length>=1);
    assert.ok(received.fileEvidence.salesIssues.length>=1);
    assert.ok(received.fileEvidence.fileSamples.length>=1,'Opted-in product excerpts sent');
    assert.ok(received.fileEvidence.fileSamples[0].excerpt.includes('Product guide'));
    assert.equal('aiEvidenceSamples' in combined,false,'Private text samples must not be saved with report');
    assert.equal(JSON.stringify(received).includes(asset),false,'Original file body must not be forwarded');
    assert.equal(await page.locator('#signalReport .signal-detail-card').count(),5,
      'AI suggestions must not create a sixth top-level card');
    const changeCard=page.locator('#signalReport .signal-detail-card').nth(2);
    await changeCard.locator('summary').first().click();
    assert.ok((await changeCard.innerText()).includes('AI Evidence Review'));
    const event=page.waitForEvent('download',{timeout:14000});
    await page.locator('.signal-download').click();
    const download=await event;
    assert.ok(download.suggestedFilename().endsWith('.pdf'));
    const {stat}=await import('node:fs/promises');
    assert.ok((await stat(await download.path())).size>900,'PDF must contain actual content');

    deepMode='blocked';
    const sourceOnly=await submit(false);
    assert.equal(sourceOnly.salesPageCoverage.mode,'source-only');
    assert.equal(reviewCalls,1,'No private file summary should be sent without opt-in');
    assert.equal('aiEvidenceSamples' in sourceOnly,false);
    assert.equal(sourceOnly.conversion.renderedPages,0);
    assert.ok(sourceOnly.conversion.unverified.some(t=>/rendering was unavailable/i.test(t)));
    assert.deepEqual(errors,[],'No unhandled browser script failures');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
