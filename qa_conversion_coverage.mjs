import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {_test as browserAudit} from './api/inspect-site.mjs';
import {analyzeWebsiteConversion as diagnose} from './lib/conversion-engine.mjs';

const root=new URL('https://offer.example.org');
const testState={root,rules:[],page:0};
const request=(path,method='GET',type='fetch')=>({
  url:()=>new URL(path,root).href,method:()=>method,resourceType:()=>type
});
assert.ok(browserAudit.browserResource(request('/api/public-offer'),testState));
assert.equal(browserAudit.browserResource(request('/api/public-offer','POST'),testState),null);
assert.equal(browserAudit.browserResource(request('/api/public-offer','GET','document'),testState),null);
assert.equal(browserAudit.browserResource(request('https://another.example.org/api/public-offer'),testState),null);
assert.equal(browserAudit.browserResource(request('/checkout'),testState),null);
assert.equal(browserAudit.browserResource(request('/api/public-offer?token=fixture'),testState),null);

const browser=await playwright.launch({
  executablePath:await chromium.executablePath(),args:chromium.args,headless:true
});
const before=process.env.VYLENS_BASELINE?await import(pathToFileURL(process.env.VYLENS_BASELINE+'/api/inspect-site.mjs')):null;
const context=await browser.newContext();
const page=await context.newPage();
const session={page,state:{root,rules:[],page:0}};
const frame=(body,head='')=>'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<style>body{font:16px sans-serif;color:#141414;background:#fff} a,button{display:inline-block;padding:10px}</style>'+head+
  '</head><body><main>'+body+'</main></body></html>';
const offer='<h1>Automated site reports for independent merchants</h1>'+
  '<p>See which product details customers need before choosing a plan for your online store.</p>';
const snapshots=[];
const scan=async (path,html)=>{
  const url=new URL(path,root).href;
  await page.route(url,route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  const actual=await browserAudit.rendered(session,url);
  await page.unroute(url);
  assert.ok(actual.browser);
  return {url,status:'rendered',entry:path==='/',commerce:actual.commerce,visit:actual};
};
const compare=async (name,snapshot,opts={})=>{
  const next=diagnose([snapshot],opts);
  if(before){
    const b=await context.newPage();
    await b.setViewportSize({width:1280,height:800});
    try{
      await b.route(snapshot.url,route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:snapshot.visit.html}));
      await b.goto(snapshot.url);
      const commerce=await before._test.captureCommerceSignals(b);
      await b.setViewportSize({width:390,height:844});
      const phone=await before._test.captureCommerceSignals(b);
      const old=before._test.analyzeWebsiteConversion([{...snapshot,commerce:{...commerce,mobileActions:phone.actions,
        mobilePriceVisible:phone.hasPrice,mobilePriceSamples:phone.priceSamples}}],opts);
      snapshots.push({fixture:name,old:{findings:old.blockers.map(x=>x.title),strengths:old.strengths.map(x=>x.title)},
        new:{findings:next.blockers.map(x=>x.title),strengths:next.strengths.map(x=>x.title)}});
    }finally{await b.close();}
  }
  return next;
};
try{
  await page.route('**/api/public-offer',route=>route.fulfill({json:{heading:'Get a practical website audit'}}));
  const spa=await scan('/',frame('<div id="app" aria-busy="true">Loading…</div><script>'+
    'setTimeout(async()=>{const data=await fetch("/api/public-offer").then(r=>r.json());'+
    'document.querySelector("main").innerHTML="<h1>"+data.heading+"</h1><p>Analyze your store and get a free website audit with concrete improvements.</p><button>Check My Website Free →</button>";},850);'+
    '</script>'));
  assert.equal(spa.commerce.heading,'Get a practical website audit');
  assert.ok(spa.commerce.mobileCaptured,'fresh phone navigation renders as well');
  const spaResult=await compare('Hydrated public API and service CTA',spa);
  assert.equal(spaResult.blockers.length,0);
  assert.ok(spaResult.strengths.some(x=>x.stage==='action'&&x.evidence.includes('Check My Website Free')),JSON.stringify({actions:spa.commerce.actions,strengths:spaResult.strengths}));

  const hidden=await scan('/offer',frame(offer+'<section class="pricing"><p class="desktop">$19 one-time</p>'+
    '<a class="desktop" href="/purchase/basic">Buy now</a><p>All sales final.</p></section>',
    '<style>@media(max-width:500px){.desktop{display:none}}</style>'));
  assert.equal(hidden.commerce.mobileCaptured,true);
  assert.equal(hidden.commerce.mobileActions.length,0);
  const hiddenResult=await compare('Purchase action and price hidden at 390px',hidden);
  assert.ok(hiddenResult.blockers.some(x=>x.title.includes('buying action was not detected')));
  assert.ok(hiddenResult.blockers.some(x=>x.title.includes('desktop price was not detected')));

  const clean=await scan('/pricing',frame(offer+'<section id="pricing"><article><h2>Basic</h2><p>$0</p>'+
    '<button>Try for free</button></article><article><h2>Pro</h2><p>$29 / month</p><a href="/purchase/pro">Buy now</a>'+
    '<a href="/terms">Terms and refunds</a></article></section>'));
  const cleanResult=await compare('Clean multi-tier offer with adjacent terms',clean);
  assert.equal(cleanResult.blockers.length,0);
  assert.deepEqual(clean.commerce.priceSamples,['$0','$29 / month']);

  const broken=await scan('/pricing/broken',frame(offer+
    '<p>Buy access for $19</p><a id="buy" href="/purchase/basic">Buy now</a><p>All sales final.</p>'));
  const link={url:root.origin+'/purchase/basic',path:'/purchase/basic',referrer:'/pricing/broken',
    label:'Buy now',locator:'#buy',kind:'action',state:'broken',status:404};
  const brokenResult=await compare('Confirmed broken purchase destination',broken,{destinations:[link,link]});
  assert.equal(brokenResult.blockers.filter(x=>x.priority==='high').length,1);
  assert.match(brokenResult.blockers[0].evidence,/HTTP 404 twice/);
  assert.ok(!brokenResult.strengths.some(x=>x.stage==='action'));

  const anchor=await scan('/offer/draft',frame('<h1>Buy an analytics report</h1><p>TODO: Describe the report.</p>'+
    '<a id="first" href="#missing">Buy now</a><a href="#missing">Buy now</a>'));
  const anchorResult=await compare('Unfinished offer and duplicate missing purchase anchor',anchor);
  assert.equal(anchorResult.blockers.filter(x=>x.title.includes('missing page section')).length,1);
  assert.ok(anchorResult.blockers.some(x=>x.title.includes('Unfinished copy')));

  const phoneFail=await scan('/offer/phone',frame(offer+'<a href="/purchase/basic">Buy now</a><script>'+
    'if(innerWidth<500)document.querySelector("main").textContent="Please wait…";</script>'));
  assert.equal(phoneFail.commerce.mobileCaptured,false);
  const phoneResult=await compare('Unavailable phone render keeps desktop evidence',phoneFail,{coverage:{complete:false,gaps:[
    {path:'/offer/phone',reason:phoneFail.visit.mobileGap}
  ]}});
  assert.ok(phoneResult.strengths.some(x=>x.stage==='action'));
  assert.ok(!phoneResult.blockers.some(x=>x.title.includes('not detected in the mobile')));
  assert.ok(phoneResult.unverified.some(x=>x.includes('390px')));

  const source=diagnose([],{coverage:{complete:false,sourceOnly:1}});
  assert.equal(source.blockers.length,0);
  assert.ok(source.unverified.some(x=>x.includes('source-only')));
  assert.ok(!cleanResult.blockers.some(x=>x.stage==='trust'));
  if(snapshots.length)console.log(JSON.stringify(snapshots,null,2));
  console.log('PASS conversion coverage: route policy, hydration, fresh phone navigation, evidence deduplication, source-only and controls');
}finally{await browser.close();}
