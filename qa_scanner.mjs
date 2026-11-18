import assert from 'node:assert/strict';
import { _test,GET,POST } from './api/inspect.mjs';
const {review,scan,isPublicIP,validateURL,getAttr}=_test;
const denied=['127.0.0.1','10.0.0.6','192.168.10.20','172.20.0.1','169.254.169.254','100.64.2.3','192.0.2.1','198.51.100.9','203.0.113.1','::1','fd12::1','fe80::3','2001:db8::1','2002::1','::ffff:127.0.0.1'];
for(const ip of denied)assert.equal(isPublicIP(ip),false,`blocked ${ip}`);
for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(isPublicIP(ip),true,`public ${ip}`);
for(const url of ['http://localhost','http://127.0.0.1','http://10.0.0.10','http://[::1]','https://foo.local','http://example.com:8080','https://user:pass@domain.tld','file:///etc/passwd','http://example.com@127.0.0.1','http://0x7f000001','http://foo.internal','http://google.com\nX:hi','http://foo.onion'])assert.throws(()=>validateURL(url),undefined,url);
assert.equal(getAttr('<input data-label="x" aria-label="Hello" />','label'),'');
const head=`<head><title>Useful design tools for independent creators</title><meta name="description" content="Make better documents"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta property="og:title" content="title"><meta property="og:description" content="desc"><link rel="canonical" href="https://target.com/"><link rel="icon" href="/favicon.ico"></head>`;
const good=`<html lang="en">${head}<body><h1>Design tools</h1><h2>How it works</h2><form action="/submit"><label for="email">Email</label><input id="email"/></form><button aria-label="Close"><svg></svg></button><a href="#target">See features</a><section id="target">About</section><img alt="" src="decoration" /></body></html>`;
const actual=review(good,'https://target.com/',{status:200});
assert.deepEqual(actual.issues,[],JSON.stringify(actual.issues));
assert.ok(actual.checks.length>=18);
const bad=`<html><head><title></title></head><body><h2>Skip to H2</h2><button><svg/></button><input><img src="x"><a href="#gone">Missing anchor</a><div id="dupe"></div><div id="dupe"></div><form action="http://insecure.com"></form></body></html>`;
const busted=review(bad,'https://target.com/',{status:200});
const names=busted.issues.map(x=>x.title);
for(const snippet of ['Page title is missing','No primary H1','Mobile viewport','form controls lack accessible','button elements have no','Duplicate element IDs','In-page links','Form uses an insecure HTTP destination'])assert.ok(names.some(x=>x.includes(snippet)),snippet+' '+names.join(';'));
assert.ok(!busted.issues.some(x=>x.severity==='critical')); // GET forms over HTTP are a note, not an unverified 'critical checkout' claim.
const jsShell=review('<html><head><title>Loading page</title></head><body><div id="root"></div><script src="/main.js"></script></body></html>','https://target.com/',{status:200});
assert.equal(jsShell.issues.find(x=>x.title==='No primary H1 heading in page source').severity,'note');
const fixture=`<html lang="en">${head}<body><h1>Useful products</h1><a href="/pricing">Pricing</a></body></html>`;
let events=[];
const network=async (url,options={})=>{
 events.push({url,method:options.method||'GET'});
 if(url==='https://target.com/')return {url,status:200,html:fixture,headers:{}};
 if(url==='https://target.com/pricing')return {url,status:404,html:'',headers:{}};
 throw Error('other URL');
};
const result=await scan('https://target.com/',{fetcher:network});
assert.equal(result.checksRun,result.checks.length);
assert.ok(result.issues.some(x=>x.title==='Internal link is broken'));
assert.deepEqual(events.map(x=>x.method),['GET','HEAD','GET']);
const inconclusive=await scan('https://target.com/',{fetcher:async (url,opts={})=>{
 if(!opts.method)return {url,status:200,html:fixture};
 if(opts.method==='HEAD')return {url,status:404};
 return {url,status:200};
}});
assert.equal(inconclusive.issues.filter(x=>x.title==='Internal link is broken').length,0);
const status=await GET();assert.equal(status.status,200);
const wrong=await POST(new Request('http://localhost/api/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'http://127.0.0.1'})}));
assert.equal(wrong.status,400);
console.log('PASS: public URL safety, metadata, accessible forms/buttons, duplicate IDs, anchor validation, no JS-shell false high, bounded internal link verification, API validation, real check counts');

// Regression: a React/SPA shell cannot be pronounced broken merely because
// JavaScript-generated headings and in-page sections are absent from raw HTML.
const longSPA=`<html><head><title>Dashboard</title></head><body><div id="root"></div><script src="/bundle.js"></script>${' '.repeat(20000)}<a href="#app-section">Go</a></body></html>`;
const spaReview=review(longSPA,'https://target.com/',{status:200});
assert.equal(spaReview.issues.find(x=>x.title==='No primary H1 heading in page source').severity,'note');
assert.equal(spaReview.checks.find(x=>x.name==='Primary H1 heading').status,'unverified');
assert.equal(spaReview.checks.find(x=>x.name==='In-page anchor targets').status,'unverified');

// HTTP response header directives matter even when the source has no robots meta.
const headerReview=review(good,'https://target.com/',{status:200,headers:{'x-robots-tag':'noindex, nofollow'}});
assert.equal(headerReview.checks.find(x=>x.name==='Indexability directive').status,'attention');
assert.equal(headerReview.issues.find(x=>x.title==='Page explicitly requests noindex').severity,'note');
const commented=review(good.replace('</head>','<!-- <meta name="robots" content="noindex"> --></head>'),'https://target.com/',{status:200});
assert.equal(commented.checks.find(x=>x.name==='Indexability directive').status,'passed');

// A source-declared HTTP form action is a concern, not a verified checkout failure.
const postForm=review(good.replace('action="/submit"','action="http://othersite.com/submit" method="POST"'),'https://target.com/',{status:200});
assert.equal(postForm.issues.find(x=>x.title==='Form uses an insecure HTTP destination').severity,'high');

// HEAD is often blocked on otherwise healthy sites. Fall back to safe GET.
const headBlocked=await scan('https://target.com/',{fetcher:async (url,opts={})=>{
  if(!opts.method)return {url,status:200,html:fixture};
  if(opts.method==='HEAD')return {url,status:405};
  return {url,status:200};
}});
assert.equal(headBlocked.issues.filter(x=>x.title==='Internal link is broken').length,0);
assert.equal(headBlocked.checks.find(x=>x.name.startsWith('Internal link')).status,'passed');

// A GET failure must confirm a HEAD 404 before a broken-link finding is emitted.
const headInconsistent=await scan('https://target.com/',{fetcher:async (url,opts={})=>{
  if(!opts.method)return {url,status:200,html:fixture};
  if(opts.method==='HEAD')return {url,status:404};
  return {url,status:200};
}});
assert.equal(headInconsistent.issues.filter(x=>x.title==='Internal link is broken').length,0);
console.log('PASS: JS-shell uncertainty, response header indexability, commented metadata, severity restraint, HEAD 405 fallback, GET confirmation');

const nonJSON=await POST(new Request('https://vylens.test/api/inspect',{method:'POST',headers:{'Content-Type':'text/plain'},body:'hello'}));
assert.equal(nonJSON.status,415);
const crossOrigin=await POST(new Request('https://vylens.test/api/inspect',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://malicious.test'},body:JSON.stringify({url:'https://target.com'})}));
assert.equal(crossOrigin.status,403);
const oversize=await POST(new Request('https://vylens.test/api/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(5000)}));
assert.equal(oversize.status,400);
console.log('PASS: API content type, cross-origin guard, bounded JSON body');


console.log(`Scanner performed ${actual.checks.length} checks on clean fixture and ${result.checksRun} with link probe`);
