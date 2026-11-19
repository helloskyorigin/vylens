import assert from 'node:assert/strict';
import { _test as source } from './api/inspect.mjs';
import { _test as browser } from './api/inspect-site.mjs';
import {analyzeDeepSignals,analyzeVerifiedMedia,analyzeVerifiedLinks} from './lib/problem-engine.mjs';

const head='<head><title>Useful design tools for independent creators</title>'+
  '<meta name="description" content="Useful tools" />'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta property="og:title" content="Working title">'+
  '<meta property="og:description" content="Working description">'+
  '<link rel="canonical" href="https://target.com/">'+
  '<link rel="icon" href="/favicon.ico"></head>';
const valid='<html lang="en">'+head+'<body><main><h1>Tools for creators</h1><h2>How it works</h2>'+
  '<a href="/contact">Contact</a><img src="/logo.webp" alt="logo"></main></body></html>';
assert.equal(source.review(valid,'https://target.com/',{status:200}).issues.length,0,'valid page remains clean');

const brokenMeta=valid.replace('href="https://target.com/"','href=""')
  .replace('content="Working title"','content=""')
  .replace('content="Working description"','content=" "')
  .replace('href="/favicon.ico"','href=""');
const bad=source.review(brokenMeta,'https://target.com/',{status:200});
assert.ok(bad.issues.some(x=>x.title==='Canonical URL target is empty or invalid'),'detect empty canonical');
assert.ok(bad.issues.some(x=>x.title==='Social preview fields incomplete'),'detect empty Open Graph values');
assert.ok(bad.issues.some(x=>x.title==='Favicon not declared'),'detect empty favicon target');
const cross=source.review(valid.replace('https://target.com/','https://othersite.com/'),'https://target.com/',{status:200});
assert.ok(cross.issues.some(x=>x.title==='Canonical URL points to another domain'),'detect cross-domain canonical');
assert.ok(cross.issues.find(x=>x.title==='Canonical URL points to another domain').severity==='note');

const clean={quirksMode:false,textSize:930,mainTextMeasured:true,hasVisualApp:false,
  placeholderLinks:[],mobileClipped:[],collectsEmail:false,hasPrivacyLink:false};
const clear=analyzeDeepSignals(clean,'/');
assert.equal(clear.issues.length,0,'clean measured page gets zero issues');
assert.ok(clear.checks.length>=5,'audit trail remains available');
assert.equal(clear.checks.find(x=>x.name.includes('Privacy link')).status,'unverified',
  'privacy link is not a failed check when there is no email form');

const imperfect={...clean,quirksMode:true,textSize:14,placeholderLinks:['Join us (a.join)','See details (a.more)'],
  mobileClipped:[{target:'button.cta',width:320,box:75,scroll:152}],
  collectsEmail:true,hasPrivacyLink:false};
const detected=analyzeDeepSignals(imperfect,'/pricing');
assert.equal(detected.issues.length,5,'real evidence yields five distinct findings');
assert.ok(detected.issues.every(x=>x.category&&x.severity&&x.title&&x.evidence&&x.fix&&x.location&&x.verify),
  'every detected issue is usable and verifiable');
assert.ok(detected.issues.every(x=>x.severity==='note'),'heuristics do not invent critical severity');
assert.ok(detected.issues.some(x=>x.title.includes('privacy-policy link')));
const media=analyzeVerifiedMedia([
  {firstStatus:404,secondStatus:404,pathname:'/img/hero.jpg',locator:'img.hero'},
  {firstStatus:404,secondStatus:200,pathname:'/img/logo.webp',locator:'img.logo'},
  {firstStatus:0,secondStatus:0,pathname:'/img/blocked.webp',locator:'img.blocked'}
],'/');
assert.equal(media.issues.length,1,'image failure needs 2 confirmed 404 responses');
assert.equal(media.issues[0].severity,'high');
assert.ok(media.checks.some(x=>x.status==='unverified'),'unconfirmed asset stays unverified');
const links=analyzeVerifiedLinks([
  {firstStatus:404,secondStatus:404,pathname:'/pricing'},
  {firstStatus:503,secondStatus:503,pathname:'/signup'},
  {firstStatus:404,secondStatus:200,pathname:'/transient'},
  {firstStatus:200,secondStatus:0,pathname:'/contact'}
]);
assert.equal(links.issues.length,2,'confirmed 404 and 503 are actionable');
assert.ok(links.issues.some(x=>x.title.includes('server error')));
assert.ok(links.checks.some(x=>x.status==='passed'),'healthy link does not become a problem');
assert.equal(browser.priority({url:'https://target.com/pricing',via:'link'}) <
  browser.priority({url:'https://target.com/privacy',via:'link'}),true,'conversion pages inspected early');
console.log('PASS: source metadata false negatives, clean pages, deep browser heuristics, image verification, link verification and crawl priorities');
