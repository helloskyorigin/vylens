/**
 * VYLENS source-level website inspection. This does not render JavaScript or judge
 * visual design. No user-supplied URL may resolve to non-public infrastructure.
 */
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

function isPublicIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c,d] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
        a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
        a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 && c === 0 ||
        a === 198 && (b === 18 || b === 19) || a === 192 && b === 0 && c === 2 ||
        a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113 ||
        a === 255 || a === 192 && b === 88 && c === 99) return false;
    return true;
  }
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase().split('%')[0];
    if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff') ||
        v.startsWith('2001:db8:') || v.startsWith('2001:0:') || v.startsWith('2002:')) return false;
    if (v.startsWith('::ffff:')) return isPublicIP(v.slice(7));
    // Permit ordinary global unicast (2000::/3) only; block local and unclassified ranges.
    const first = parseInt(v.split(':')[0] || '0',16);
    return first >= 0x2000 && first < 0x4000;
  }
  return false;
}
function validateURL(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a valid public website URL.');
  const u = new URL(input);
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.port && !['80','443'].includes(u.port)) throw new Error('Only standard public HTTP(S) websites are supported.');
  const host = u.hostname.toLowerCase().replace(/\.$/,'');
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.test') || host.endsWith('.invalid') || net.isIP(host)) throw new Error('Please provide a public website domain, not a local address.');
  if (u.pathname.length > 1000) throw new Error('This URL is too long.');
  return u;
}
async function resolvePublic(host) {
  const addrs = await dns.lookup(host,{all:true,verbatim:true});
  if (!addrs.length || addrs.some(x => !isPublicIP(x.address))) throw new Error('This address cannot be inspected safely.');
  return addrs[0];
}
async function getHTML(url,redirects=0) {
  const u=validateURL(url);
  if (redirects>3) throw new Error('The website redirected too many times.');
  const chosen=await resolvePublic(u.hostname);
  return new Promise((resolve,reject)=>{
    const client=u.protocol==='https:'?https:http;
    const req=client.request(u,{
      method:'GET',timeout:8500,
      lookup:(hostname,opts,cb)=>cb(null,chosen.address,chosen.family),
      headers:{'User-Agent':'VYLENS-WebsiteInspector/1.0 (+https://vylens-tan.vercel.app/)','Accept':'text/html,application/xhtml+xml;q=0.9','Accept-Encoding':'identity'},
      maxHeaderSize:16384
    },res=>{
      const status=res.statusCode||0;
      if(status>=300 && status<400 && res.headers.location){
        res.resume();
        let next;try{next=new URL(res.headers.location,u).toString()}catch{reject(new Error('Invalid redirect from website.'));return}
        getHTML(next,redirects+1).then(resolve,reject);return;
      }
      if (status===401||status===403){res.resume();reject(new Error('This site blocks automated inspection. Try a public page.'));return}
      if(status<200||status>=300){res.resume();reject(new Error(`The website returned HTTP ${status}. Try another public URL.`));return}
      const type=String(res.headers['content-type']||'').toLowerCase();
      if(type && !type.includes('text/html') && !type.includes('application/xhtml+xml')){res.resume();reject(new Error('The URL did not return an HTML webpage.'));return}
      const chunks=[];let size=0;const LIMIT=850_000;
      res.on('data',b=>{size+=b.length;if(size>LIMIT){req.destroy(new Error('The page is too large for this first-look inspection.'));return}chunks.push(b)});
      res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),url:u.toString(),status}));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('The website took too long to respond.')));
    req.on('error',reject);req.end();
  });
}
function decode(s='') {return String(s).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim().slice(0,300)}
function removeTags(s=''){return decode(String(s).replace(/<[^>]*>/g,' '))}
function attr(tag,name){const found=String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'));return found?decode(found[1]??found[2]??found[3]??''):''}
function review(html,url) {
  const head=(html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)||[])[1]||html.slice(0,40000);
  const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const title=removeTags((head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const metas=[...head.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
  const meta=metas.find(x=>attr(x,'name').toLowerCase()==='description');
  const description=meta?attr(meta,'content'):'';
  const view=metas.find(x=>attr(x,'name').toLowerCase()==='viewport');
  const h1s=[...clean.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x=>removeTags(x[1])).filter(Boolean);
  const imgs=[...clean.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
  const withoutAlt=imgs.filter(x=>!(/\balt\s*=/i.test(x))).length;
  const anchors=[...clean.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,250).map(x=>removeTags(x[2]));
  const calls=anchors.filter(x=>/^(get started|start free|try|sign up|book|buy|shop|join|download|subscribe|request|contact|create|see pricing|start now)/i.test(x)).slice(0,4);
  const lang=(html.match(/<html\b[^>]*>/i)||[])[0]||'';
  const issues=[];
  function issue(category,severity,title,evidence,fix){issues.push({id:issues.length+1,category,severity,title,evidence,fix})}
  if (!title) issue('Search & clarity','high','Page title not found','No <title> element was detected in the fetched HTML.','Add a specific page title describing the page and its audience.');
  else if(title.length<18)issue('Search & clarity','medium','Very short page title',`The title is “${title}” (${title.length} characters). It may be too broad to communicate the offer.`, 'Use a descriptive page title with your product name and clear purpose.');
  if(!description)issue('Search & clarity','medium','Meta description not detected','The HTML head has no standard meta description. Search results may generate their own preview text.','Write an accurate, useful description that explains the offer and invites the right visitor.');
  if(!h1s.length)issue('Content structure','high','Main heading not detected','No non-empty H1 heading was found in the fetched HTML.','Use one clear, visible H1 describing the value of the page.');
  else if(h1s.length>1) issue('Content structure','low','Multiple primary headings detected',`There are ${h1s.length} H1 elements in the initial HTML. This can be valid, but hierarchy may need review.`, 'Check that the main heading and section hierarchy remain clear for readers and assistive technology.');
  if(!view)issue('Mobile basics','medium','Mobile viewport declaration missing','No standard viewport meta tag was found. This can affect mobile page scaling.','Add <meta name="viewport" content="width=device-width, initial-scale=1"> and test at mobile widths.');
  if(imgs.length && withoutAlt>0)issue('Accessibility','medium','Some images have no alt attribute',`${withoutAlt} of ${imgs.length} <img> elements lack an alt attribute in the fetched HTML. Decorative images can use alt="".`, 'Add meaningful alt text for informative images and empty alt for purely decorative ones.');
  if(!attr(lang,'lang'))issue('Accessibility','medium','Document language is not declared','The root HTML element does not declare a language.','Set the correct lang attribute, such as <html lang="en">.');
  if(!calls.length && anchors.length)issue('Conversion clarity','low','No common action label detected',`Scanned ${anchors.length} link/button labels, but none matched common CTAs. Your actual CTA could use different wording or render later.`, 'Check that a primary next step is easy to spot, clearly worded and visible without unnecessary scrolling.');
  if(!issues.length) return {issues:[],passed:true};
  const severityOrder={high:0,medium:1,low:2};issues.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]);issues.forEach((x,i)=>x.id=i+1);
  return {issues,passed:false};
}
const current=new Map();
function checkRate(ip){const now=Date.now();const key=String(ip||'unknown').slice(0,100);const rec=current.get(key)||{n:0,start:now};if(now-rec.start>60000){rec.n=0;rec.start=now}rec.n++;current.set(key,rec);if(current.size>500)current.clear();return rec.n<=12}
export async function POST(request){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const reply=(value,status)=>Response.json(value,{status,headers});
  const forwarded=request.headers.get('x-forwarded-for')||'';
  if(!checkRate(forwarded.split(',')[0]))return reply({error:'Too many requests. Try again in a minute.'},429);
  try{
    const raw=await request.text();
    if(raw.length>4096)throw new Error('Request is too large.');
    let body;try{body=JSON.parse(raw)}catch{throw new Error('Request must contain valid JSON.')}
    if(!body||typeof body.url!=='string')return reply({error:'A public website URL is required.'},400);
    const result=await getHTML(body.url);
    const analysis=review(result.html,result.url);
    const pageTitle=removeTags((result.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')||new URL(result.url).hostname;
    return reply({mode:'website',url:result.url,subject:new URL(result.url).hostname,pageTitle,scope:'Initial HTML source only. JavaScript-rendered content, visual design, performance, user analytics and actual conversion rates are not assessed.',checked:['Page title and description','Heading structure','Mobile viewport metadata','Image alternatives','Document language','Basic CTA labels'],checkedAt:new Date().toISOString(),issues:analysis.issues.slice(0,3),totalDetected:analysis.issues.length,passed:analysis.passed},200);
  }catch(error){
    const msg=error instanceof Error?error.message:'Could not inspect this website.';
    const safe=/^Enter|^Only|^Please|^This|^The |^Invalid|^Request|^Too many|^Could not/.test(msg)?msg:'Could not inspect this site. It may block automated requests or have a connection problem.';
    const bad=/^Enter|^Only|^Please|^This URL|^Invalid|^Request/.test(safe);
    return reply({error:safe},bad?400:422);
  }
}
export const _test={validateURL,isPublicIP,review};
