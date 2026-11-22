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
import {analyzeDeepSignals,analyzeVerifiedMedia,analyzeVerifiedLinks} from '../lib/problem-engine.mjs';
import {analyzeWebsiteConversion,analyzeSourceOffer} from '../lib/conversion-engine.mjs';
import {reviewEvidenceWithGroq} from '../lib/ai-conversion-signals.mjs';
import {isDirectAction,isPurchaseAction} from '../lib/action-intent.mjs';

const LIMIT=24, MAX_DISCOVERED=200, TIME_BUDGET=98000;
const MEDIA_BUDGET=36_000_000;
const LINK_ERRORS=new Set([404,410,500,502,503]);
const withDeadline=async (work,ms)=>{
  if(ms<=0)throw new Error('Inspection time budget reached');
  let timer;
  try{
    return await Promise.race([work(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Inspection time budget reached')),ms);
    })]);
  }finally{clearTimeout(timer);}
};
const UA='VYLENS-Inspector/4.0 (+https://vylens-tan.vercel.app/)';
const rates=new Map();
const str=s=>String(s??'').replace(/\s+/g,' ').trim();
const urlOf=s=>source.validateURL(s);
const respond=(data,status=200,extraHeaders={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extraHeaders}});
const sameSite=(u,root)=>u.hostname.replace(/^www\./,'')===root.hostname.replace(/^www\./,'');
const restrictedPath=/(?:^|\/)(?:logout|signout|sign-out|delete|remove|unsubscribe|checkout|cart|payment|admin|wp-admin|account|signin|sign-in|login|register|auth|session|oauth|submit|update|webhook|callback)(?:[./_-]|$)/i;
const dangerous=u=>{
  try{
    const path=decodeURIComponent(u.pathname);
    return restrictedPath.test(path)||Array.from(u.searchParams.keys()).some(key=>
      /^(?:action|token|code|session|password|key|secret|email|redirect_uri)$/i.test(key));
  }catch{return true;}
};
const apiPath=u=>/(?:^|\/)api(?:\/|$)/i.test(decodeURIComponent(u.pathname));
const publicDocument=u=>!dangerous(u)&&!apiPath(u);
function normalize(target,base,root){
  try{
    const u=urlOf(new URL(target,base).toString());
    if(!sameSite(u,root)||!publicDocument(u))return null;
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
  const s=(new URL(entry.url).pathname+' '+(entry.label||'')).toLowerCase();
  if(entry.direct||/pricing|plans|features|product|services|solution|demo|purchase|offer/.test(s))return 0;
  if(/privacy|terms|refund|return|cookie|disclaimer|policy|legal|shipping|accessibility/.test(s))return 1;
  if(/contact|about/.test(s))return 2;
  return new URL(entry.url).pathname.split('/').filter(Boolean).length<2?3:4;
}
/* Network egress is validated and DNS-pinned before Chromium receives bytes. */
async function secureFetch(input,{maxBytes=1400000,timeout=5500,charge=()=>true}={}){
  const url=urlOf(input);
  const started=Date.now();
  const records=await withDeadline(()=>dns.lookup(url.hostname,{all:true,verbatim:true}),timeout);
  const ip=source.choosePublicAddress(records);
  return new Promise((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const req=transport.request(url,{method:'GET',agent:false,lookup:source.pinnedLookup(ip),maxHeaderSize:16384,
      headers:{'User-Agent':UA,'Accept':'*/*','Accept-Encoding':'identity'}},res=>{
      const chunks=[];let bytes=0;
      res.on('data',part=>{
        bytes+=part.length;
        if(!charge(part.length)||bytes>maxBytes){req.destroy(new Error('Resource budget exceeded'));return;}
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
    const timer=setTimeout(()=>req.destroy(new Error('Remote timeout')),Math.max(1,timeout-(Date.now()-started)));
    req.once('close',()=>clearTimeout(timer));
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
  const queue=[{url:start,via:'start'}],seen=new Map([[start,queue[0]]]);
  let discoveryCapped=false,activated=false;
  const add=(href,via,base=root.origin,label='')=>{
    const url=normalize(href,base,root);
    if(!url)return;
    const direct=isDirectAction({label,path:new URL(url).pathname});
    const existing=seen.get(url);
    if(existing){
      if(via==='link'&&existing.via!=='start'){
        existing.via=via;
        existing.direct||=direct;
        existing.label||=label;
      }
      return;
    }
    if(seen.size>=MAX_DISCOVERED){discoveryCapped=true;return;}
    const entry={url,via,label,direct};
    seen.set(url,entry);
    queue.push(entry);
  };
  const mapQueue=[root.origin+'/sitemap.xml'];
  for(const line of robots.split(/\r?\n/)){
    const m=line.match(/^\s*Sitemap\s*:\s*(\S+)/i);
    if(m)mapQueue.push(m[1]);
  }
  const checkedMaps=new Set(),sitemapEntries=[];
  const maps=(async()=>{
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
  })();
  const activateSitemap=async()=>{
    if(activated)return;
    activated=true;
    await maps;
    for(const url of sitemapEntries)add(url,'sitemap');
    if(sitemapEntries.length>=400||mapQueue.length)discoveryCapped=true;
  };
  return {queue,seen,add,rules,activateSitemap,get discoveryCapped(){return discoveryCapped;}};
}
function extractSourceLinks(html){
  return [...html.matchAll(/<a\b[^>]{0,1000}\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .slice(0,160).map(m=>({href:(m[1]||m[2]||m[3]||'').replace(/&amp;/gi,'&'),label:''}));
}
function browserResource(req,state){
  const type=req.resourceType();
  if(req.method()!=='GET'||!['document','script','stylesheet','image','font','xhr','fetch'].includes(type))return null;
  try{
    const url=urlOf(req.url());
    if(dangerous(url))return null;
    if(type==='document'&&(!publicDocument(url)||!sameSite(url,state.root)||
      !robotsAllow(url.pathname+url.search,state.rules||[])))return null;
    if(apiPath(url)&&(!['xhr','fetch'].includes(type)||url.origin!==state.root.origin))return null;
    return {url,type};
  }catch{return null;}
}
async function intercept(route,state){
  const resource=browserResource(route.request(),state);
  if(!resource)return route.abort('blockedbyclient');
  const {url,type}=resource;
  if(state.total>=850||state.page>=95||state.bytes>=MEDIA_BUDGET){
    state.capped=true;
    return route.abort('blockedbyclient');
  }
  state.total++;
  state.page++;
  const max={document:1_450_000,script:2_500_000,stylesheet:650_000,image:750_000,font:300_000,xhr:550_000,fetch:550_000}[type];
  try{
    const r=await secureFetch(url.toString(),{
      maxBytes:max,timeout:type==='document'?7200:4600,
      charge:bytes=>{
        state.bytes+=bytes;
        return state.bytes<=MEDIA_BUDGET;
      }
    });
    const headers={'content-type':String(r.headers['content-type']||'application/octet-stream')};
    if(r.headers.location)headers.location=String(r.headers.location).slice(0,1800);
    if(r.headers['access-control-allow-origin'])headers['access-control-allow-origin']=String(r.headers['access-control-allow-origin']);
    if(r.headers['x-robots-tag'])headers['x-robots-tag']=String(r.headers['x-robots-tag']).slice(0,500);
    if(['script','stylesheet'].includes(type)&&r.status>=400&&url.origin===state.root.origin&&state.resourceGaps.length<6)
      state.resourceGaps.push(type+' '+url.pathname+' (HTTP '+r.status+')');
    return route.fulfill({status:r.status,headers,body:r.body});
  }catch{
    if(['script','stylesheet'].includes(type)&&state.resourceGaps.length<6)
      state.resourceGaps.push(type+' '+url.pathname+' (unavailable)');
    return route.abort('failed');
  }
}
async function browserStart(root,rules){
  const browser=await playwright.launch({executablePath:await chromium.executablePath(),
    args:[...chromium.args,'--disable-background-networking'],headless:true,timeout:20000});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',
    javaScriptEnabled:true,acceptDownloads:false,permissions:[],locale:'en-US',userAgent:UA});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>socket.close());
  const state={root,rules,total:0,page:0,bytes:0,capped:false,resourceGaps:[]};
  await context.route('**/*',route=>intercept(route,state));
  const page=await context.newPage();
  context.on('page',p=>{
    void p.opener().then(opener=>{if(opener)return p.close();}).catch(()=>{});
  });
  return {browser,context,page,state};
}

/* Rendered browser observations complement source checks.
 * Only observable DOM/CSS facts are recorded. Visual heuristics are advisory.
 * We cap samples to keep reports stable and avoid oversized responses.
 */
async function captureRenderedSignals(page){
  return page.evaluate(() => {
    const items=(selector,limit=250)=>Array.from(document.querySelectorAll(selector)).slice(0,limit);
    const visible=el=>{
      if(el.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
      const style=getComputedStyle(el),rect=el.getBoundingClientRect();
      return style.visibility!=='hidden'&&style.display!=='none'&&
        parseFloat(style.opacity)>0&&rect.width>1&&rect.height>1;
    };
    const label=el=>{
      const aria=el.getAttribute('aria-label');
      if(aria?.trim())return aria.trim();
      const linked=el.getAttribute('aria-labelledby');
      if(linked){
        const value=linked.split(/\s+/).map(x=>document.getElementById(x)?.textContent?.trim()||'').join(' ').trim();
        if(value)return value;
      }
      if(el.labels?.length){
        const text=[...el.labels].map(x=>x.textContent.trim()).join(' ').trim();if(text)return text;
      }
      const inner=(el.innerText||el.textContent||'').trim();
      if(inner)return inner;
      const image=el.querySelector('img[alt]');
      if(image?.alt?.trim())return image.alt.trim();
      const svgTitle=el.querySelector('svg title')?.textContent?.trim();
      if(svgTitle)return svgTitle;
      if(el.getAttribute('title')?.trim())return el.getAttribute('title').trim();
      if(el.tagName==='INPUT'&&['submit','button','reset'].includes((el.type||'').toLowerCase()))return el.value||'';
      return '';
    };
    const locator=el=>{
      if(el.id)return '#'+el.id.slice(0,48);
      let v=el.tagName.toLowerCase();
      if(el.getAttribute('name'))v+='[name="'+el.getAttribute('name').slice(0,35)+'"]';
      else if(el.classList.length)v+='.'+String(el.classList[0]).slice(0,35);
      return v;
    };
    const interactive=items('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"]',350)
      .filter(el=>!el.disabled&&visible(el));
    const unnamed=interactive.filter(el=>!label(el)).slice(0,8).map(locator);
    const images=items('img',180).filter(visible);
    const missingAlt=images.filter(img=>!img.hasAttribute('alt')).slice(0,8).map(locator);
    const fragmentLinks=[];
    for(const a of items('a[href*="#"]',150)){
      if(!visible(a))continue;
      try{
        const url=new URL(a.href,location.href);
        if(url.origin!==location.origin||url.pathname!==location.pathname||!url.hash||url.hash==='#')continue;
        const key=decodeURIComponent(url.hash.slice(1));
        if(key.toLowerCase()==='top'||document.getElementById(key)||document.getElementsByName(key).length)continue;
        fragmentLinks.push({from:locator(a),target:'#'+key.slice(0,60)});
        if(fragmentLinks.length>=8)break;
      }catch{}
    }
    const placeholderLinks=[];
    for(const a of items('a[href]',220)){
      if(!visible(a))continue;
      const href=a.getAttribute('href');
      if(href!=='#'&&href!=='')continue;
      if(a.getAttribute('role')==='button'||a.hasAttribute('onclick'))continue;
      const text=(a.innerText||a.getAttribute('aria-label')||'').trim();
      if(text.length<3)continue;
      placeholderLinks.push(text.slice(0,36)+' ('+locator(a)+')');
      if(placeholderLinks.length>=8)break;
    }
    const emailFields=items('input[type="email"]',40).filter(visible);
    const collectsEmail=emailFields.some(input=>!!input.closest('form'));
    const hasPrivacyLink=items('a[href]',250).some(a=>visible(a)&&
      /privacy|data.policy/i.test(String(a.getAttribute('href')||'')+' '+String(a.innerText||'')));
    const brokenImages=images.filter(img=>img.complete&&img.naturalWidth===0&&img.currentSrc)
      .slice(0,8).map(img=>({url:img.currentSrc,locator:locator(img)}));
    const counter=new Map();
    for(const el of items('[id]',1500))counter.set(el.id,(counter.get(el.id)||0)+1);
    const duplicateIds=[...counter].filter(([,n])=>n>1).slice(0,8).map(([id,n])=>id+' ×'+n);
    const main=document.querySelector('main,[role="main"]');
    const hasMain=!!main;
    const textSize=(main||document.body)?.innerText?.trim().length||0;
    const ambiguous=interactive.filter(el=>['click here','read more','learn more','submit'].includes(label(el).toLowerCase())).slice(0,6).map(el=>label(el).slice(0,32)+' ('+locator(el)+')');

    const rgb=text=>{
      const match=String(text).match(/^rgba?\(([^)]+)\)/i);
      if(!match)return null;
      const parts=match[1].replace(/\//g,' ').split(/[,\s]+/).filter(Boolean).map(Number);
      if(parts.length<3||parts.slice(0,3).some(n=>!Number.isFinite(n)))return null;
      return [parts[0],parts[1],parts[2],parts.length>3?parts[3]:1];
    };
    const composite=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
    const lum=c=>c.slice(0,3).map(v=>{
      const n=Math.min(1,Math.max(0,v/255));
      return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
    }).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const lowContrast=[];
    let examined=0;
    for(const el of items('p,li,label,small,button,a,span,h1,h2,h3',450)){
      if(lowContrast.length>=6||examined>=220)break;
      if(!visible(el))continue;
      if(el.querySelector('p,li,label,small,button,a,span,h1,h2,h3'))continue;
      const text=(el.innerText||'').trim();
      if(text.length<7||text.length>190)continue;
      const st=getComputedStyle(el);
      if(st.opacity!=='1'||st.mixBlendMode!=='normal'||st.textShadow!=='none')continue;
      const foreground=rgb(st.color);
      if(!foreground||foreground[3]!==1)continue;
      let ancestor=el,background=[255,255,255],valid=true,pile=[];
      while(ancestor&&ancestor.nodeType===1){
        const style=getComputedStyle(ancestor);
        if(style.opacity!=='1'||style.backgroundImage!=='none'||style.mixBlendMode!=='normal'){valid=false;break;}
        const layer=rgb(style.backgroundColor);
        if(!layer){valid=false;break;}
        pile.push(layer);ancestor=ancestor.parentElement;
      }
      if(!valid)continue;
      for(const color of pile.reverse())background=composite(color,background);
      const a=lum(foreground),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const size=parseFloat(st.fontSize),weight=parseInt(st.fontWeight,10)||400;
      const large=size>=24||(size>=18.66&&weight>=700);
      const threshold=large?3:4.5;
      examined++;
      // Avoid noisy near-threshold reports; record clear failures only.
      if(ratio<threshold-.35)lowContrast.push({target:locator(el),text:text.slice(0,36),ratio:Math.round(ratio*10)/10,required:threshold});
    }
    return {unnamed,missingAlt,fragmentLinks,duplicateIds,hasMain,textSize,ambiguous,lowContrast,
      contrastExamined:examined,interactiveCount:interactive.length,imageCount:images.length,
      quirksMode:document.compatMode==='BackCompat',mainTextMeasured:true,
      hasVisualApp:[...document.querySelectorAll('canvas,video,iframe')].some(visible),
      collectsEmail,hasPrivacyLink,placeholderLinks,brokenImages};
  });
}
/**
 * Non-invasive public offer observation. We do not click, submit, log in or
 * assert that page copy causes a sale. Sampled DOM text is evidence, not analytics.
 */
async function captureCommerceSignals(page){
  return page.evaluate(()=>{
    const trim=(value,max=180)=>{
      const raw=String(value??'').replace(/\s+/g,' ').trim();
      if(raw.length<=max)return raw;
      const cut=raw.slice(0,max).lastIndexOf(' ');
      return raw.slice(0,cut>max*.55?cut:max).trimEnd()+'…';
    };
    const meaningfulCopy=value=>{
      const words=String(value??'').trim().split(/\s+/).filter(Boolean);
      if(!words.length)return false;
      // Guard against repeated one-letter placeholder/noise text such as
      // "y y y y" being interpreted as a convincing offer or trust proof.
      if(words.length>=3&&words.filter(w=>/^[a-z]$/i.test(w)).length>=words.length*.75)
        return false;
      if(words.length>=6&&new Set(words.map(w=>w.toLowerCase())).size<=2)
        return false;
      return words.some(w=>/\p{L}{2,}/u.test(w));
    };
    const visible=el=>{
      if(!el||el.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
      const st=getComputedStyle(el),r=el.getBoundingClientRect();
      return st.visibility!=='hidden'&&st.display!=='none'&&Number(st.opacity)>0&&
        r.width>2&&r.height>2;
    };
    // Some SPA templates retain an empty <main> while mounting the actual
    // offer in #app or another body container. Use readable body copy rather
    // than recording an empty offer from the shell.
    const designated=document.querySelector('main,[role="main"]');
    const main=designated&&String(designated.innerText||'').trim().length>=32?
      designated:document.body;
    const visibleCopy=main.innerText||'';
    const content=trim(visibleCopy,14000);
    const locator=el=>el.id?'#'+el.id.slice(0,65):el.tagName.toLowerCase()+
      (el.classList.length?'.'+String(el.classList[0]).slice(0,55):'');
    const area=el=>el.closest('section,article,form,[id*="pricing" i],[class*="pricing" i]');
    const nameOf=el=>trim((el.getAttribute('aria-labelledby')||'').split(/\s+/)
      .map(id=>document.getElementById(id)?.textContent||'').join(' '),100);
    const brand=trim(document.querySelector('meta[property="og:site_name"]')?.content||
      document.querySelector('header a')?.innerText||'',80);
    const h1=[...main.querySelectorAll('h1')].find(visible)||
      [...document.querySelectorAll('h1')].find(visible);
    const intro=[...main.querySelectorAll('p')].filter(el=>visible(el)&&
      !el.closest('nav,header,footer,aside,dialog,[role="dialog"],[id*="cookie" i],[class*="cookie" i]'))
      .map(el=>trim(el.innerText||'',280))
      .find(v=>v.length>=25&&meaningfulCopy(v))||'';
    const rawTitle=trim(h1?.innerText||'',180);
    const title=meaningfulCopy(rawTitle)?rawTitle:'';
    const label=el=>trim(nameOf(el)||el.getAttribute('aria-label')||el.innerText||
      el.getAttribute('value')||el.querySelector('img[alt]')?.alt||el.getAttribute('title')||'',100);
    const purchaseAction=/^(?:(?:buy|purchase)(?:\s+(?:now|this|the|my|your|access|for)\b[^\n]{0,65})?|checkout|check out|pay now|order now|add to cart|subscribe(?:\s+now)?)\s*[.!?›→]*$/i;
    const bodyActions=[...main.querySelectorAll('a[href],button,[role="button"],input[type="submit"]')].slice(0,250)
      .filter(el=>visible(el)&&!el.closest('nav,header,footer,aside'));
    // Many legitimate public offers have their ONLY purchase link in a
    // fixed header/navigation. Include it without treating the header as
    // evidence about disclosures next to a product checkout section.
    const headerActions=[...document.querySelectorAll('header a[href],header button,nav a[href],nav button')]
      .slice(0,100).filter(visible);
    const rawActions=[...bodyActions,...headerActions]
      .filter((el,i,list)=>list.indexOf(el)===i).filter(el=>!el.disabled).slice(0,300);
    const actions=rawActions.map(el=>{
      let path='',destination='',missingFragment=false;
      if(el.matches('a[href]')){
        try{
          const u=new URL(el.getAttribute('href'),location.href);
          if(/^https?:$/.test(u.protocol)){
            path=u.origin===location.origin?u.pathname.slice(0,150):'External destination';
            destination=u.origin===location.origin?u.pathname.slice(0,150)+u.hash.slice(0,80):'External destination';
            if(u.origin===location.origin&&u.pathname===location.pathname&&u.hash){
              const id=decodeURIComponent(u.hash.slice(1));
              missingFragment=id.toLowerCase()!=='top'&&!document.getElementById(id)&&!document.getElementsByName(id).length;
            }
          }
        }catch{}
      }
      const rect=el.getBoundingClientRect();
      const actionLabel=label(el);
      const relatedForm=el.closest('form');
      const formContext=String(relatedForm?.id||'')+' '+
        String(relatedForm?.getAttribute('aria-label')||'')+' '+
        String(relatedForm?.innerText||'').slice(0,260);
      const isNewsletter=!!relatedForm&&!!relatedForm.querySelector('input[type="email"]')&&
        /\b(?:newsletter|updates|mailing list|email updates)\b/i.test(formContext)&&
        !/\b(?:checkout|card details|billing|payment)\b/i.test(formContext);
      const href=el.matches('a[href]')?String(el.getAttribute('href')||'').trim():'';
      const onScreen=rect.top+rect.height/2>=0&&rect.top+rect.height/2<window.innerHeight&&
        rect.left>=0&&rect.right<=window.innerWidth;
      const style=getComputedStyle(el);
      const textClipped=['hidden','clip'].includes(style.overflowX)&&el.scrollWidth>el.clientWidth+12;
      const trigger=area(el);
      const contextHeading=trim(trigger?.querySelector('h2,h3,legend')?.innerText||'',100);
      const hit=onScreen?document.elementFromPoint(
        Math.min(window.innerWidth-1,Math.max(1,rect.left+rect.width/2)),
        Math.min(window.innerHeight-1,Math.max(1,rect.top+rect.height/2))
      ):null;
      const centerReachable=onScreen?!!hit&&(hit===el||el.contains(hit)):null;
      const clippedHorizontally=rect.left< -3||rect.right>window.innerWidth+3;
      return {label:actionLabel,path,destination,isNewsletter,missingFragment,
        locator:locator(el),contextHeading,tag:el.tagName.toLowerCase(),
        frame:window.innerWidth,textClipped,
        inForm:!!relatedForm,disabled:el.getAttribute('aria-disabled')==='true',
        nameMissing:!actionLabel,formRequired:relatedForm?.querySelectorAll(':required,[aria-required="true"]').length||0,
        region:el.closest('nav,header')?'navigation':'main',
        isPurchaseAction:!isNewsletter&&purchaseAction.test(actionLabel),
        isPlaceholderDestination:el.matches('a[href]')&&/^(?:#|javascript:.*)$/i.test(href),
        top:Math.round(rect.top),
        width:Math.round(rect.width),height:Math.round(rect.height),
        centerReachable,clippedHorizontally,
        inFirstView:rect.top>=0&&rect.top<window.innerHeight};
    }).filter(a=>a.label||(!a.inForm&&a.path)).sort((a,b)=>
      Number(b.region==='main')-Number(a.region==='main')||a.top-b.top).slice(0,100);
    const amount=/(?:[$€£₹]\s*\d+(?:,\d{3})*(?:\.\d{1,2})?|\b(?:USD|INR|EUR|GBP)\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:\/|per\s+)\s*(?:months?|mo\b|years?|yrs?\b|weeks?|wk\b))?/gi;
    const prices=[];
    for(const el of [...main.querySelectorAll('p,div,span,strong,b,small,dt,dd,li,h2,h3,h4')].slice(0,1200)){
      if(!visible(el)||el.closest('del,s,strike,nav,footer,[aria-hidden="true"]'))continue;
      const text=(el.innerText||'').trim();
      if(text.length>110||!text||[...el.children].some(child=>visible(child)&&child.innerText?.trim()===text))continue;
      for(const match of text.matchAll(amount)){
        const before=text.slice(0,match.index);
        if(/\b(?:save|save up to|worth|valued at|was|from a previous)\s*$/i.test(before))continue;
        const section=area(el);
        const priceContext=el.closest('[class*="price" i],[data-plan],article')||el.parentElement;
        const near=trim(priceContext?.innerText||text,140);
        const after=text.slice(match.index+match[0].length);
        const cadence=(after.match(/^\s*(?:[·—–-]\s*)?(?:one[ -]time|once|per report|per analysis|billed monthly|billed annually)\b/i)||[])[0]||
          (near.length<90?(near.match(/\b(?:one[ -]time|per report|per analysis|billed monthly|billed annually)\b/i)||[])[0]:'');
        const value=trim(match[0],44);
        const plan=trim(priceContext?.querySelector('h2,h3,h4')?.innerText||
          section?.querySelector('h2,h3')?.innerText||'',75);
        const explicit=!!el.closest('[data-plan],[class*="price" i],#pricing,[id*="pricing" i]')||
          /^\s*(?:from\s+)?(?:[$€£₹]|USD|INR|EUR|GBP)/i.test(text);
        prices.push({value,cadence:trim(cadence,28),plan,explicit,locator:locator(el)});
      }
      if(prices.length>=36)break;
    }
    const explicitPrices=prices.filter(price=>price.explicit);
    const relevantPrices=explicitPrices.length?explicitPrices:prices;
    const priceSamples=[...new Set(relevantPrices.map(price=>price.value))].slice(0,10);
    const links=[...document.querySelectorAll('a[href]')].filter(visible).slice(0,220);
    const policyLinks=links.filter(a=>/refund|return|terms|cancellation|purchase.policy|privacy/i.test(
      String(a.getAttribute('href')||'')+' '+String(a.innerText||''))).slice(0,12)
      .map(a=>({href:a.href,label:label(a)}));
    const termsLinks=links.filter(a=>/refund|return|terms|cancellation|purchase.policy/i.test(
      String(a.getAttribute('href')||'')+' '+String(a.innerText||'')));
    const hasPurchaseTerms=termsLinks.length>0||
      /refund policy|refunds? available|all sales final|money.back guarantee/i.test(content);
    const buyingActions=rawActions.filter(el=>{
      if(el.closest('nav,header'))return false;
      if(!purchaseAction.test(label(el)))return false;
      const form=el.closest('form');
      const context=String(form?.id||'')+' '+String(form?.getAttribute('aria-label')||'')+
        ' '+String(form?.innerText||'').slice(0,260);
      return !(form?.querySelector('input[type="email"]')&&
        /\b(?:newsletter|updates|mailing list|email updates)\b/i.test(context));
    });
    const termsNearAction=buyingActions.some(action=>{
      const buttonTop=action.getBoundingClientRect().top;
      const linkedNearby=termsLinks.some(link=>{
        const distance=Math.abs(link.getBoundingClientRect().top-buttonTop);
        return distance<=550;
      });
      // Purchase disclosures can be plain text, not just policy links.
      // Restrict this to the closest offer element, not the whole page/footer.
      const nearby=action.closest('section,article,form,[class*="pricing" i],[class*="offer" i]')||
        action.parentElement;
      // Do not climb into <body> and accidentally treat a distant footer
      // refund link as adjacent to a purchase CTA.
      // Count only text actually near the button. A huge pricing section can
      // contain a policy at the bottom, which is NOT adjacent disclosure.
      const notices=[...(nearby?.querySelectorAll('p,small,li,a')||[])].slice(0,200);
      const writtenNearby=notices.some(el=>{
        if(!visible(el))return false;
        if(Math.abs(el.getBoundingClientRect().top-buttonTop)>520)return false;
        const statement=trim(el.innerText||el.textContent||'',420);
        return /\b(?:refunds?|returns?|cancellations?|all sales final|money.back guarantee|purchase terms)\b/i.test(statement);
      });
      return linkedNearby||writtenNearby;
    });
    const proofCandidates=[...main.querySelectorAll(
      '[class*="testimonial" i],[id*="testimonial" i],[class*="customer-review" i],[class*="case-study" i],blockquote'
    )].slice(0,45).filter(visible);
    const proofText=proofCandidates.filter(el=>!el.closest('[id*="demo" i],[class*="demo" i]'))
      .map(el=>trim(el.innerText||'',220))
      .find(t=>t.length>=45&&meaningfulCopy(t)&&
        !/\b(?:no testimonials|no reviews|coming soon|placeholder)\b/i.test(t))||'';
    const hasProof=!!proofText;
    const forms=[...main.querySelectorAll('form')].filter(visible);
    const form=forms.map(f=>{
      const fields=[...f.querySelectorAll('input:not([type="hidden"],[type="submit"],[type="reset"],[type="button"]),select,textarea')]
        .filter(el=>!el.disabled&&visible(el));
      const context=trim((f.getAttribute('aria-label')||f.getAttribute('id')||'')+
        ' '+(f.querySelector('h1,h2,h3,legend')?.textContent||'')+' '+(f.innerText||''),130);
      return {context,locator:locator(f),fields:fields.length,required:fields.filter(el=>el.required||el.getAttribute('aria-required')==='true').length,
        unnamedRequired:fields.filter(el=>(el.required||el.getAttribute('aria-required')==='true')&&
          !nameOf(el)&&!el.getAttribute('aria-label')&&!el.getAttribute('title')&&!el.labels?.length)
          .slice(0,6).map(locator)};
    }).sort((a,b)=>b.required-a.required)[0]||null;
    // Preserve informative value/deliverable copy as separate evidence, not
    // only the first generic paragraph and price. Exclude UI/navigation,
    // invisible blocks and repetitive filler before sending it to the reviewer.
    const buyerSections=[...main.querySelectorAll(
      'section h2,section h3,article h2,article h3,[id*="pricing" i] h2,'+
      '[class*="pricing" i] h2,[class*="features" i] h2,[id*="features" i] h2'
    )].slice(0,90).filter(el=>visible(el)&&!el.closest(
      'nav,header,footer,aside,[id*="cookie" i],[class*="cookie" i]'))
      .map(el=>trim(el.innerText||'',210)).filter(t=>t.length>=22&&meaningfulCopy(t));
    const buyerBullets=[...main.querySelectorAll(
      'section li,article li,[class*="benefit" i] p,[id*="benefit" i] p,'+
      '[class*="features" i] li,[class*="pricing" i] li'
    )].slice(0,250).filter(el=>visible(el)&&!el.closest(
      'nav,header,footer,aside,[id*="cookie" i],[class*="cookie" i]'))
      .map(el=>trim(el.innerText||'',240))
      .filter(t=>t.length>=24&&t.length<=240&&meaningfulCopy(t));
    const uniqueBuyers=a=>[...new Set(a.map(t=>t.toLowerCase()))]
      .map(key=>a.find(t=>t.toLowerCase()===key));
    const offerSections=uniqueBuyers(buyerSections).slice(0,24);
    const benefitStatements=uniqueBuyers(buyerBullets).slice(0,32);
    const draft=[...main.querySelectorAll('p,h2,h3,li')].slice(0,250).filter(visible)
      .map(el=>trim(el.innerText||'',150))
      .find(text=>/^lorem ipsum\b|^todo\s*:|\[(?:insert|your) (?:company|product|headline|testimonial)[^\]]{0,45}\]/i.test(text))||'';
    return {heading:title,intro,brand,visibleText:content,actions,priceSamples,prices:relevantPrices.slice(0,18),
      hasPrice:priceSamples.length>0,hasPurchaseTerms,termsNearAction,hasProof,policyLinks,draft,
      proofText,firstViewHeight:window.innerHeight,form,offerSections,benefitStatements};
  });
}
function evaluateRenderedSignals(signals,path){
  const issues=[],checks=[];
  if(!signals)return {issues,checks};
  const add=(category,severity,title,evidence,fix,location,verify)=>{
    issues.push({category,severity,title,evidence,fix,location,verify});
  };
  const run=(name,count,detail)=>checks.push({name:path+' · '+name,status:count?'attention':'passed',detail});
  const unnamed=signals.unnamed||[];
  run('Rendered control names',unnamed.length,unnamed.length?unnamed.length+' visible interactive controls have no detectable name: '+unnamed.join(', '):signals.interactiveCount+' visible controls checked.');
  if(unnamed.length)add('Accessibility','high','Visible interactive controls lack accessible names',
    'Unnamed visible controls: '+unnamed.join(', '),
    'Give every visible interactive button, link and input a meaningful accessible name or associated label.',
    path+' · '+unnamed[0],'Inspect the affected elements in the browser accessibility tree.');
  const missingAlt=signals.missingAlt||[];
  run('Rendered image alternatives',missingAlt.length,missingAlt.length?'Visible images without alt attributes: '+missingAlt.join(', '):signals.imageCount+' visible images checked.');
  if(missingAlt.length)add('Accessibility','note','Rendered images are missing alt attributes',
    'Visible images without alt attributes: '+missingAlt.join(', '),
    'Use meaningful alt text for informative images; use alt="" for purely decorative images.',
    path+' · '+missingAlt[0],'Inspect the affected images and confirm their accessible alternatives.');
  const fragments=signals.fragmentLinks||[];
  run('Rendered anchor destinations',fragments.length,fragments.length?fragments.map(x=>x.target).join(', '):'Visible same-page anchors resolve in the rendered document.');
  if(fragments.length)add('Navigation','high','Rendered section links point to missing targets',
    fragments.map(x=>x.from+' → '+x.target).join('; '),
    'Add matching section IDs or update the affected internal links.',
    path+' · '+fragments[0].from,'Click the affected links and verify the target section exists.');
  const duplicates=signals.duplicateIds||[];
  run('Rendered unique IDs',duplicates.length,duplicates.length?duplicates.join(', '):'No duplicate IDs found in rendered DOM.');
  if(duplicates.length)add('Accessibility','high','Duplicate IDs present after rendering',
    'Repeated IDs: '+duplicates.join(', '),
    'Assign unique IDs to rendered elements to avoid broken labels and targets.',
    path+' · DOM IDs','Inspect the duplicate elements in the live DOM.');
  const contrast=signals.lowContrast||[];
  checks.push({name:path+' · Measurable text contrast',status:contrast.length?'attention':signals.contrastExamined?'passed':'unverified',
    detail:contrast.length?contrast.map(x=>x.target+': '+x.ratio+':1').join('; '):
      signals.contrastExamined?signals.contrastExamined+' solid-background text samples compared.':'Complex backgrounds prevented a reliable color calculation.'});
  if(contrast.length)add('Accessibility','note','Some text has potentially insufficient contrast',
    contrast.map(x=>x.target+' "'+x.text+'" '+x.ratio+':1 (recommended '+x.required+':1)').join('; '),
    'Adjust foreground or solid background colors, then measure against WCAG text contrast criteria.',
    path+' · rendered text','Use a browser contrast checker on the listed elements; gradients and images were excluded.');
  const vague=signals.ambiguous||[];
  if(vague.length>=3)add('Content clarity','note','Several actions use vague labels',
    vague.join('; '),
    'Give repeated actions specific descriptive labels so visitors know what happens next.',
    path+' · buttons/links','Review visible button and link labels in context.');
  checks.push({name:path+' · Primary content landmark',status:signals.hasMain?'passed':signals.textSize>350?'attention':'unverified',
    detail:signals.hasMain?'Main landmark exists.':'No <main> or role="main" landmark detected.'});
  if(!signals.hasMain&&signals.textSize>350)add('Accessibility','note','Page has no main content landmark',
    'Rendered page contains '+signals.textSize+' characters but no main landmark.',
    'Wrap the primary content in a <main> element or apply role="main" to the appropriate container.',
    path+' · page structure','Inspect the page accessibility landmarks.');
  return {issues,checks};
}
function blockedOrChallenge(commerce){
  const heading=String(commerce?.heading||'').trim().toLowerCase();
  const text=String(commerce?.visibleText||'').slice(0,1800).toLowerCase();
  if(!heading&&!text)return false;
  const title=/(?:^just a moment\b|^checking your browser\b|^access denied\b|^one more step\b|^attention required\b|^please enable javascript\b|^verify you are human\b)/i.test(heading);
  const marker=/(?:checking (?:if )?(?:the )?(?:site connection|browser)|verify (?:that )?you are human|challenge-platform|cloudflare ray id|attention required.*cloudflare|request blocked.*security rules|captcha verification required|javascript is required to continue.*verify)/i.test(text);
  return (title&&marker)||/cloudflare ray id[\s\S]{0,160}(?:access denied|verification)/i.test(text);
}
async function waitForContent(page,timeout){
  const ready=await page.waitForFunction(()=>{
    const selected=document.querySelector('main,[role="main"],article,#root,#__next,#app');
    const content=selected&&String(selected.innerText||'').trim().length>=32?
      selected:document.body;
    const text=(content?.innerText||'').replace(/\s+/g,' ').trim();
    if(/^.{0,24}\b(?:loading|initializing|please wait)\b[ .…!]*$/i.test(text))return false;
    return text.length>=75||text.length>=12&&!!content?.querySelector('h1,h2,canvas,video,form');
  },null,{timeout}).then(()=>true,()=>false);
  if(ready)await page.waitForTimeout(180);
  return ready;
}
async function rendered(session,url,{freshMobile=true}={}){
  const {page,state}=session;
  state.page=0;
  state.resourceGaps=[];
  state.capped=false;
  await page.setViewportSize({width:1280,height:800});
  const errors=[];
  const onError=e=>{if(errors.length<3)errors.push(str(e.message).slice(0,140));};
  page.on('pageerror',onError);
  try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:9000});
    const status=response?.status()||0;
    if(status>=400)return {status,html:'',links:[],browser:false};
    if(!response)return {status:0,html:'',links:[],browser:false};
    // A second short check catches delayed client-side hydration without
    // allowing unlimited waits or silently calling an empty shell "checked".
    const initialReady=await waitForContent(page,3000);
    const ready=initialReady||await waitForContent(page,1300);
    if(ready)await page.waitForLoadState('load',{timeout:650}).catch(()=>{});
    const desktop=await withDeadline(async ()=>{
      const [signals,commerce,html,links]=await Promise.all([
        captureRenderedSignals(page),captureCommerceSignals(page),page.content(),
        page.evaluate(()=>Array.from(document.querySelectorAll('a[href]')).slice(0,200)
          .map(a=>({href:a.href,label:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,90)})))
      ]);
      return {signals,commerce,html:html.slice(0,1400000),links};
    },1800);
    const {signals,commerce,html,links}=desktop;
    const visibleText=commerce.visibleText;
    const resourceGap=state.resourceGaps.length?
      'Some rendering assets were unavailable: '+state.resourceGaps.join(', ')+'.':'';
    const challenge=blockedOrChallenge(commerce);
    // A slow but fully rendered offer can miss the initial readiness deadline.
    // Trust the captured DOM only when it contains concrete offer evidence.
    const commerceText=String(commerce?.visibleText||'').trim();
    const usefulContent=commerceText.length>=65&&
      Boolean(commerce?.heading||commerce?.intro)&&
      Boolean(commerce?.hasPrice||(commerce?.actions||[]).length||
        (commerce?.benefitStatements||[]).length);
    const usableContent=!challenge&&(ready||usefulContent);
    const renderGap=challenge?
      'The website showed a verification or access screen instead of the offer.':
      !usableContent?'The page opened, but its offer did not become readable in the inspection window.':
      state.capped?'Browser resource limit was reached.':'';
    const desktopCapped=state.capped;
    const measureMobile=view=>view.evaluate(()=>{
      const width=document.documentElement.clientWidth||window.innerWidth,small=[],clipped=[],offenders=[];
      const locator=el=>el.id?'#'+el.id.slice(0,40):el.tagName.toLowerCase()+
        (el.classList?.length?'.'+String(el.classList[0]).slice(0,35):'');
      const visible=el=>{
        if(el.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return s.visibility!=='hidden'&&s.display!=='none'&&parseFloat(s.opacity)>0&&r.width>1&&r.height>1;
      };
      for(const el of [...document.querySelectorAll('button, nav a, a[role="button"],input[type="submit"],input[type="button"]')].slice(0,180)){
        if(!visible(el))continue;
        const r=el.getBoundingClientRect();
        if(r.width<32||r.height<32)small.push({label:String(el.getAttribute('aria-label')||el.textContent||el.tagName).trim().slice(0,42),
          locator:locator(el),width:Math.round(r.width),height:Math.round(r.height)});
        if(small.length>=12)break;
      }
      for(const el of [...document.querySelectorAll('h1,h2,button,[role="button"]')].slice(0,160)){
        if(!visible(el))continue;
        const st=getComputedStyle(el),txt=(el.innerText||el.textContent||'').trim();
        if(txt.length<11)continue;
        if(!['hidden','clip'].includes(st.overflowX)||el.scrollWidth<=el.clientWidth+15)continue;
        clipped.push({target:locator(el),width,box:el.clientWidth,scroll:el.scrollWidth});
        if(clipped.length>=5)break;
      }
      const documentWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
      if(documentWidth>width+12){
        for(const el of [...document.querySelectorAll('main *,body > *')].slice(0,700)){
          if(!visible(el))continue;
          const r=el.getBoundingClientRect();
          if(r.right>width+13&&r.width>width*.25){
            offenders.push(locator(el)+' extends to '+Math.round(r.right)+'px');
            if(offenders.length>=5)break;
          }
        }
      }
      return {width,scrollWidth:documentWidth,small,clipped,offenders};
    });
    let mobile=null,narrow=null,mobileCommerce=null,narrowCommerce=null,mobileGap='';
    let mobileMode='',phonePage=null;
    const inspectPhone=async view=>{
      [mobile,mobileCommerce]=await Promise.all([measureMobile(view),captureCommerceSignals(view)]);
      await view.setViewportSize({width:320,height:780});
      await view.waitForTimeout(100);
      [narrow,narrowCommerce]=await Promise.all([measureMobile(view),captureCommerceSignals(view)]);
    };
    if(!desktopCapped){
      try{
        await withDeadline(async ()=>{
          await page.setViewportSize({width:390,height:844});
          await page.waitForTimeout(170);
          await inspectPhone(page);
          mobileMode='reflow';
        },4800);
      }catch{
        mobileGap=mobile?'320px layout could not be checked.':'390px phone content could not be verified.';
      }
    }
    if(freshMobile&&!desktopCapped){
      const reflow={mobile,narrow,mobileCommerce,narrowCommerce,mobileMode};
      try{
        phonePage=await withDeadline(()=>session.context.newPage(),1800);
        await withDeadline(async ()=>{
          await phonePage.setViewportSize({width:390,height:844});
          state.page=0;
          state.resourceGaps=[];
          state.capped=false;
          const phoneResponse=await phonePage.goto(url,{waitUntil:'domcontentloaded',timeout:5400});
          if(!phoneResponse||phoneResponse.status()>=400)throw new Error('Phone response unavailable');
          if(!await waitForContent(phonePage,2200))throw new Error('No readable phone content');
          if(state.capped||state.resourceGaps.length)throw new Error('Phone rendering resources unavailable');
          await inspectPhone(phonePage);
          mobileMode='fresh';
          mobileGap='';
        },8700);
      }catch{
        ({mobile,narrow,mobileCommerce,narrowCommerce,mobileMode}=reflow);
        mobileGap='Fresh 390px load was unavailable.'+
          (mobileMode==='reflow'?' The rendered desktop page was resized to check phone layout.':'');
      }finally{
        if(phonePage)await withDeadline(()=>phonePage.close(),1100).catch(()=>{});
      }
    }
    const combinedCommerce={...commerce,
      mobileActions:mobileCommerce?.actions??null,
      narrowActions:narrowCommerce?.actions??null,
      mobilePriceVisible:mobileCommerce?.hasPrice??null,
      mobilePriceSamples:mobileCommerce?.priceSamples||[],
      mobilePrices:mobileCommerce?.prices||[],
      mobileCaptured:!!mobileCommerce,mobileMode,
      renderGap,mobileGap,resourceGap
    };
    return {status,html,links,mobile,narrow,visibleText,signals,
      commerce:usableContent?combinedCommerce:null,renderGap,mobileGap,resourceGap,mobileMode,
      headers:response.headers(),browser:true,errors};

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
  checks.push({name:path+' · Policy text and placeholders',status:match||shortContent?'attention':'observed',
    detail:match?'Possible placeholder text: "'+match[0]+'".':
      'Readable policy text found ('+text.length+' characters); this does not verify legal adequacy.'});
  if(match)issues.push({category:'Policy content',severity:'note',title:'Policy page may contain placeholder copy',
    location:path,evidence:'Possible placeholder visible on the page: "'+match[0]+'".',
    fix:'Review the page and replace any unfinished template text with accurate, site-specific information.',
    verify:'Read the published page and check that template placeholders are gone.'});
  if(shortContent&&text.length>0)issues.push({category:'Policy content',severity:'note',title:'Policy page has very little readable content',
    location:path,evidence:'Only '+text.length+' readable characters observed in the page during inspection.',
    fix:'Review whether this page fully explains its intended policy. Requirements vary by site and jurisdiction.',
    verify:'Read the complete rendered policy page and confirm the relevant information is present.'});
  return {issues,checks};
}
function pageReview(html,url,status,browser,mobile,visibleText,errors,headers,signals,narrow,mediaEvidence){
  const data=source.review(html,url,{status,headers:headers||{}});
  const path=new URL(url).pathname||'/';
  const checks=data.checks.map(x=>({...x,name:path+' · '+x.name}));
  const issues=data.issues.map(x=>({...x,location:path+' · '+(x.location||'Page')}));
  if(browser&&mobile){
    const excess=mobile.scrollWidth-mobile.width;
    checks.push({name:path+' · Rendered mobile width',status:excess>20?'attention':'passed',
      detail:excess>20?'Document wider than 390px viewport by '+excess+'px.':'Rendered content fits 390px viewport.'});
    if(excess>20)issues.push({category:'Mobile setup',severity:'note',title:'Possible horizontal overflow on mobile',
      location:path+' · mobile 390px',
      evidence:'Viewport '+mobile.width+'px; document scroll width '+mobile.scrollWidth+'px. '+
        (mobile.offenders||[]).slice(0,4).join('; ')+'.',
      fix:'Inspect fixed-width elements and long text; prevent content extending outside the mobile viewport.',
      verify:'Open this page at 390px width and verify it does not scroll horizontally.'});
    if(narrow){
      const narrowExcess=narrow.scrollWidth-narrow.width;
      checks.push({name:path+' · Narrow-phone layout (320px)',
        status:narrowExcess>16?'attention':'passed',
        detail:narrowExcess>16?
          '320px viewport has '+narrowExcess+'px extra document width. '+(narrow.offenders||[]).slice(0,3).join('; '):
          'Rendered document fits a 320px-wide phone.'});
      if(narrowExcess>16&&excess<=20)
        issues.push({category:'Mobile experience',severity:'note',title:'Layout overflows on narrow phones',
          location:path+' · 320px viewport',
          evidence:'Document width '+narrow.scrollWidth+'px at 320px viewport. '+(narrow.offenders||[]).slice(0,3).join('; '),
          fix:'Find the fixed-width or overflowing element, and make its sizing responsive.',
          verify:'Check the same page at 320px and 390px viewport widths without horizontal scrolling.'});
    }
    const small=mobile.small||[];
    checks.push({name:path+' · Mobile interactive target sizing',status:small.length>=1?'attention':'passed',
      detail:small.length?'Observed '+small.length+' interactive target(s) smaller than 32px in at least one dimension.':'No unusually small navigation/button targets were observed.'});
    if(small.length>=1)issues.push({category:'Accessibility',severity:'note',title:'Some mobile interactive targets may be too small',
      location:path+' · mobile 390px',
      evidence:small.slice(0,4).map(t=>(t.label||'Control')+' '+t.width+'×'+t.height+'px').join('; '),
      fix:'Increase the clickable area and spacing for the affected navigation links and buttons.',
      verify:'Check tap targets with browser device emulation or a mobile device.'});
  }
  if(browser&&errors?.length)checks.push({name:path+' · Uncaught script errors',status:'unverified',
    detail:'Browser observed '+errors.length+' script error(s): '+errors.join(' | ')});
  if(!browser)checks.push({name:path+' · Rendered page',status:'unverified',detail:'Browser rendering unavailable. Only HTML source was checked.'});
  if(browser && signals){
    const seen=evaluateRenderedSignals(signals,path);
    // Rendered DOM replaces initial HTML estimates for these checks. Don't display
    // a stale source-only "Flagged" next to a rendered "Passed" for the same signal.
    const renderedAuthority=new Set([
      'Image alt attributes','Form control accessible labels','Button accessible names',
      'Link accessible names','Unique element IDs','In-page anchor targets'
    ]);
    for(let i=checks.length-1;i>=0;i--){
      if(renderedAuthority.has(checks[i].name.slice((path+' · ').length)))
        checks.splice(i,1);
    }
    checks.push(...seen.checks);
    // Use the rendered DOM as the authority for accessibility/name/anchor checks:
    // source-only observations may refer to content hidden or replaced by JavaScript.
    const superseded=[
      /^\d+ form controls lack accessible names$/,
      /^\d+ button elements have no accessible name$/,
      /^Links with no readable label detected$/,
      /^Duplicate element IDs found$/,
      /^In-page links point to missing sections$/,
      /^Images are missing alt attributes$/
    ];
    for(let i=issues.length-1;i>=0;i--)
      if(superseded.some(test=>test.test(issues[i].title)))issues.splice(i,1);
    issues.push(...seen.issues);
    const combined={
      ...signals,
      mobileClipped:[...(mobile?.clipped||[]),...(narrow?.clipped||[])]
    };
    const deep=analyzeDeepSignals(combined,path);
    checks.push(...deep.checks);
    issues.push(...deep.issues);
    const media=analyzeVerifiedMedia(mediaEvidence||[],path);
    checks.push(...media.checks);
    issues.push(...media.issues);
  }
  const policy=policyContentReview(url,visibleText,html);
  checks.push(...policy.checks);issues.push(...policy.issues);
  return {issues,checks,title:data.pageTitle};
}
function aggregate(analyses){
  const result=new Map(),pathsByFinding=new Map();
  for(const page of analyses)for(const item of page.issues){
    // Same evidence on multiple pages is one finding with multiple recorded locations.
    // Group the same issue type across pages while retaining each page's exact evidence.
    // Otherwise counts split whenever a page-specific number or locator differs.
    const key=[item.category,item.title,item.severity].join('|');
    const pagePath=new URL(page.url).pathname||'/';
    if(!result.has(key)){
      result.set(key,{...item,affectedCount:0,affectedPages:[],occurrences:[]});
      pathsByFinding.set(key,new Set());
    }
    const finding=result.get(key),paths=pathsByFinding.get(key);
    if(!paths.has(pagePath)){
      paths.add(pagePath);
      finding.affectedCount++;
      if(finding.affectedPages.length<18)finding.affectedPages.push(pagePath);
    }
    const location=str(item.location||pagePath).slice(0,260),evidence=str(item.evidence||'').slice(0,600);
    if(finding.occurrences.length<18&&!finding.occurrences.some(x=>x.path===pagePath&&x.location===location&&x.evidence===evidence))
      finding.occurrences.push({path:pagePath,url:page.url,location,evidence});
  }
  const out=[...result.values()];
  for(const item of out)if(item.affectedCount>1)
    item.location=item.affectedCount+' pages affected; see individual page locations below.';
  out.sort((a,b)=>({critical:0,high:1,note:2}[a.severity]??2)-({critical:0,high:1,note:2}[b.severity]??2));
  return out.map((x,i)=>({...x,id:i+1}));
}
async function scanSite(input,progress=()=>{}){
  const started=Date.now();
  const remainingTime=()=>TIME_BUDGET-(Date.now()-started);
  // Reserve a real execution window for Groq instead of exhausting the entire
  // crawl budget, silently skipping AI on long sites.
  const scanDeadline=TIME_BUDGET-(process.env.GROQ_API_KEY?13500:0);
  const remainingScanTime=()=>scanDeadline-(Date.now()-started);
  const parsed=urlOf(input);
  if(!publicDocument(parsed))throw new Error('Use a public offer or homepage URL.');
  progress('connecting');
  const home=await source.fetchPublic(input,{timeout:10500,allowURL:publicDocument});
  const root=new URL(home.url),start=normalize(home.url,home.url,root);
  if(!start)throw new Error('Could not open a safe public website.');
  progress('discovering');
  const discoverer=await discover(root,start);
  let session=null;
  if(robotsAllow(new URL(start).pathname,discoverer.rules)){
    try{session=await browserStart(root,discoverer.rules);}
    catch(error){console.error('Playwright unavailable',{name:error?.name});}
  }
  progress(session?'rendering':'source');
  const pages=[],analyses=[],checks=[],titles=[],commerceSnapshots=[],done=new Set(),destinationStatus=new Map();
  const mediaCache=new Map(),linkCandidates=new Map();
  let renderedCount=0,sourceCount=0,browserRestarts=0;
  const entrySource=source.review(home.html,home.url,{status:home.status,headers:home.headers});
  try{
    while(discoverer.queue.length&&pages.length<LIMIT&&remainingScanTime()>1800){
      discoverer.queue.sort((a,b)=>priority(a)-priority(b));
      const item=discoverer.queue.shift();
      if(done.has(item.url))continue;done.add(item.url);
      const path=new URL(item.url).pathname||'/',kind=legal(item.url,item.via)?'legal':'page';
      if(!robotsAllow(path,discoverer.rules)){
        pages.push({url:item.url,path,type:kind,status:'skipped',reason:'Blocked by robots.txt',findings:0});continue;
      }
      let visit=null,raw=null,fallbackReason='';
      if(!session&&browserRestarts<1&&remainingScanTime()>26000){
        browserRestarts++;
        try{session=await browserStart(root,discoverer.rules);}catch{}
      }
      if(session)try{
        // Measure responsive layout first. A second live navigation is most useful
        // when the submitted page has only a script shell in its initial HTML.
        const freshMobile=item.via==='start'&&entrySource.jsShell;
        visit=await withDeadline(()=>rendered(session,item.url,{freshMobile}),Math.min(freshMobile?29000:20000,remainingScanTime()-1100));
      }catch(error){
        fallbackReason=error.message==='Inspection time budget reached'?'The browser exceeded its inspection budget.':'The browser could not load this page.';
        if(session.browser.isConnected()&&remainingScanTime()>5000){
          const previousPage=session.page;
          try{
            await withDeadline(()=>previousPage.close(),1300);
            session.page=await withDeadline(()=>session.context.newPage(),1800);
          }catch{
            await withDeadline(()=>session.browser.close(),1800).catch(()=>{});
            session=null;
          }
        }else{
          await withDeadline(()=>session.browser.close(),1800).catch(()=>{});
          session=null;
        }
      }
      if(!visit?.html&&!visit?.status&&remainingScanTime()>900){
        fallbackReason||='Browser rendering was unavailable.';
        try{
          raw=item.url===start?home:await withDeadline(()=>source.fetchPublic(item.url,{
            expectedOrigin:new URL(item.url).origin,timeout:3200,
            allowURL:u=>publicDocument(u)&&robotsAllow(u.pathname+u.search,discoverer.rules)
          }),Math.min(5500,remainingScanTime()-500));
          visit={status:raw.status,html:raw.html,links:extractSourceLinks(raw.html),browser:false};
        }catch{visit={status:0,html:'',links:[],browser:false};}
      }
      if(!visit?.html){
        const status=visit?.status||0;
        let confirmedBroken=false;
        if(item.via==='link'&&LINK_ERRORS.has(status)&&remainingScanTime()>4200){
          try{
            const verification=await withDeadline(()=>source.fetchPublic(item.url,{
              probe:true,timeout:2600,expectedOrigin:new URL(item.url).origin,
              allowURL:u=>publicDocument(u)&&robotsAllow(u.pathname+u.search,discoverer.rules)
            }),3500);
            confirmedBroken=verification.status===status;
          }catch{}
        }
        if(confirmedBroken)destinationStatus.set(item.url,{state:'broken',status});
        const reason=status?'HTTP '+status:(fallbackReason||'Page unavailable within scan budget.');
        pages.push({url:item.url,path,type:kind,status:'unverified',reason,findings:confirmedBroken?1:0});
        checks.push({name:path+' · Page available',status:confirmedBroken?'attention':'unverified',
          detail:confirmedBroken?'HTTP '+status+' confirmed on two GET requests.':reason});
        if(confirmedBroken)
          analyses.push({url:item.url,issues:[{category:'Navigation',severity:'high',title:'Linked page returned HTTP '+status,
            location:path,evidence:'The internal link to '+path+' returned HTTP '+status+' on two public GET requests.',
            fix:'Restore the page or update its internal links.',verify:'Open the link and confirm it loads.'}]});
        if(item.via==='start')await discoverer.activateSitemap();
        continue;
      }
      destinationStatus.set(item.url,{state:'responded',status:visit.status,browser:visit.browser});
      const mediaEvidence=[];
      if(visit.browser&&Array.isArray(visit.signals?.brokenImages)){
        for(const img of visit.signals.brokenImages.slice(0,4)){
          if(Date.now()-started>scanDeadline-11000)break;
          let target;try{target=urlOf(img.url)}catch{continue;}
          if(!sameSite(target,root)||target.origin!==root.origin||!publicDocument(target))continue;
          if(!mediaCache.has(target.toString())){
            let firstStatus=0,secondStatus=0;
            try{
              const first=await source.fetchPublic(target.toString(),{method:'GET',probe:true,timeout:2800,expectedOrigin:root.origin,allowURL:publicDocument});
              firstStatus=first.status;
              if([404,410].includes(firstStatus)){
                const second=await source.fetchPublic(target.toString(),{method:'GET',probe:true,timeout:2800,expectedOrigin:root.origin,allowURL:publicDocument});
                secondStatus=second.status;
              }
            }catch{}
            mediaCache.set(target.toString(),{firstStatus,secondStatus});
          }
          mediaEvidence.push({...mediaCache.get(target.toString()),url:target.toString(),
            pathname:target.pathname,locator:img.locator});
        }
      }
      const evaluated=pageReview(visit.html,item.url,visit.status,visit.browser,visit.mobile,
        visit.visibleText,visit.errors,visit.headers||raw?.headers,visit.signals,visit.narrow,mediaEvidence);
      checks.push(...evaluated.checks);analyses.push({url:item.url,issues:evaluated.issues});
      if(evaluated.title&&evaluated.title!==root.hostname)titles.push({url:item.url,title:str(evaluated.title).toLowerCase()});
      const desktop=!!visit.commerce&&!visit.renderGap,phone=desktop&&!!visit.commerce.mobileCaptured;
      const buyerCapture=Boolean(visit.browser&&visit.commerce&&!visit.renderGap);
      pages.push({url:item.url,path,type:kind,status:visit.browser?'rendered':'source',findings:evaluated.issues.length,
        desktop,phone,narrow:!!visit.narrow&&phone,phoneMode:phone?visit.mobileMode:undefined,
        buyerCapture,reason:visit.browser?(visit.renderGap||visit.mobileGap||visit.resourceGap||undefined):fallbackReason});
      if(visit.browser&&visit.commerce)commerceSnapshots.push({
        url:item.url,status:'rendered',entry:item.via==='start',commerce:visit.commerce,
        technical:{lowContrast:visit.signals?.lowContrast||[],mobileClipped:visit.mobile?.clipped||[],
          narrowClipped:visit.narrow?.clipped||[],media:mediaEvidence}
      });
      if(visit.browser)renderedCount++;else sourceCount++;
      for(const link of visit.links||[]){
        if(!link.href)continue;
        const normalized=normalize(link.href,item.url,root);
        if(normalized&&!linkCandidates.has(normalized))linkCandidates.set(normalized,{url:normalized,via:'link',referrer:item.url,label:link.label});
        discoverer.add(link.href,'link',item.url,link.label);
      }
      if(item.via==='start')await discoverer.activateSitemap();
    }
  }finally{if(session)await withDeadline(()=>session.browser.close(),2300).catch(()=>{});}
  // Pages omitted by the bounded full crawl can still have a quick, safe availability check.
  // This is NOT a substitute for fully auditing their content.
  const pendingLinks=[...linkCandidates.values()].filter(item=>
    !done.has(item.url)&&robotsAllow(new URL(item.url).pathname,discoverer.rules))
    .sort((a,b)=>priority(a)-priority(b)).slice(0,12);
  const linkEvidence=[];
  if(pendingLinks.length&&remainingScanTime()>10000){
    progress('links');
    // Avoid unbounded parallel traffic and repeat failed GETs before publishing a finding.
    for(let index=0;index<pendingLinks.length;index+=3){
      if(Date.now()-started>scanDeadline-9000)break;
      const batch=await Promise.all(pendingLinks.slice(index,index+3).map(async item=>{
        let firstStatus=0,secondStatus=0;
        try{
          const first=await source.fetchPublic(item.url,{method:'GET',probe:true,timeout:2600,expectedOrigin:new URL(item.url).origin,allowURL:publicDocument});
          firstStatus=first.status;
          if([404,410,500,502,503].includes(firstStatus)){
            const second=await source.fetchPublic(item.url,{method:'GET',probe:true,timeout:2600,expectedOrigin:new URL(item.url).origin,allowURL:publicDocument});
            secondStatus=second.status;
          }
        }catch{}
        return {url:item.url,pathname:new URL(item.url).pathname,firstStatus,secondStatus,referrer:item.referrer};
      }));
      linkEvidence.push(...batch);
    }
  }
  for(const evidence of linkEvidence){
    if(LINK_ERRORS.has(evidence.firstStatus)&&evidence.firstStatus===evidence.secondStatus)
      destinationStatus.set(evidence.url,{state:'broken',status:evidence.firstStatus});
    else if(evidence.firstStatus>=200&&evidence.firstStatus<300)
      destinationStatus.set(evidence.url,{state:'responded',status:evidence.firstStatus});
    const result=analyzeVerifiedLinks([evidence]);
    checks.push(...result.checks);
    if(result.issues.length)analyses.push({url:evidence.referrer||start,issues:result.issues});
  }
  const remaining=discoverer.queue.filter(x=>!done.has(x.url)).length;
  const inspected=renderedCount+sourceCount,legalCount=pages.filter(p=>p.type==='legal'&&(p.status==='rendered'||p.status==='source')).length;
  const skipped=pages.filter(p=>p.status==='skipped'||p.status==='unverified').length;
  const pageGaps=pages.filter(p=>p.reason).map(p=>({path:p.path,reason:p.reason}));
  const viewportGaps=pages.filter(p=>p.status==='rendered'&&(!p.desktop||!p.phone||!p.narrow)).length;
  const complete=remaining===0&&skipped===0&&sourceCount===0&&viewportGaps===0&&pageGaps.length===0&&!discoverer.discoveryCapped;
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
  // Deterministic triage: severity first, then verified broken destinations /
  // interaction blockers, then prevalence. This is NOT a measured revenue score.
  const score=entry=>{
    const title=str(entry.title).toLowerCase();
    const category=str(entry.category).toLowerCase();
    const urgency=({critical:0,high:100,note:200})[entry.severity]??250;
    const impact=/broken|http 404|http 410|server error|unsafe path|unreachable/.test(title)?0:
      /mobile|accessib|form|button|navigation|link/.test(title+' '+category)?12:
      /structure|heading|content|policy/.test(title+' '+category)?28:48;
    const prevalence=Math.min(12,Math.max(0,(entry.affectedCount||1)-1));
    return urgency+impact-prevalence;
  };
  for(const entry of issues){
    entry.priorityScore=score(entry);
    entry.priorityReason=(entry.affectedCount||1)>1?
      'Found on '+entry.affectedCount+' inspected pages.':
      'Review this finding and its recorded evidence.';
  }
  issues.sort((a,b)=>a.priorityScore-b.priorityScore||a.title.localeCompare(b.title));
  const findingsLimited=issues.length>250;
  if(findingsLimited)checks.push({name:'Finding coverage',status:'unverified',detail:'Additional findings exceeded the 250-item report cap.'});
  issues.length=Math.min(issues.length,250);
  issues.forEach((x,i)=>x.id=i+1);
  const coverage={discovered:discoverer.seen.size,inspected,rendered:renderedCount,sourceOnly:sourceCount,
    desktop:pages.filter(p=>p.desktop).length,mobile:pages.filter(p=>p.phone).length,
    mobileFresh:pages.filter(p=>p.phoneMode==='fresh').length,
    narrow:pages.filter(p=>p.narrow).length,
    legal:legalCount,skipped,remaining,discoveryCapped:discoverer.discoveryCapped,findingsLimited,
    limit:LIMIT,complete:complete&&!findingsLimited,elapsedSeconds:Math.round((Date.now()-started)/1000),gaps:pageGaps.slice(0,12)};
  const destinations=[];
  for(const snapshot of commerceSnapshots){
    const observed= [
      ...snapshot.commerce.actions.filter(a=>isDirectAction(a)||/pricing|plans|checkout|purchase/i.test(a.destination||''))
        .map(a=>({href:a.destination,label:a.label,kind:'action',locator:a.locator,purchase:isPurchaseAction(a)})),
      ...snapshot.commerce.policyLinks.map(a=>({...a,kind:'policy'}))
    ];
    for(const link of observed){
      if(!link.href||link.href==='External destination'||link.href.includes('#'))continue;
      const target=normalize(link.href,snapshot.url,root);
      if(!target)continue;
      const result=destinationStatus.get(target);
      destinations.push({...link,url:target,path:new URL(target).pathname,referrer:new URL(snapshot.url).pathname,
        state:result?.state||'unverified',status:result?.status});
    }
  }
  progress('diagnosing');
  const conversion=analyzeWebsiteConversion(commerceSnapshots,{issues,coverage,destinations});
  const renderedWithoutContent=pages.filter(p=>p.status==='rendered'&&!p.buyerCapture);
  const browserEvidencePages=pages.filter(p=>p.buyerCapture).length;
  const offerEvidencePages=Math.max(0,Number(conversion.inspectedOfferPages)||0);
  // Opening a page is NOT the same as successfully assessing its buying offer.
  // Preserve the distinctions through to the UI and downloadable report.
  coverage.buyerEvidencePages=offerEvidencePages;
  coverage.browserContentPages=browserEvidencePages;
  coverage.renderedWithoutContent=renderedWithoutContent.length;
  coverage.buyerAssessmentComplete=offerEvidencePages>0;
  const noOfferEvidence=offerEvidencePages===0;
  if(noOfferEvidence){
    const sourceReview=analyzeSourceOffer(home.html||'',home.url);
    conversion.sourcePreview={
      type:'initial-html-only',
      url:home.url,
      observations:(sourceReview.strengths||[]).slice(0,4).map(x=>({
        title:x.title,evidence:x.evidence
      })),
      warning:'Only initial HTML was available for this preview. Dynamic offer and checkout were not verified.'
    };
    const examples=pages.filter(p=>p.reason).slice(0,4).map(p=>({
      page:p.path,reason:String(p.reason||'').slice(0,180)
    }));
    const reason=renderedWithoutContent.some(p=>/verification|access screen/i.test(p.reason||''))?
      'At least one page showed an access-verification screen.':
      renderedWithoutContent.length?
      'Pages opened, but usable offer content was not captured.':
      sourceCount?'The browser could not render a buyer-facing offer; initial HTML is not enough for a full assessment.':
      'No suitable buyer-facing offer page could be identified in this crawl.';
    conversion.scanDiagnostic={
      status:'insufficient-offer-evidence',
      reason,openedPages:inspected,offerEvidencePages:0,
      sourcesOnly:sourceCount,unreadableRendered:renderedWithoutContent.length,
      examples
    };
    conversion.unverified.push(reason);
  }
  // AI is an optional, second-opinion review of captured public evidence.
  // Never let it rewrite the verified scanner's findings or editorial score.
  // Keep a hard deadline and preserve the rule-based report during API failure.
  let aiReview={status:'skipped',signals:[],pagesConsidered:0};
  if(!noOfferEvidence&&process.env.GROQ_API_KEY&&remainingTime()>2000){
    progress('ai-review');
    aiReview=await reviewEvidenceWithGroq(commerceSnapshots,{
      timeoutMs:Math.min(10000,Math.max(1000,remainingTime()-450))
    });
  }
  conversion.aiReview=aiReview;
  return {mode:'website',url:home.url,subject:root.hostname,checkedAt:new Date().toISOString(),
    conversion,
    engine:renderedCount?'vylens-playwright-v1':'vylens-source-fallback',pages,coverage,
    summary:noOfferEvidence?
      inspected+' pages opened; no buyer-facing offer could be verified.':
      inspected+' pages opened; '+offerEvidencePages+' buyer-facing offer pages analyzed.',
    meta:'Multi-page inspection',coverageLabel:'Public site + mobile browser',
    scope:noOfferEvidence?
      'The inspector opened pages but did not obtain usable public offer evidence. This is not a completed buyer assessment.':
      renderedCount?'Rendered pages and mobile layout were checked in Playwright where possible. These checks do not establish legal compliance or the cause of sales changes.':
      'Only available HTML source was inspected, without visual validation.',
    issues,checks,checksRun:checks.length,totalDetected:issues.length,
    reportCounts:{
      distinctFindings:issues.length,
      affectedPageOccurrences:issues.reduce((sum,item)=>sum+(item.affectedCount||1),0),
      checksByStatus:checks.reduce((acc,item)=>{
        const status=['passed','attention','observed','unverified','not_applicable'].includes(item.status)?item.status:'unverified';
        acc[status]++;return acc;
      },{passed:0,attention:0,observed:0,unverified:0,not_applicable:0})
    },
    passed:!noOfferEvidence&&issues.length===0&&complete&&!findingsLimited};
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
  if(rates.get(ip)&&now-rates.get(ip)<25000){
    const seconds=Math.max(1,Math.ceil((25000-(now-rates.get(ip)))/1000));
    return respond({error:'Another scan was requested recently. Please retry in '+seconds+' seconds.',retryAfter:seconds},429,{'retry-after':String(seconds)});
  }
  rates.set(ip,now);
  try{
    let data;
    try{data=await source.readSmallJSON(request);}
    catch(error){
      return /too large/i.test(error.message)?respond({error:'Request too large.'},413):respond({error:'Invalid JSON.'},400);
    }
    const url=urlOf(data?.url).toString();
    if(request.headers.get('accept')?.includes('application/x-ndjson'))
      return streamScan(url);
    return respond(await scanSite(url));
  }catch(error){
    const msg=str(error?.message).slice(0,180);
    console.error('Site scan failed',{name:error?.name,message:msg});
    const safe=/^Enter|^Only|^Use|^The website|^This site|^This address|^Could not|^A public/.test(msg);
    return respond({error:safe?msg:'Could not inspect this website. It may block automated scans or be temporarily unavailable.'},422);
  }
}
function streamScan(url){
  const encoder=new TextEncoder();
  let active=true;
  const stream=new ReadableStream({
    start(controller){
      const send=value=>{if(active)controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
      void scanSite(url,stage=>send({stage}))
        .then(report=>send({report}),error=>{
          const message=str(error?.message).slice(0,180);
          send({error:/^Enter|^Only|^Use|^The website|^This site|^This address|^Could not|^A public/.test(message)?
            message:'Could not inspect this website. It may block automated scans or be temporarily unavailable.'});
        }).finally(()=>{if(active)controller.close();});
    },
    cancel(){active=false;}
  });
  return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','x-accel-buffering':'no'}});
}
export function GET(){return respond({status:'ok',engine:'bounded-playwright-crawl',auditRevision:'conversion-intelligence-v5',pageLimit:LIMIT,deploymentCommit:process.env.VERCEL_GIT_COMMIT_SHA||null});}
export const _test={normalize,legal,priority,robotsRules,robotsAllow,aggregate,policyContentReview,evaluateRenderedSignals,captureRenderedSignals,captureCommerceSignals,analyzeWebsiteConversion,rendered,browserResource,waitForContent,blockedOrChallenge};
