import assert from 'node:assert/strict';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { _test as engine } from './api/inspect-site.mjs';
import {analyzeDeepSignals} from './lib/problem-engine.mjs';

const browser=await playwright.launch({
  executablePath:await chromium.executablePath(),args:[...chromium.args,'--disable-background-networking'],
  headless:true,timeout:30000
});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const clean='<!doctype html><html lang="en"><head><title>Useful resources</title></head>'+
    '<body style="background:white;color:black"><main><h1>Well structured page</h1>'+
    '<p>Helpful details and instructions for readers that make the content clear and usable.</p>'+
    '<button aria-label="Open menu">☰</button><a href="/learn">Learn</a>'+
    '<form><label for="query">Search</label><input id="query"></form></main></body></html>';
  await page.setContent(clean,{waitUntil:'load'});
  const good=await engine.captureRenderedSignals(page);
  assert.equal(good.unnamed.length,0);
  assert.equal(good.missingAlt.length,0);
  assert.equal(good.fragmentLinks.length,0);
  assert.equal(good.duplicateIds.length,0);
  assert.equal(good.quirksMode,false);
  assert.equal(good.hasMain,true);
  assert.equal(analyzeDeepSignals(good,'/').issues.length,0);
  const broken='<html><head><title>Demo</title><style>body{background:white;color:#222}'+
    '.faded{color:#eee;background:#fff}button{background:transparent}'+
    '</style></head><body><main><h1>Broken live demo</h1>'+
    '<p class="faded">This important paragraph is intentionally too faint to read.</p>'+
    '<button id="unlabeled"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3"/></svg></button>'+
    '<a href="#missing">Broken section link</a><a href="#">Join us</a><a href="#">Learn more</a>'+
    '<div id="duplicated">One</div><div id="duplicated">Two</div>'+
    '<form><input type="email" name="email" placeholder="Email"><button>Subscribe</button></form>'+
    '<p>This is otherwise readable content, intended for a test rather than a live product page.</p>'+
    '</main></body></html>';
  await page.setContent(broken,{waitUntil:'load'});
  const bad=await engine.captureRenderedSignals(page);
  assert.ok(bad.unnamed.some(x=>x.includes('unlabeled')),'unlabeled DOM button detected');
  assert.ok(bad.fragmentLinks.some(x=>x.target==='#missing'),'bad hash target detected');
  assert.ok(bad.duplicateIds.some(x=>x.includes('duplicated')),'duplicate IDs found');
  assert.ok(bad.lowContrast.some(x=>x.ratio<4.5),'low contrast measured');
  assert.ok(bad.quirksMode,'missing doctype detected');
  assert.ok(bad.collectsEmail&&!bad.hasPrivacyLink,'email collection without privacy link observed');
  assert.ok(bad.placeholderLinks.length>=2,'placeholder links observed');
  const findings=engine.evaluateRenderedSignals(bad,'/');
  assert.ok(findings.issues.length>=4,'real DOM findings emitted');
  const deeper=analyzeDeepSignals(bad,'/');
  assert.ok(deeper.issues.some(x=>x.title.includes('Quirks Mode')));
  assert.ok(deeper.issues.some(x=>x.title.includes('privacy-policy link')));
  assert.ok(deeper.issues.some(x=>x.title.includes('placeholder destinations')));
  assert.ok(findings.issues.every(x=>x.evidence&&x.fix&&x.location&&x.verify));
  await page.close();
  console.log('PASS: real Chromium fixtures detect accessible-name, anchor, duplicate-ID, contrast, policy-link and quirks problems while preserving clean result.');
}finally{await browser.close();}
