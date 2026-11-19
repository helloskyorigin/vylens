/**
 * VYLENS public website crawl — bounded Playwright DOM/mobile checks.
 * All browser requests pass through a DNS-pinned, GET-only Node proxy.
 * No form submissions, logged-in pages, or nonpublic IPs.
 */
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import {_test as source} from './inspect.mjs';

const LIMIT=24, MAX_DISCOVERED=200, TIME_BUDGET=98000;
const UA='VYLENS-Inspector/4.0 (+https://vylens-tan.vercel.app/)';
const rates=new Map();
const str=s=>String(s??'').replace(/\s+/g,' ').trim();
const urlOf=s=>source.validateURL(s);
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const sameSite=(u,root)=>u.hostname.replace(/^www\./,'')===root.hostname.replace(/^www\./,'');
const dangerous=u=>/(?:^|\/)(?:logout|signout|sign-out|delete|remove|unsubscribe|checkout|cart|payment|admin|wp-admin|account|signin|login|register|api)(?:\/|$)/i.test(u.pathname);
function normalize(target,base,root){
  try{
    const u=urlOf(new URL(target,base).toString());
    if(!sameSite(u,root)||dangerous(u))return null;
    if(/\.(?:png|jpe?g|svg|webp|gif|ico|avif|pdf|zip|rar|mp4|mov|js|css|xml|json|txt|woff2?)$/i.test(u.pathname))return null;
    u.hash='';u.search='';
    if(u.pathname.length>200)return null;
    return u.toString();
  }catch{return null;}
}
function legal(url,label=''){
  return /privacy|terms|refund|return|cookie|disclaimer|policy|legal|shipping|accessibility/i.test(new URL(url).pathname+' '+label);
}
function priority(entry){
  // Always inspect the requested landing page before sitemap suggestions.
  if(entry.via==='start')return -1;
  const s=(new URL(entry.url).pathname+' '+entry.via).toLowerCase();
  if(/privacy|terms|refund|return|cookie|disclaimer|policy|legal|shipping|accessibility/.test(s))return 0;
  if(/contact|about/.test(s))return 1;
  return new URL(entry.url).pathname.split('/').filter(Boolean).length<2?2:3;
}
/* Network egress is validated and DNS-pinned before Chromium receives bytes. */
async function secureFetch(input,{maxBytes=1400000,timeout=5500,method='GET'}={}){
  const url=urlOf(input);
  const records=await dns.lookup(url.hostname,{all:true,verbatim:true});
  const ip=source.choosePublicAddress(records);
  return new Promise((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const req=transport.request(url,{method,timeout,lookup:source.pinnedLookup(ip),maxHeaderSize:16384,
      headers:{'User-Agent':UA,'Accept':'*/*','Accept-Encoding':'identity'}},res=>{
      const chunks=[];let bytes=0;
      res.on('data',part=>{
        bytes+=part.length;
        if(bytes>maxBytes){req.destroy(new Error('Resource too large'));return;}
        chunks.push(part);
      });
      res.on('error',reject);
      res.on('end',()=>{
        try{
          let body=Buffer.concat(chunks);
          const e=res.headers['content-encoding'];
          if(e==='gzip')body=zlib.gunzipSync(body,{maxOutputLength:maxBytes});
          if(e==='br')body=zlib.brotliDecompressSync(body,{maxOutputLength:maxBytes});
          if(e==='deflate')body=zlib.inflateSync(body,{maxOutputLength:maxBytes});
          if(body.length>maxBytes)throw Error('Response exceeds limit');
          resolve({status:res.statusCode||0,headers:res.headers,body});
        }catch(error){reject(error);}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Remote timeout')));
    req.on('error',reject);
    req.end();
  });
}
async function getText(url){
  try{
    const res=await secureFetch(url,{maxBytes:220000,timeout:3000});
    if(res.status!==200)return '';
    let bytes=res.body;
    if(bytes.length>2 && bytes[0]===0x1f && bytes[1]===0x8b)
      bytes=zlib.gunzipSync(bytes,{maxOutputLength:900000});
    return bytes.toString('utf8').slice(0,220000);
  }catch{return '';}
}
function robotsRules(robots){
  const blocks=[];let agents=[],directives=[];
  const close=()=>{if(agents.length)blocks.push({agents,directives});agents=[];directives=[];};
  for(const raw of robots.split(/\r?\n/)){
    const line=raw.split('#')[0].trim();
    if(!line){if(directives.length)close();continue;}
    const m=line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if(!m)continue;
    const key=m[1].toLowerCase(),value=m[2].trim();
    if(key==='user-agent'){
      if(directives.length)close();
      agents.push(value.toLowerCase());
    }else if((key==='allow'||key==='disallow')&&agents.length)directives.push({key,value});
  }
  close();
  const specific=blocks.filter(g=>g.agents.includes('vylens-inspector'));
  return (specific.length?specific:blocks.filter(g=>g.agents.includes('*'))).flatMap(g=>g.directives);
}
function robotsAllow(path,rules){
  let winner=null;
  for(const rule of rules){
    if(!rule.value)continue;
    const anchored=rule.value.endsWith('$');
    const glob=anchored?rule.value.slice(0,-1):rule.value;
    const expression='^'+glob.split('*').map(part=>part.replace(/[-/\\^$+?.()|[\]{}]/g,'\\$&')).join('.*')+(anchored?'$':'');
    let matched=false;
    try{matched=new RegExp(expression).test(path)}catch{continue;}
    if(!matched)continue;
    const specificity=glob.replace(/\*/g,'').length;
    if(!winner||specificity>winner.specificity||(specificity===winner.specificity&&rule.key==='allow'))winner={key:rule.key,specificity};
  }
  return !winner||winner.key==='allow';
}
async function discover(root,start){
  const robots=await getText(root.origin+'/robots.txt'),rules=robotsRules(robots);
  const queue=[{url:start,via:'start'}],seen=new Set([start]);
  let discoveryCapped=false,activated=false;
  const add=(href,via,base=root.origin)=>{
    const url=normalize(href,base,root);
    if(!url||seen.has(url))return;
    if(seen.size>=MAX_DISCOVERED){discoveryCapped=true;return;}
    seen.add(url);queue.push({url,via});
  };
  const mapQueue=[root.origin+'/sitemap.xml'];
  for(const line of robots.split(/\r?\n/)){
    const m=line.match(/^\s*Sitemap\s*:\s*(\S+)/i);
    if(m)mapQueue.push(m[1]);
  }
  const checkedMaps=new Set(),sitemapEntries=[];
  while(mapQueue.length&&checkedMaps.size<4&&sitemapEntries.length<400){
    const next=mapQueue.shift();
    let target;try{target=urlOf(next)}catch{continue;}
    if(!sameSite(target,root)||checkedMaps.has(target.toString()))continue;
    checkedMaps.add(target.toString());
    const xml=await getText(target.toString());
    if(!/<(?:urlset|sitemapindex)\b/i.test(xml))continue;
    const isIndex=/<sitemapindex\b/i.test(xml);
    for(const match of [...xml.matchAll(/<loc(?:\s[^>]*)?>([^<]+)<\/loc>/gi)].slice(0,240)){
      const url=match[1].replace(/&amp;/gi,'&').trim();
      if(isIndex){
        let nested;try{nested=urlOf(url)}catch{continue;}
        if(sameSite(nested,root)&&/\.xml(?:\.gz)?$/i.test(nested.pathname))mapQueue.push(nested.toString());
      }else if(sitemapEntries.length<400)sitemapEntries.push(url);
    }
  }
  const activateSitemap=()=>{
    if(activated)return;
    activated=true;
    for(const url of sitemapEntries)add(url,'sitemap');
    if(sitemapEntries.length>=400||mapQueue.length)discoveryCapped=true;
  };
  return {queue,seen,add,rules,activateSitemap,get discoveryCapped(){return discoveryCapped;}};
}
function extractSourceLinks(html){
  return [...html.matchAll(/<a\b[^>]{0,1000}\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .slice(0,160).map(m=>({href:(m[1]||m[2]||m[3]||'').replace(/&amp;/gi,'&'),label:''}));
}
async function intercept(route,state){
  const req=route.request(),type=req.resourceType();
  if(!['GET','HEAD'].includes(req.method())||!['document','script','stylesheet','image','font','xhr','fetch'].includes(type))
    return route.abort('blockedbyclient');
  let url;try{url=urlOf(req.url());}catch{return route.abort('blockedbyclient');}
  if(type==='document'&&!sameSite(url,state.root))return route.abort('blockedbyclient');
  if(dangerous(url))return route.abort('blockedbyclient');
  if(state.total>=1100||state.page>=90)return route.abort('blockedbyclient');
  state.total++;state.page++;
  const max=type==='document'?1450000:type==='script'?650000:type==='stylesheet'?500000:type==='image'?750000:type==='font'?260000:240000;
  try{
    const r=await secureFetch(url.toString(),{method:req.method(),maxBytes:max,timeout:type==='document'?7200:4200});
    const headers={'content-type':String(r.headers['content-type']||'application/octet-stream')};
    if(r.headers.location)headers.location=String(r.headers.location).slice(0,1800);
    if(r.headers['access-control-allow-origin'])headers['access-control-allow-origin']=String(r.headers['access-control-allow-origin']);
    // Preserve directives the audit uses; forwarding only content-type hid X-Robots-Tag.
    if(r.headers['x-robots-tag'])headers['x-robots-tag']=String(r.headers['x-robots-tag']).slice(0,500);
    return route.fulfill({status:r.status,headers,body:r.body});
  }catch{return route.abort('failed');}
}
async function browserStart(root){
  const browser=await playwright.launch({executablePath:await chromium.executablePath(),
    args:[...chromium.args,'--disable-background-networking'],headless:true,timeout:20000});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',
    javaScriptEnabled:true,acceptDownloads:false,permissions:[],locale:'en-US',userAgent:UA});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>socket.close());
  const state={root,total:0,page:0};
  await context.route('**/*',route=>intercept(route,state));
  const page=await context.newPage();
  context.on('page',p=>{if(p!==page)p.close().catch(()=>{});});
  return {browser,context,page,state};
}
async function rendered(session,url){
  const {page,state}=session;state.page=0;
  await page.setViewportSize({width:1280,height:800});
  const errors=[];const onError=e=>{if(errors.length<2)errors.push(str(e.message).slice(0,120));};
  page.on('pageerror',onError);
  try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:14500});
    const status=response?.status()||0;
    if(status>=400)return {status,html:'',links:[],browser:true};
    await page.waitForTimeout(350);
    const html=(await page.content()).slice(0,1400000);
    const links=await page.evaluate(()=>Array.from(document.querySelectorAll('a[href]')).slice(0,200)
      .map(a=>({href:a.href,label:(a.textContent||a.getAttribute('aria-label')||'').trim().slice(0,90)})));
    const visibleText=await page.evaluate(()=>{
      const container=document.querySelector('main')||document.querySelector('article')||document.body;
      if(!container)return '';
      if(container===document.body){
        const clone=container.cloneNode(true);
        clone.querySelectorAll('header,footer,nav,aside,script,style,noscript').forEach(el=>el.remove());
        return String(clone.textContent||'').slice(0,14000);
      }
      return String(container.innerText||'').slice(0,14000);
    });
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(90);
    const mobile=await page.evaluate(()=>{
      const width=document.documentElement.clientWidth||window.innerWidth;
      const small=[];
      for(const el of document.querySelectorAll('button, nav a, a[role="button"], input[type="submit"]')){
        const box=el.getBoundingClientRect(),styles=getComputedStyle(el);
        if(box.width<1||box.height<1||styles.visibility==='hidden'||styles.display==='none')continue;
        if(box.width<32||box.height<32)small.push({
          label:String(el.getAttribute('aria-label')||el.textContent||el.tagName).trim().slice(0,40),
          width:Math.round(box.width),height:Math.round(box.height)});
        if(small.length>=12)break;
      }
      return {width,scrollWidth:document.documentElement.scrollWidth,small};
    });
    return {status,html,links,mobile,visibleText,headers:await response.allHeaders(),browser:true,errors};
  }finally{page.off('pageerror',onError);}
}

function policyContentReview(url,visibleText,html){
  const path=new URL(url).pathname||'/';
  if(!/(?:privacy|terms|refund|return|cookie|disclaimer|policy|legal|shipping)/i.test(path))
    return {issues:[],checks:[]};
  let text=str(visibleText);
  if(!text){
    const body=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)||[])[1]||html;
    text=str(body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
  }
  const issues=[],checks=[];
  const match=text.match(/\blorem ipsum\b|\bcoming soon\b|\bTODO\b|\[(?:insert|your)\s+(?:company|business|name|email|address|date)[^\]]{0,40}\]/i);
  const shortContent=text.length<180;
  checks.push({name:path+' · Policy content',status:match||shortContent?'attention':'passed',
    detail:match?'Possible placeholder text: "'+match[0]+'".':
      'Readable policy-page text: '+text.length+' characters.'});
  if(match)issues.push({category:'Policy content',severity:'note',title:'Policy page may contain placeholder copy',
    location:path,evidence:'Possible placeholder visible on the page: "'+match[0]+'".',
    fix:'Review the page and replace any unfinished template text with accurate, site-specific information.',
    verify:'Read the published page and check that template placeholders are gone.'});
  if(shortContent)issues.push({category:'Policy content',severity:'note',title:'Policy page has very little readable content',
    location:path,evidence:'Only '+text.length+' readable characters observed in the page during inspection.',
    fix:'Review whether this page fully explains its intended policy. Requirements vary by site and jurisdiction.',
    verify:'Read the complete rendered policy page and confirm the relevant information is present.'});
  return {issues,checks};
}
function pageReview(html,url,status,browser,mobile,visibleText,errors,headers){
  const data=source.review(html,url,{status,headers:headers||{}});
  const path=new URL(url).pathname||'/';
  const checks=data.checks.map(x=>({...x,name:path+' · '+x.name}));
  const issues=data.issues.map(x=>({...x,location:path+' · '+(x.location||'Page')}));
  if(browser&&mobile){
    const excess=mobile.scrollWidth-mobile.width;
    checks.push({name:path+' · Rendered mobile width',status:excess>20?'attention':'passed',
      detail:excess>20?'Document wider than 390px viewport by '+excess+'px.':'Rendered content fits 390px viewport.'});
    if(excess>20)issues.push({category:'Mobile setup',severity:'note',title:'Possible horizontal overflow on mobile',
      location:path+' · mobile 390px',evidence:'Viewport '+mobile.width+'px; document scroll width '+mobile.scrollWidth+'px.',
      fix:'Inspect fixed-width elements and long text; prevent content extending outside the mobile viewport.',
      verify:'Open this page at 390px width and verify it does not scroll horizontally.'});
    const small=mobile.small||[];
    checks.push({name:path+' · Mobile interactive target sizing',status:small.length>=3?'attention':'passed',
      detail:small.length?'Observed '+small.length+' interactive target(s) smaller than 32px in at least one dimension.':'No unusually small navigation/button targets were observed.'});
    if(small.length>=3)issues.push({category:'Accessibility',severity:'note',title:'Some mobile interactive targets may be too small',
      location:path+' · mobile 390px',
      evidence:small.slice(0,4).map(t=>(t.label||'Control')+' '+t.width+'×'+t.height+'px').join('; '),
      fix:'Increase the clickable area and spacing for the affected navigation links and buttons.',
      verify:'Check tap targets with browser device emulation or a mobile device.'});
    if(errors?.length)checks.push({name:path+' · Uncaught script errors',status:'unverified',
      detail:'Browser observed '+errors.length+' script error(s). Some may depend on the inspection environment.'});
  }else checks.push({name:path+' · Rendered page',status:'unverified',detail:'Browser rendering unavailable. Only HTML source was checked.'});
  const policy=policyContentReview(url,visibleText,html);
  checks.push(...policy.checks);issues.push(...policy.issues);
  return {issues,checks,title:data.pageTitle};
}
function aggregate(analyses){
  const result=new Map();
  for(const page of analyses)for(const issue of page.issues){
    // Do not merge findings whose underlying evidence is different.
    const key=[issue.category,issue.title,issue.severity,str(issue.evidence||'')].join('|');
    if(!result.has(key))result.set(key,{...issue,affectedCount:0,affectedPages:[]});
    const r=result.get(key);r.affectedCount++;
    if(r.affectedPages.length<18)r.affectedPages.push(new URL(page.url).pathname||'/');
  }
  const out=[...result.values()];
  for(const i of out)if(i.affectedCount>1)i.location=i.affectedCount+' pages: '+i.affectedPages.slice(0,5).join(', ')+(i.affectedCount>5?'…':'');
  out.sort((a,b)=>( {critical:0,high:1,note:2}[a.severity]??2)-( {critical:0,high:1,note:2}[b.severity]??2));
  return out.map((x,i)=>({...x,id:i+1}));
}
async function scanSite(input){
  const started=Date.now();
  const home=await source.fetchPublic(input);
  const root=new URL(home.url),start=normalize(home.url,home.url,root);
  if(!start)throw new Error('Could not open a safe public website.');
  const discoverer=await discover(root,start);
  let session=null;
  try{session=await browserStart(root);}
  catch(error){console.error('Playwright unavailable',{name:error?.name});}
  const pages=[],analyses=[],checks=[],titles=[],done=new Set();let renderedCount=0,sourceCount=0;
  try{
    while(discoverer.queue.length&&pages.length<LIMIT&&Date.now()-started<TIME_BUDGET){
      discoverer.queue.sort((a,b)=>priority(a)-priority(b));
      const item=discoverer.queue.shift();
      if(done.has(item.url))continue;done.add(item.url);
      const path=new URL(item.url).pathname||'/',kind=legal(item.url,item.via)?'legal':'page';
      if(!robotsAllow(path,discoverer.rules)){
        pages.push({url:item.url,path,type:kind,status:'skipped',reason:'Blocked by robots.txt',findings:0});continue;
      }
      let visit=null,raw=null;
      if(session)try{visit=await rendered(session,item.url);}catch(error){
        visit={status:0,browser:false,html:'',links:[],error:str(error?.message).slice(0,150)};
      }
      if(!visit?.html&&!visit?.status){
        try{
          raw=item.url===start?home:await source.fetchPublic(item.url,{expectedOrigin:root.origin,timeout:6000});
          visit={status:raw.status,html:raw.html,links:extractSourceLinks(raw.html),browser:false};
        }catch(error){visit={status:0,html:'',links:[],browser:false,error:str(error?.message).slice(0,150)};}
      }
      if(!visit.html){
        let confirmedBroken=false;
        if(item.via==='link'&&[404,410].includes(visit.status)){
          // A transient WAF/HEAD or browser-only response is not enough: repeat with safe GET.
          try{
            const verification=await source.fetchPublic(item.url,{method:'GET',probe:true,timeout:3500,expectedOrigin:root.origin});
            confirmedBroken=verification.status===visit.status;
          }catch{}
        }
        pages.push({url:item.url,path,type:kind,status:'unverified',
          reason:visit.error||('HTTP '+visit.status),findings:confirmedBroken?1:0});
        checks.push({name:path+' · Page available',status:confirmedBroken?'attention':'unverified',
          detail:confirmedBroken?'HTTP '+visit.status+' confirmed on two GET requests.':
            (visit.error||'Page returned HTTP '+visit.status+'; availability not confirmed.')});
        if(confirmedBroken)
          analyses.push({url:item.url,issues:[{category:'Navigation',severity:'high',title:'Linked page returned HTTP '+visit.status,
            location:path,evidence:'The internal link to '+path+' returned HTTP '+visit.status+' on two public GET requests.',
            fix:'Restore the page or update its internal links.',verify:'Open the link and confirm it loads.'}]});
        if(item.via==='start')discoverer.activateSitemap();
        continue;
      }
      const evaluated=pageReview(visit.html,item.url,visit.status,visit.browser,visit.mobile,visit.visibleText,visit.errors,visit.headers||raw?.headers);
      checks.push(...evaluated.checks);analyses.push({url:item.url,issues:evaluated.issues});
      if(evaluated.title&&evaluated.title!==root.hostname)titles.push({url:item.url,title:str(evaluated.title).toLowerCase()});
      pages.push({url:item.url,path,type:kind,status:visit.browser?'rendered':'source',findings:evaluated.issues.length});
      if(visit.browser)renderedCount++;else sourceCount++;
      for(const link of visit.links||[])if(link.href)discoverer.add(link.href,'link',item.url);
      if(item.via==='start')discoverer.activateSitemap();
    }
  }finally{if(session)await session.browser.close().catch(()=>{});}
  const remaining=discoverer.queue.filter(x=>!done.has(x.url)).length;
  const inspected=renderedCount+sourceCount,legalCount=pages.filter(p=>p.type==='legal'&&(p.status==='rendered'||p.status==='source')).length;
  const skipped=pages.filter(p=>p.status==='skipped'||p.status==='unverified').length;
  const complete=remaining===0&&skipped===0&&sourceCount===0&&!discoverer.discoveryCapped;
  if(sourceCount)checks.push({name:'Playwright coverage',status:'unverified',detail:sourceCount+' page(s) used source fallback instead of rendered checks.'});
  if(remaining||skipped||discoverer.discoveryCapped)checks.push({name:'Crawl coverage',status:'unverified',detail:remaining+' discovered pages not visited; '+skipped+' blocked or unavailable.'+(discoverer.discoveryCapped?' Discovery URL cap reached.':'')});
  const issues=aggregate(analyses);
  const byTitle=new Map();
  for(const page of titles){
    const group=byTitle.get(page.title)||[];
    group.push(page.url);byTitle.set(page.title,group);
  }
  for(const [title,urls] of byTitle){
    if(urls.length<2)continue;
    issues.push({category:'Discoverability',severity:'note',title:'Multiple pages share the same title',
      location:urls.length+' pages · '+urls.slice(0,4).map(u=>new URL(u).pathname||'/').join(', '),
      affectedCount:urls.length,affectedPages:urls.slice(0,18).map(u=>new URL(u).pathname||'/'),
      evidence:'The same page title appears on '+urls.length+' inspected pages: "'+title.slice(0,100)+'".',
      fix:'Give distinct pages descriptive titles that match their individual content.',
      verify:'Open the affected pages and compare their document titles.'});
    checks.push({name:'Cross-page title uniqueness',status:'attention',detail:urls.length+' pages use the same document title.'});
  }
  issues.sort((a,b)=>( {critical:0,high:1,note:2}[a.severity]??2)-( {critical:0,high:1,note:2}[b.severity]??2));
  const findingsLimited=issues.length>250;
  if(findingsLimited)checks.push({name:'Finding coverage',status:'unverified',detail:'Additional findings exceeded the 250-item report cap.'});
  issues.length=Math.min(issues.length,250);
  issues.forEach((x,i)=>x.id=i+1);
  return {mode:'website',url:home.url,subject:root.hostname,checkedAt:new Date().toISOString(),
    engine:renderedCount?'vylens-playwright-v1':'vylens-source-fallback',pages,
    coverage:{discovered:discoverer.seen.size,inspected,rendered:renderedCount,sourceOnly:sourceCount,
      legal:legalCount,skipped,remaining,discoveryCapped:discoverer.discoveryCapped,findingsLimited,limit:LIMIT,complete:complete&&!findingsLimited,elapsedSeconds:Math.round((Date.now()-started)/1000)},
    summary:inspected+' pages inspected ('+legalCount+' legal); '+issues.length+' types of issues.',
    meta:'Multi-page inspection',coverageLabel:'Public site + mobile browser',
    scope:renderedCount?'Rendered pages and mobile layout were checked in Playwright where possible. These checks do not establish legal compliance or the cause of sales changes.'
      :'Playwright was unavailable; only available HTML source was inspected, without visual validation.',
    issues,checks,checksRun:checks.length,totalDetected:issues.length,
    passed:issues.length===0&&complete&&!findingsLimited};
}
export async function POST(request){
  if(!/^application\/json\b/i.test(request.headers.get('content-type')||''))return respond({error:'Send JSON.'},415);
  const origin=request.headers.get('origin');
  if(origin){
    try{
      const caller=new URL(origin),functionUrl=new URL(request.url),forwarded=request.headers.get('x-forwarded-host')||'';
      if(request.headers.get('sec-fetch-site')==='cross-site'||
         (caller.origin!==functionUrl.origin&&caller.host!==forwarded&&request.headers.get('sec-fetch-site')!=='same-origin'))
        return respond({error:'Cross-site requests are blocked.'},403);
    }catch{return respond({error:'Invalid origin.'},403);}
  }
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].slice(0,90),now=Date.now();
  for(const [key,last] of rates)if(now-last>120000)rates.delete(key);
  if(rates.get(ip)&&now-rates.get(ip)<25000)return respond({error:'Please wait before running another full-site audit.'},429);
  rates.set(ip,now);
  try{
    if(Number(request.headers.get('content-length')||0)>3500)return respond({error:'Request too large.'},413);
    const raw=await request.text();if(raw.length>3500)return respond({error:'Request too large.'},413);
    let data;try{data=JSON.parse(raw)}catch{return respond({error:'Invalid JSON.'},400);}
    return respond(await scanSite(urlOf(data?.url).toString()));
  }catch(error){
    const msg=str(error?.message).slice(0,180);
    console.error('Site scan failed',{name:error?.name,message:msg});
    const safe=/^Enter|^Only|^Use|^The website|^This site|^This address|^Could not|^A public/.test(msg);
    return respond({error:safe?msg:'Could not inspect this website. It may block automated scans or be temporarily unavailable.'},422);
  }
}
export function GET(){return respond({status:'ok',engine:'bounded-playwright-crawl',pageLimit:LIMIT});}
export const _test={normalize,legal,priority,robotsRules,robotsAllow,aggregate,policyContentReview};
