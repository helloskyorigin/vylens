/**
 * VYLENS public-page source inspection, v2.
 * Deliberately passive: public GET/HEAD only, bounded response sizes, DNS pinning,
 * no browser execution, no forms submitted, no credentials, no external crawling.
 */
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

const USER_AGENT = 'VYLENS-Inspector/2.0 (+https://vylens-tan.vercel.app/)';
const MAX_HTML = 1_500_000;
const MAX_BODY = 4096;
const MAX_LINK_PROBES = 3;

function isPublicIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
      (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase().split('%')[0];
    if (v.startsWith('::ffff:')) return isPublicIP(v.slice(7));
    // Global unicast only. Deny private, loopback, link-local, multicast, IPv4 tunnels and documentation.
    const first = parseInt(v.split(':')[0] || '0',16);
    return first >= 0x2000 && first < 0x4000 &&
      !v.startsWith('2001:db8:') && !v.startsWith('2001:0:') && !v.startsWith('2002:');
  }
  return false;
}
function validateURL(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\x00-\x1f\x7f]/.test(input))
    throw new Error('Enter a valid public website URL.');
  let u;try{u = new URL(input)}catch{throw new Error('Enter a valid public website URL.')} 
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80','443'].includes(u.port))) throw new Error('Only public HTTP(S) pages on standard ports are supported.');
  const h=u.hostname.toLowerCase().replace(/\.$/,'');
  if (!/^[a-z0-9.-]+$/.test(h) || h.length > 253 || !h.includes('.') ||
      h.split('.').some(s=>!s || s.length>63 || s.startsWith('-') || s.endsWith('-')) ||
      /\.(local|internal|localhost|test|invalid|example|onion|home|lan|corp)$/.test(h) ||
      net.isIP(h) || u.pathname.length > 1000) throw new Error('Use a public website domain, not a local or reserved address.');
  u.hash='';
  return u;
}
async function resolvePublic(host) {
  const addresses=await dns.lookup(host,{all:true,verbatim:true});
  if (!addresses.length || addresses.some(a=>!isPublicIP(a.address))) throw new Error('This address cannot be inspected safely.');
  // Use a resolved address for the actual socket connection to prevent DNS rebinding.
  return addresses[0];
}
async function fetchPublic(input, {method='GET', redirects=0, timeout=7000, maxBytes=MAX_HTML,probe=false,expectedOrigin=null}={}) {
  if (redirects>3) throw new Error('The website redirected too many times.');
  const url=validateURL(input);
  if(expectedOrigin && url.origin!==expectedOrigin) throw new Error('Link redirected away from the inspected website.');
  const chosen=await resolvePublic(url.hostname);
  return new Promise((resolve,reject)=>{
    const client=url.protocol==='https:'?https:http;
    const req=client.request(url,{method,timeout,lookup:(_name,_options,cb)=>cb(null,chosen.address,chosen.family),
      headers:{'User-Agent':USER_AGENT,'Accept':method==='HEAD'?'*/*':'text/html,application/xhtml+xml;q=0.9', 'Accept-Encoding':'identity'},maxHeaderSize:16384},res=>{
      const status=res.statusCode||0;
      if (status>=300 && status<400 && res.headers.location) {
        res.resume();let next;try{next=new URL(res.headers.location,url).toString()}catch{return reject(new Error('Invalid redirect from website.'))}
        // Never follow a redirect into another scheme, local network or non-standard port.
        fetchPublic(next,{method,redirects:redirects+1,timeout,maxBytes,probe,expectedOrigin}).then(resolve,reject);return;
      }
      if (method==='HEAD') {res.resume();resolve({url:url.toString(),status,headers:res.headers,html:''});return;}
      if (status===401 || status===403) {res.resume();reject(new Error('This site blocks automated inspection. Try a public page.'));return;}
      if(status<200 || status>=300){res.resume();
        if(probe){resolve({url:url.toString(),status,headers:res.headers,html:''});return;}
        reject(new Error(`The website returned HTTP ${status}. Try another public URL.`));return;}
      // Link probes only need the final status. Don't download or parse entire pages.
      if(probe){res.destroy();resolve({url:url.toString(),status,headers:res.headers,html:''});return;}
      const type=String(res.headers['content-type']||'').toLowerCase();
      if(type && !/text\/html|application\/xhtml\+xml/.test(type)){res.resume();reject(new Error('The URL did not return an HTML webpage.'));return;}
      let size=0;const chunks=[];
      res.on('data',part=>{size+=part.length;if(size>maxBytes){req.destroy(new Error('The HTML page is too large to inspect safely.'));return;}chunks.push(part)});
      res.on('end',()=>{
        const enc=(type.match(/charset=([\w-]+)/)||[])[1]||'utf-8';let html;
        try {html=new TextDecoder(enc).decode(Buffer.concat(chunks))}catch{html=Buffer.concat(chunks).toString('utf8')}
        resolve({url:url.toString(),status,headers:res.headers,html});
      });res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('The website took too long to respond.')));
    req.on('error',reject);
    req.end();
  });
}
function decode(value='') {
  return String(value).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&#(?:39|x27);|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_m,n)=>{let v=Number(n);return v>31 && v<0x10000?String.fromCharCode(v):''})
    .replace(/\s+/g,' ').trim();
}
function textOnly(value=''){return decode(String(value).replace(/<[^>]*>/g,' ')).slice(0,400)}
function getAttr(tag,name) {
  const m=String(tag).match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));
  return m?decode(m[1]??m[2]??m[3]??''):'';
}
function hasAttr(tag,name){return new RegExp('(?:^|\\s)'+name+'(?:\\s|=|>|/)','i').test(tag)}
function tags(html,tag){return [...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(m=>m[0]);}
function paired(html,tag){return [...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'\\s*>','gi'))].map(m=>({opening:m[0].slice(0,m[0].indexOf('>')+1),inside:m[1]}));}
const squash=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,160);
function review(html,pageUrl, response={}) {
  const url=new URL(pageUrl);
  const initialHead=((html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)||[])[1]||html.slice(0,50000)).replace(/<!--[\s\S]*?-->/g,'');
  const stripped=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi,'');
  const meta=tags(initialHead,'meta');
  const metas=name=>meta.find(t=>getAttr(t,'name').toLowerCase()===name);
  const props=name=>meta.find(t=>getAttr(t,'property').toLowerCase()===name);
  const title=textOnly((initialHead.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const desc=getAttr(metas('description'),'content');
  const viewport=getAttr(metas('viewport'),'content');
  const robots=getAttr(metas('robots'),'content').toLowerCase();
  const robotsHeader=String(response.headers?.['x-robots-tag']||'').toLowerCase();
  const root=tags(stripped,'html')[0]||'';
  const headings=paired(stripped,'h1').map(x=>textOnly(x.inside)).filter(Boolean);
  const allHeadings=[...stripped.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)]
    .map(x=>({level:Number(x[1]),text:textOnly(x[2])})).filter(x=>x.text);
  const images=tags(stripped,'img');
  const imgsMissingAlt=images.filter(t=>!hasAttr(t,'alt'));
  const links=tags(stripped,'a');
  const anchors=paired(stripped,'a');
  const buttons=paired(stripped,'button');
  const forms=tags(stripped,'form');
  const inputs=[...tags(stripped,'input'),...tags(stripped,'textarea'),...tags(stripped,'select')];
  const controls=inputs.filter(t=>!/^(hidden|submit|button|reset|image)$/i.test(getAttr(t,'type')));
  const labels=tags(stripped,'label');
  const wrappingLabels=paired(stripped,'label');
  const ids=new Map();
  for (const tag of stripped.match(/<[^>]{1,1000}>/g)||[]) {
    const id=getAttr(tag,'id');if(id)ids.set(id,(ids.get(id)||0)+1);
  }
  const duplicateIDs=[...ids.entries()].filter(([,count])=>count>1).slice(0,8);
  const missingControlNames=controls.filter(t=>{
    const type=getAttr(t,'type'); if (type==='hidden'||hasAttr(t,'disabled'))return false;
    const id=getAttr(t,'id');
    return !getAttr(t,'aria-label')&&!getAttr(t,'aria-labelledby')&&!getAttr(t,'title')&&
      !(id&&labels.some(l=>getAttr(l,'for')===id))&&
      !wrappingLabels.some(l=>l.inside.includes(t));
  });
  const unnamedButtons=buttons.filter(({opening,inside})=>!textOnly(inside)&&!getAttr(opening,'aria-label')&&
    !getAttr(opening,'title')&&!getAttr(opening,'aria-labelledby'));
  const emptyLinks=anchors.filter(({opening,inside})=>!textOnly(inside)&&
    !getAttr(opening,'aria-label')&&!getAttr(opening,'title')&&!getAttr(opening,'aria-labelledby')&&
    !/<img\b[^>]*alt\s*=\s*['"][^'"]+['"]/i.test(inside));
  const brokenFragments=[];const internalLinks=[];
  for(const t of links){
    const href=getAttr(t,'href');if(!href || /^(mailto:|tel:|javascript:|data:)/i.test(href))continue;
    try{
      const target=new URL(href,pageUrl);
      if(target.origin!==url.origin)continue;
      if(target.hash&&target.pathname===url.pathname){
        const fragment=decodeURIComponent(target.hash.slice(1));
        if(fragment&&!ids.has(fragment)&&fragment!=='top'&&brokenFragments.length<6)brokenFragments.push(fragment);
      }
      if(target.pathname!==url.pathname && !target.hash && !target.search && !/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|txt|mp4|js|css|xml|json|ico|woff\d?)$/i.test(target.pathname))
        internalLinks.push({url:target.toString(),label:getAttr(t,'aria-label')||anchors.find(a=>a.opening===t)?.inside||''});
    }catch{}
  }
  const jsShell = !headings.length && /<script\b[^>]*(?:src\s*=|type\s*=\s*['"]module['"])/i.test(html) &&
    /(?:id\s*=\s*['"](?:root|app|__next|__nuxt|svelte|app-root)['"]|data-reactroot|<noscript\b)/i.test(html);
  const issues=[],checks=[];
  function add(category,severity,title,evidence,fix,location='',verify=''){
    issues.push({category,severity,title,evidence:squash(evidence).slice(0,320),fix,location,verify});
  }
  function check(name,ok,detail,{unverified=false}={}){
    checks.push({name,status:unverified?'unverified':ok?'passed':'attention',detail:squash(detail).slice(0,360)});
  }
  check('Public webpage fetched',true,`HTTP ${response.status||200}; inspected ${Math.round(Buffer.byteLength(html,'utf8')/1024)} KB of initial HTML.`);
  check('HTTPS transport',url.protocol==='https:',url.protocol==='https:'?'The inspected URL uses HTTPS.':'The inspected URL uses plaintext HTTP.');
  if(url.protocol==='http:')add('Security','high','Page is served over HTTP',`Inspected page uses ${url.protocol}//; page content is not protected by HTTPS.`, 'Publish this page over HTTPS and redirect HTTP traffic to HTTPS.','Site URL','Open the page using https:// and confirm a valid certificate.');
  check('Page title',!!title,title?`Found title: “${squash(title)}”.`:'No title element in the returned document.');
  if(!title)add('Discoverability','high','Page title is missing','No <title> element exists in the returned HTML.','Add a unique, descriptive <title> to the head.','HTML → <head>','View Page Source and confirm a specific title is present.');
  else if(title.length<16||title.length>75)add('Discoverability','note','Page title length deserves review',`Title contains ${title.length} characters: “${squash(title)}”.`,'Use a concise, descriptive title; length alone is not an SEO score.','HTML → <title>','Review how the title appears in search previews.');
  check('Meta description',!!desc,desc?`Description present (${desc.length} characters).`:'No meta name="description" in source.');
  if(!desc)add('Discoverability','note','Meta description missing','No meta description found in the returned head.','Write a specific description of the actual offer.','HTML → <head>','Inspect the page source for name="description".');
  check('Primary H1 heading',headings.length>0,jsShell?'This page uses a JavaScript app shell. Rendered headings were not inspected.':`Found ${headings.length} non-empty H1 heading(s).`,{unverified:jsShell});
  if(!headings.length)add('Page structure',jsShell?'note':'high','No primary H1 heading in page source','No non-empty H1 element was found in the returned HTML.','Add a real H1 that describes the page purpose; for JS-rendered pages, verify the rendered DOM separately.','Page content','Open the rendered page and inspect the heading hierarchy.');
  else if(headings.length>1)add('Page structure','note','Multiple H1 headings found',`Found ${headings.length} non-empty H1 elements. This may be intentional.`, 'Confirm the heading structure reads sensibly for assistive technology.','Page content','Inspect the rendered page headings in DOM order.');
  if(allHeadings.length>1){
    const skips=[]; for(let i=1;i<allHeadings.length;i++)if(allHeadings[i].level>allHeadings[i-1].level+1)skips.push(`${allHeadings[i-1].level} → ${allHeadings[i].level}`);
    check('Heading hierarchy',!skips.length,skips.length?`Detected jumps: ${skips.slice(0,4).join(', ')}.`:'No skipped heading levels among parsed headings.');
    if(skips.length)add('Accessibility','note','Heading levels skip ahead',`Heading sequence includes: ${skips.slice(0,4).join(', ')}.`, 'Use a logical heading hierarchy where possible.','Document headings','Navigate headings with a screen reader or browser accessibility tree.');
  } else check('Heading hierarchy',false,'Too few headings to evaluate hierarchy.',{unverified:true});
  check('Mobile viewport configuration',/width\s*=\s*device-width/i.test(viewport),viewport||'No width=device-width viewport found.');
  if(!/width\s*=\s*device-width/i.test(viewport))add('Mobile setup','high','Mobile viewport not configured',`Viewport meta content: ${viewport||'(missing)'}.`,'Add <meta name="viewport" content="width=device-width, initial-scale=1">.','HTML → <head>','Inspect on an actual small viewport.');
  const lang=getAttr(root,'lang');check('Document language',!!lang,lang?`Declared language: ${lang}.`:'Root <html> tag does not declare lang.');
  if(!lang)add('Accessibility','note','Document language not declared','The root HTML tag has no lang attribute.','Set the correct document language, for example lang="en".','HTML → <html>','Verify document language in the rendered DOM.');
  check('Image alt attributes',images.length>0&&imgsMissingAlt.length===0,images.length?`${images.length-imgsMissingAlt.length}/${images.length} <img> elements specify alt (including decorative alt="").`:'No <img> elements in the initial HTML.',{unverified:images.length===0});
  if(imgsMissingAlt.length)add('Accessibility','note','Images are missing alt attributes',`${imgsMissingAlt.length} of ${images.length} <img> elements have no alt attribute. Decorative images should use alt="".`, 'Add meaningful alt text for informative images, and alt="" for decorative ones.','HTML → Images','Review every image for appropriate accessible text.');
  check('Form control accessible labels',controls.length>0&&missingControlNames.length===0,controls.length?`${controls.length-missingControlNames.length}/${controls.length} control(s) have an explicit label or accessible name.`:'No input controls found.',{unverified:controls.length===0});
  if(missingControlNames.length)add('Accessibility','high',`${missingControlNames.length} form controls lack accessible names`,`${missingControlNames.length} of ${controls.length} detected controls have no associated <label for>, aria-label or title.`, 'Give every meaningful input an explicit associated label or accessible name.','HTML → Forms','Tab through the actual form and inspect names in accessibility tools.');
  check('Button accessible names',buttons.length>0&&unnamedButtons.length===0,buttons.length?`${buttons.length-unnamedButtons.length}/${buttons.length} buttons have text or an accessible name.`:'No button elements found.',{unverified:buttons.length===0});
  if(unnamedButtons.length)add('Accessibility','high',`${unnamedButtons.length} button elements have no accessible name`,`${unnamedButtons.length} rendered-source button(s) have neither text nor a label attribute.`, 'Give icon-only buttons an aria-label or visible text.','HTML → Buttons','Inspect each button with the accessibility tree.');
  check('Link accessible names',anchors.length>0&&emptyLinks.length===0,anchors.length?`${anchors.length-emptyLinks.length}/${anchors.length} anchor elements have text or a detectable accessible name.`:'No anchors found.',{unverified:anchors.length===0});
  if(emptyLinks.length)add('Accessibility','note','Links with no readable label detected',`${emptyLinks.length} anchors have no text or detected accessible name.`, 'Ensure icon-only and image-only links have an accessible name.','HTML → Links','Inspect the affected links in the accessibility tree.');
  check('Unique element IDs',duplicateIDs.length===0,duplicateIDs.length?`Repeated IDs: ${duplicateIDs.map(([id,count])=>id+' ×'+count).join(', ')}.`:`${ids.size} unique IDs found.`);
  if(duplicateIDs.length)add('Document structure','high','Duplicate element IDs found',`IDs reused in the initial HTML: ${duplicateIDs.map(([id,count])=>id+' (${count})').join(', ')}.`, 'Give elements unique IDs; this prevents label/anchor conflicts.','HTML → id attributes','Search the DOM for each repeated ID and confirm only one occurrence.');
  check('In-page anchor targets',brokenFragments.length===0,brokenFragments.length?`Links reference missing targets: ${brokenFragments.join(', ')}.`:'No missing fragment targets detected among same-page links.',{unverified:jsShell});
  if(brokenFragments.length)add('Navigation',jsShell?'note':'high','In-page links point to missing sections',`Targets not found in source: ${brokenFragments.map(s=>'#'+s).join(', ')}.`, 'Update fragment links or add matching IDs (confirm JS-rendered targets first).','Page navigation','Click each link on the rendered page and confirm it scrolls to the right section.');
  const robotsBlocked=/\bnoindex\b/.test(robots)||/\bnoindex\b/.test(robotsHeader);
  check('Indexability directive',!robotsBlocked,[robots?`Meta robots: ${robots}.`:null,robotsHeader?`X-Robots-Tag: ${robotsHeader}.`:null].filter(Boolean).join(' ')||'No noindex directive found in the initial response.');
  if(robotsBlocked)add('Discoverability','note','Page explicitly requests noindex',
    `A noindex directive is present${robotsHeader?' in response headers':''}. This is often intentional for staging or private pages.`,
    'If this is a public page intended for search, remove noindex; otherwise keep it.','Metadata / X-Robots-Tag',
    'Confirm that search indexing is intended, then inspect both the rendered document and HTTP headers.');
  const canonical=tags(initialHead,'link').find(t=>getAttr(t,'rel').toLowerCase().split(/\s+/).includes('canonical'));
  check('Canonical URL',!!canonical,'Canonical link '+(canonical?`found: ${squash(getAttr(canonical,'href'))}.`:'not declared.'));
  if(!canonical)add('Discoverability','note','Canonical URL not declared','No rel="canonical" was found in initial HTML.','Consider a canonical URL for public pages with duplicates or query variants.','HTML → <head>','Review canonical settings in source.');
  const ogTitle=!!props('og:title');const ogDescription=!!props('og:description');
  check('Social preview metadata',ogTitle&&ogDescription,`og:title ${ogTitle?'present':'absent'}, og:description ${ogDescription?'present':'absent'}.`);
  if(!ogTitle||!ogDescription)add('Sharing','note','Social preview fields incomplete','Not all primary Open Graph text fields are present.','Add truthful og:title and og:description fields for shared links.','HTML → Meta tags','Preview the page in social-sharing tools.');
  const icon=tags(initialHead,'link').some(t=>/\bicon\b/i.test(getAttr(t,'rel')));
  check('Favicon declared',icon,icon?'Favicon link present.':'No favicon link tag found.');
  if(!icon)add('Branding','note','Favicon not declared','No <link rel="icon"> appeared in the initial head.','Declare a favicon to support recognition in tabs and bookmarks.','HTML → <head>','Open the page in a browser tab.');
  const insecureActions=forms.filter(f=>{try{return new URL(getAttr(f,'action')||pageUrl,pageUrl).protocol==='http:' && url.protocol==='https:'}catch{return false}});
  check('Secure form actions',insecureActions.length===0,forms.length?`${insecureActions.length} of ${forms.length} form actions point from HTTPS to HTTP.`:'No forms in source.',{unverified:!forms.length});
  if(insecureActions.length){
    const insecurePost=insecureActions.filter(f=>(getAttr(f,'method')||'get').toLowerCase()==='post');
    add('Security',insecurePost.length?'high':'note','Form uses an insecure HTTP destination',
      `${insecureActions.length} form(s) declare an HTTP destination on an HTTPS page (${insecurePost.length} POST). This is a source-level risk, not proof that data was submitted.`,
      'Use HTTPS form destinations, especially when collecting user data; verify the rendered form and server endpoint.',
      'HTML → Form action','Confirm the actual form method and destination in DevTools; test only your own forms.');
  }
  if(jsShell){ // No false strong claims about client-rendered sites.
    for(const issue of issues){if(['No primary H1 heading in page source','In-page links point to missing sections'].includes(issue.title))issue.severity='note'}
  }
  if(jsShell)check('Client-rendered content',false,'Page appears to rely on JavaScript; rendered content was not evaluated.',{unverified:true});
  const navLinks=[...new Map(internalLinks.map(x=>[x.url,x])).values()]
    .filter(x=>!/(login|logout|signout|checkout|pay|order|cart|remove|delete|admin|api\/|account|register|auth)/i.test(new URL(x.url).pathname))
    .slice(0,MAX_LINK_PROBES);
  issues.forEach((x,i)=>x.id=i+1);
  return {issues,checks,navLinks,pageTitle:title||url.hostname,stats:{h1:headings.length,images:images.length,links:links.length,forms:forms.length},scope:
    'Passive inspection of the initial public HTML response, metadata, headings, link targets, accessible names and limited same-origin links. No JavaScript execution, visual screenshot, colour contrast measurement, checkout submission, traffic or conversion analytics.',
    jsShell};
}
async function scan(url,{fetcher=fetchPublic}={}) {
  const primary=await fetcher(url);
  if(!primary.html.trim() || !/<(?:html|head|body)\b/i.test(primary.html))
    throw new Error('The page did not return a usable HTML document.');
  const main=review(primary.html,primary.url,{status:primary.status});
  const {navLinks}=main;delete main.navLinks;
  const observed=Array(navLinks.length);
  await Promise.all(navLinks.map(async (link, linkIndex)=>{
    try{
      const origin=new URL(primary.url).origin;
      const options={method:'HEAD',timeout:3000,probe:true,expectedOrigin:origin};
      const response=await fetcher(link.url,options);
      // Some sites reject or misroute HEAD. A second public GET is required to
      // confirm a 404/410 before publishing a broken-link finding.
      const useGet=[403,404,405,410,501].includes(response.status);
      const confirmed=useGet ?
        await fetcher(link.url,{method:'GET',timeout:3000,maxBytes:60_000,probe:true,expectedOrigin:origin}):response;
      const broken=[404,410].includes(confirmed.status);
      observed[linkIndex]={name:`Internal link ${new URL(link.url).pathname.slice(0,70)}`,status:broken?'attention':confirmed.status>=200&&confirmed.status<400?'passed':'unverified',
        detail:`HTTP ${confirmed.status}${useGet?' confirmed with GET':' from HEAD'} for a same-origin link.`};
      if(broken)main.issues.push({category:'Navigation',severity:'high',title:'Internal link is broken',
        evidence:`${new URL(link.url).pathname} returned HTTP ${confirmed.status} on both HEAD and GET.`,
        fix:'Update the internal destination, or restore the linked page.',location:`Link → ${new URL(link.url).pathname}`,
        verify:'Open the link and confirm it loads a real page without an error.'});
    }catch(error){observed[linkIndex]={name:`Internal link ${new URL(link.url).pathname.slice(0,70)}`,status:'unverified',
      detail:'Could not verify the internal page safely. No broken-link claim was made.'};}
  }));
  main.checks.push(...observed.filter(Boolean));
  const rank={critical:0,high:1,note:2};main.issues.sort((a,b)=>(rank[a.severity]??2)-(rank[b.severity]??2));
  main.issues.forEach((issue,i)=>issue.id=i+1);
  const checked=['HTTP response','HTTPS','Page title and description','Heading hierarchy','Mobile viewport','Accessibility names','On-page links','Indexability','Social metadata','Up to 3 same-origin links'];
  return {mode:'website',url:primary.url,subject:new URL(primary.url).hostname,pageTitle:main.pageTitle,
    summary:`Inspected public HTML for ${new URL(primary.url).hostname}. Found ${main.issues.length} source-backed observations across ${main.checks.length} attempted checks; rendered visual and checkout behavior were not tested.`,
    meta:`HTTP ${primary.status} · Source inspection`,coverageLabel:'Public HTML + link verification',scope:main.scope,
    checked,checkedAt:new Date().toISOString(),checks:main.checks,checksRun:main.checks.length,
    issues:main.issues,totalDetected:main.issues.length,passed:main.issues.length===0&&!main.checks.some(c=>c.status==='unverified'),
    stats:main.stats,engine:'vylens-source-v3'};
}
const recent=new Map();
function rateAllowed(key){const now=Date.now();const current=recent.get(key)||{since:now,count:0};if(now-current.since>60000){current.since=now;current.count=0}current.count++;recent.set(key,current);if(recent.size>1000)recent.clear();return current.count<=8}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"};
const reply=(value,status=200)=>Response.json(value,{status,headers});
export function GET(){return reply({status:'ok',engine:'vylens-source-v3',checks:'public HTML and bounded same-origin links',visualRendering:false});}
async function readSmallJSON(request){
  // Enforce the raw byte budget before JSON decoding rather than allocating an
  // arbitrary-size string and only then checking its length.
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_BODY)throw new Error('Request is too large.');
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Request must contain JSON.');
  const chunks=[];let size=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>MAX_BODY){await reader.cancel();throw new Error('Request is too large.');}
    chunks.push(value);
  }
  const raw=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).toString('utf8');
  try{return JSON.parse(raw)}catch{throw new Error('Request must contain JSON.');}
}
export async function POST(request){
  if(!/^application\/json\b/i.test(request.headers.get('content-type')||''))
    return reply({error:'Send application/json for website scans.'},415);
  const origin=request.headers.get('origin');
  if(origin){
    try{if(new URL(origin).origin!==new URL(request.url).origin)return reply({error:'Cross-origin scan requests are not supported.'},403);}
    catch{return reply({error:'Invalid request origin.'},403);}
  }
  const key=(request.headers.get('x-forwarded-for')||'unidentified').split(',')[0].slice(0,100);
  if(!rateAllowed(key))return reply({error:'Too many scans. Try again in a minute.'},429);
  try{
    const body=await readSmallJSON(request);
    if(!body||typeof body.url!=='string')throw new Error('A public website URL is required.');
    validateURL(body.url);
    return reply(await scan(body.url));
  }catch(error){
    const message=String(error?.message||'Could not scan this website.');
    const bad=/^Enter|^Only|^Use|^Request|^A public|^This URL/.test(message);
    const allowed=/^Enter|^Only|^Use|^Request|^A public|^This URL|^This address|^The website|^The URL|^This site|^Invalid redirect|^Too many|^Could not|^The HTML/.test(message);
    return reply({error:allowed?message:'Could not inspect this site. It may block automated requests or be temporarily unavailable.'},bad?400:422);
  }
}
export const _test={isPublicIP,validateURL,review,scan,decode,getAttr};
