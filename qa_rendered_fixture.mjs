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
  const offer='<html><head><title>Offer page</title></head><body><main>'+
    '<h1>Welcome</h1><p>Pricing starts at $19.</p>'+
    '<a href="/pricing">Learn more</a></main></body></html>';
  await page.setContent(offer,{waitUntil:'load'});
  const buying=await engine.captureCommerceSignals(page);
  assert.equal(buying.heading,'Welcome','commercial headline captured from real rendered DOM');
  assert.ok(buying.hasPrice&&buying.priceSamples.includes('$19'),'public price text captured');
  assert.ok(buying.actions.some(x=>x.label==='Learn more'),'main-content action captured');
  const conversion=engine.analyzeWebsiteConversion([
    {url:'https://example.org/',status:'rendered',commerce:buying}
  ],{coverage:{complete:true}});
  assert.ok(conversion.blockers.some(x=>x.stage==='clarity'),'generic offer headline flagged as a possible concern');
  assert.ok(conversion.blockers.some(x=>x.stage==='action'),'ambiguous CTA flagged as possible friction');
  assert.ok(conversion.blockers.every(x=>x.evidence&&x.fix&&x.verify&&x.buyerConcern));
  assert.ok(conversion.unverified.some(x=>x.includes('Actual sales')),'no customer conversion claims');
  // A footer policy is not automatically purchase-adjacent evidence.
  const policyFar='<html><body><main><h1>Buy a toolkit</h1><p>$29 one-time</p>'+
    '<button>Buy now</button></main><footer style="margin-top:1600px">'+
    '<a href="/terms">Terms and refund information</a></footer></body></html>';
  await page.setContent(policyFar,{waitUntil:'load'});
  const far=await engine.captureCommerceSignals(page);
  assert.equal(far.hasPurchaseTerms,true);
  assert.equal(far.termsNearAction,false,'footer link far from the CTA is not buyer-adjacent');
  const farReport=engine.analyzeWebsiteConversion([{url:'https://example.org/',status:'rendered',commerce:far}],
    {coverage:{complete:true}});
  assert.ok(farReport.blockers.some(x=>x.stage==='trust'),'footer-only terms are a reviewable context signal');
  const near='<html><body><main><h1>Buy a toolkit</h1><p>$29 one-time</p>'+
    '<button>Buy now</button><a href="/terms">Terms and refund information</a></main></body></html>';
  await page.setContent(near,{waitUntil:'load'});
  const nearby=await engine.captureCommerceSignals(page);
  assert.equal(nearby.termsNearAction,true,'terms beside the CTA are detected');
  const disclosure='<html><body><main><section><h1>Buy this product</h1>'+
    '<p>$29 one-time</p><button>Buy now</button><p>All sales final.</p>'+
    '</section></main></body></html>';
  await page.setContent(disclosure,{waitUntil:'load'});
  const plainTerms=await engine.captureCommerceSignals(page);
  assert.equal(plainTerms.termsNearAction,true,
    'nearby plain-text purchase conditions are recognized, without requiring a link');
  const late='<html><body><main><h1>Digital toolkit</h1><p>$29 one-time</p>'+
    '<div style="height:1700px"></div><a href="/purchase">Buy now</a></main></body></html>';
  await page.setContent(late,{waitUntil:'load'});
  const lateSignals=await engine.captureCommerceSignals(page);
  assert.ok(lateSignals.actions.some(x=>x.label==='Buy now'&&x.inFirstView===false&&x.top>1100),
    'first screen visibility is measured, not guessed from button text');
  // Regression: score links with the word Purchase are not transactional CTAs.
  await page.setContent('<html><body><main><h1>Purchase readiness audit</h1>'+
    '<p>The audit is available for $5.</p><a href="/score" style="display:block;margin-top:1200px">'+
    'Purchase Readiness 64/100</a></main></body></html>',{waitUntil:'load'});
  const scoreSignals=await engine.captureCommerceSignals(page);
  assert.ok(scoreSignals.actions.some(x=>x.label==='Purchase Readiness 64/100'&&
    x.isPurchaseAction===false),'score link is informational, not a buying action');
  assert.ok(!engine.analyzeWebsiteConversion([
    {url:'https://example.org/',status:'rendered',commerce:scoreSignals}
  ],{coverage:{complete:true}}).blockers.some(x=>/main buying action may appear late|purchase terms/i.test(x.title)),
  'score link must not create purchase CTA or missing-terms blocker');
  await page.close();
  console.log('PASS: Chromium checks true buying CTAs separately from informational purchase-readiness scores.');
}finally{await browser.close();}
