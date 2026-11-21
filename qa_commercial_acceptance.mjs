import assert from 'node:assert/strict';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { _test as scanner } from './api/inspect-site.mjs';
import { analyzeWebsiteConversion } from './lib/conversion-engine.mjs';

// Scenario-based acceptance tests use ACTUAL rendered browser DOM, rather
// than manually fabricated commerce objects. No external sites are contacted.
const browser=await playwright.launch({
  executablePath:await chromium.executablePath(),
  args:[...chromium.args,'--disable-background-networking'],
  headless:true,timeout:30000
});
const head='<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />'+
  '<style>body{margin:0;font-family:Arial}main{max-width:900px;padding:30px}'+
  'a,button{display:inline-block;padding:15px;margin:6px}p{max-width:600px}</style></head><body>';
const tail='</body></html>';
const offer='<h1>Find and explain buyer obstacles on your public website</h1>'+
  '<p>We help small business founders understand the purchase experience and find clear next steps.</p>';
const page=await browser.newPage({viewport:{width:1280,height:800}});
async function scenario(name,html,path='/'){
  await page.setViewportSize({width:1280,height:800});
  await page.setContent(head+'<main>'+html+'</main>'+tail,{waitUntil:'load'});
  const desktop=await scanner.captureCommerceSignals(page);
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(120);
  const mobile=await scanner.captureCommerceSignals(page);
  const signals={...desktop,mobileActions:mobile.actions,
    mobilePriceVisible:mobile.hasPrice,mobilePriceSamples:mobile.priceSamples};
  const report=analyzeWebsiteConversion([{url:'https://example.org'+path,
    status:'rendered',commerce:signals}],{coverage:{complete:true}});
  assert.ok(Array.isArray(report.blockers)&&report.blockers.every(
    x=>x.stage&&x.evidence&&x.fix&&x.verify&&x.location),
    name+': every blocker needs evidence and verification');
  return {desktop,mobile,report};
}
try{
  const clean=await scenario('clean paid offer',offer+
    '<p>$19 one-time</p><a href="/checkout" id="buy">Buy now</a>'+
    '<small>All sales final</small>');
  assert.equal(clean.report.blockers.length,0,
    'an honest, clear offer must not be flooded with fake blockers');

  const info=await scenario('score not CTA',offer+
    '<p>Audit available for $19</p><a href="/score">Purchase Readiness 64/100</a>');
  assert.equal(info.report.blockers.filter(
    x=>/main buying action|purchase terms/.test(x.title)).length,0,
    'numeric readiness link must never become buying button');

  const vague=await scenario('weak offer',
    '<h1>Welcome</h1><p>Hi.</p><p>$19</p><a href="/pricing">Learn more</a>');
  assert.ok(vague.report.blockers.some(x=>/headline is too generic/i.test(x.title)),
    'vague headline is reviewable');
  assert.ok(vague.report.blockers.some(x=>/action labels/i.test(x.title)),
    'real vague CTA gets a cautious suggestion');

  const below=await scenario('newsletter plus buried buy',
    offer+'<p>$19 one-time</p>'+
    '<form id="newsletter"><label>Email updates <input type="email"></label>'+
    '<button>Subscribe</button></form>'+
    '<div style="height:1200px"></div>'+
    '<a href="/checkout">Buy now</a><small>All sales final</small>');
  assert.ok(below.desktop.actions.some(a=>a.label==='Subscribe'&&a.isNewsletter),
    'newsletter identified as its own flow');
  assert.ok(below.report.blockers.some(x=>x.title.includes('may appear late')),
    'top newsletter cannot conceal purchase CTA that requires scrolling');

  const hiddenBuy=await scenario('mobile hidden checkout',
    '<style>@media(max-width:600px){#buy{display:none}}</style>'+
    offer+'<p>$19</p><a href="/checkout" id="buy">Buy now</a>'+
    '<a href="/learn">Learn more</a><small>All sales final</small>');
  assert.ok(hiddenBuy.report.blockers.some(x=>x.title.includes('not detected in the mobile')),
    'desktop buying button missing on mobile is reviewable');

  const hiddenPrice=await scenario('mobile hidden price',
    '<style>@media(max-width:600px){.price{display:none}}</style>'+
    offer+'<p class="price">$19</p><a href="/checkout">Buy now</a>'+
    '<small>All sales final</small>','/pricing');
  assert.ok(hiddenPrice.report.blockers.some(x=>x.title.includes('desktop price')),
    'actual mobile price disappearance is reported');

  const clipped=await scenario('mobile clipped buy',
    '<style>@media(max-width:600px){#buy{position:absolute;left:340px;width:210px}}</style>'+
    offer+'<p>$19</p><a href="/checkout" id="buy">Buy now</a>'+
    '<small>All sales final</small>');
  assert.ok(clipped.report.blockers.some(x=>x.title.includes('extends beyond the screen')),
    'mobile geometry finds a clipped purchase control');

  assert.equal(scanner.blockedOrChallenge({
    heading:'Just a moment...',
    visibleText:'Checking if the site connection is secure. Verify you are human. Cloudflare Ray ID.'
  }),true,'bot verification must never be treated as offer evidence');
  assert.equal(scanner.blockedOrChallenge({
    heading:'Access denied to the premium package?',
    visibleText:'Our course gives buyers practical steps to access a paid guide and full library.'
  }),false,'ordinary product descriptions must not be confused with a challenge');
  const hindi=await scenario('Hindi public offer copy',
    '<h1>खरीदारी आसान बनाएँ</h1>'+
    '<p>इस उत्पाद से छोटे व्यवसाय अपने ग्राहकों के लिए बेहतर खरीदारी अनुभव बना सकते हैं।</p>'+
    '<p>₹199</p><a href="/checkout">Buy now</a>');
  assert.equal(hindi.desktop.heading,'खरीदारी आसान बनाएँ',
    'real Hindi text is not rejected as filler');
  const chinese=await scenario('Chinese public offer copy',
    '<h1>清晰了解产品服务</h1>'+
    '<p>帮助小型企业改善购买体验，了解客户会遇到哪些问题。</p>'+
    '<p>¥199</p><a href="/checkout">Buy now</a>');
  assert.equal(chinese.desktop.heading,'清晰了解产品服务',
    'real multilingual offers remain readable');
  const gibberish=await scenario('repeated filler does not become proof',
    '<h1>y y y y</h1><p>y y y y y y y y y y y y y y y</p>'+
    '<p>$19</p><a href="/checkout">Buy now</a>');
  assert.equal(gibberish.desktop.heading,'',
    'repeated one-letter headings must not be interpreted as a convincing offer');
  assert.equal(gibberish.desktop.intro,'',
    'repeated filler paragraphs must not become offer evidence');
  assert.ok(!gibberish.report.strengths.some(x=>x.stage==='clarity'),
    'filler text must not result in a positive clarity signal');

  // Position overlay over the actual center rather than guessing document coordinates.
  await page.setViewportSize({width:390,height:844});
  await page.setContent(head+'<main>'+offer+
    '<p>$19</p><button id="buy">Buy now</button>'+
    '<div id="overlay" style="position:fixed;z-index:90;background:#eee"></div>'+
    '<small>All sales final</small></main>'+tail,{waitUntil:'load'});
  await page.evaluate(()=>{
    const r=document.getElementById('buy').getBoundingClientRect();
    const overlay=document.getElementById('overlay');
    Object.assign(overlay.style,{left:r.left+'px',top:r.top+'px',
      width:r.width+'px',height:r.height+'px'});
  });
  const occluded=await scanner.captureCommerceSignals(page);
  assert.equal(occluded.actions.find(a=>a.label==='Buy now')?.centerReachable,false,
    'actual browser hit-test recognizes covered button');
  const review=analyzeWebsiteConversion([{url:'https://example.org/',
    status:'rendered',commerce:{...occluded,mobileActions:occluded.actions}}],
    {coverage:{complete:true}});
  assert.ok(review.blockers.some(x=>x.title.includes('covered by another element')));

  console.log('PASS commercial acceptance: 11 real Chromium offer cases, mobile/desktop evidence and false-positive controls');
}finally{await browser.close();}
