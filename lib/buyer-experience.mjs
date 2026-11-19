/**
 * VYLENS Buyer Journey Replay + Conversion Fix Kit
 * Pure functions. No user sessions, clicks, sales or simulated checkout.
 * Only observed public DOM/source-backed material is represented.
 */
import {isDirectAction as isAction,isPurchaseAction,pickPrimaryAction} from './action-intent.mjs';
const tidy=(value,max=420)=>{
  const raw=String(value??'').replace(/\s+/g,' ').trim();
  if(raw.length<=max)return raw;
  // Make it obvious that evidence is shortened and never slice mid-word.
  const prefix=raw.slice(0,max);
  const sentence=Math.max(prefix.lastIndexOf('. '),prefix.lastIndexOf('? '),prefix.lastIndexOf('! '));
  const word=prefix.lastIndexOf(' ');
  const cut=sentence>max*0.7?sentence+1:word>max*0.55?word:max;
  return prefix.slice(0,cut).trimEnd().replace(/[,;:\s]+$/,'')+'…';
};
const localPath=url=>{
  try{return new URL(url).pathname.slice(0,120)||'/';}
  catch{return '/';}
};
const step=(id,title,description,status,place)=>({
  id,title:tidy(title,80),description:tidy(description,240),
  status,place:tidy(place,140)
});
const introCopy=s=>{
  const raw=String(s?.intro||'').replace(/\s+/g,' ').trim();
  if(raw.length<32||raw.length>165||
    !/\b(help|helps|designed|build|create|save|manage|learn|find|grow|reduce|for)\b/i.test(raw)||
    /(?:lorem ipsum|coming soon|your company|sample text|placeholder)/i.test(raw))return '';
  // Do not clip claims or copy to 150 chars: only reuse a complete existing sentence.
  return raw;
};
const pageSignals=pages=>Array.isArray(pages)?pages.filter(p=>
  p&&p.status==='rendered'&&p.commerce&&typeof p.commerce==='object').slice(0,12):[];

export function buildBuyerReplay(pages=[]){
  const inspected=pageSignals(pages);
  if(!inspected.length)return null;
  const home=inspected.find(p=>localPath(p.url)==='/')||inspected[0];
  const sales=inspected.find(p=>p.commerce?.hasPrice)||home;
  // A newsletter signup should never be chosen instead of a real buying path.
  const actionPage=inspected.find(p=>p.commerce?.hasPrice&&
    (p.commerce?.actions||[]).some(isPurchaseAction))||
    inspected.find(p=>(p.commerce?.actions||[]).some(isPurchaseAction))||
    inspected.find(p=>(p.commerce?.actions||[]).some(isAction))||home;
  const offer=home.commerce||{},pricePage=sales.commerce||{},actionCommerce=actionPage.commerce||{};
  const offerPath=localPath(home.url),pricePath=localPath(sales.url),actionPath=localPath(actionPage.url);
  const actionCandidates=Array.isArray(actionCommerce.actions)?actionCommerce.actions:[];
  const primary=pickPrimaryAction(actionCandidates,true);
  const mobileCandidates=Array.isArray(actionCommerce.mobileActions)?actionCommerce.mobileActions:null;
  const phoneAction=mobileCandidates?(
    primary&&isPurchaseAction(primary)?
      mobileCandidates.find(isPurchaseAction)||null:
      pickPrimaryAction(mobileCandidates,true)
    ):null;
  const head=tidy(offer.heading,110);
  const price=pricePage.hasPrice?tidy(pricePage.priceSamples?.[0],40):'';
  const makeSteps=type=>{
    const phone=type==='mobile';
    const knownActions=phone?mobileCandidates:actionCandidates;
    const active=phone?phoneAction:primary;
    const available=phone?Boolean(mobileCandidates):true;
    const actionEvidence=active?
      'Visible '+(phone?'phone':'desktop')+' action: "'+tidy(active.label,80)+'"'+
      (typeof active.inFirstView==='boolean'?
        (active.inFirstView?' in the initial screen.':' below the initial screen.'):' found.'):
      (available?'A matching, clearly labeled action was not detected in the inspected main content.':
        'Phone action evidence was not captured.');
    const priceSeen=phone?pricePage.mobilePriceVisible===true:
      pricePage.hasPrice===true;
    const priceSupported=phone?typeof pricePage.mobilePriceVisible==='boolean':
      typeof pricePage.hasPrice==='boolean';
    // If a linked same-site public page was independently rendered, record
    // only that availability — never imply the checkout button was clicked.
    const linkedPage=active?.path&&active.path.startsWith('/')?
      inspected.find(p=>localPath(p.url)===active.path):null;
    const destination=active?.isPlaceholderDestination?
      'The observed link is a placeholder; a script may still handle clicks.':
      linkedPage?
      'A public page at '+tidy(active.path,105)+' was also rendered. Payment and form submission were not tested.':
      active?.path&&active.path!=='External destination'?
      'Link points to '+tidy(active.path,105)+'. Page opening and payment were not tested.':
      active?.path==='External destination'?
      'Link points outside this site. External checkout was not followed.':
      active?
      'A button exists, but its destination was not verified.':
      'No buying destination could be established from this view.';
    return [
      step('offer','1. See the offer',head?'Page headline: "'+head+'".':
        'Public page was rendered, but no clear headline was recorded.',
        head?'observed':'unknown',offerPath),
      step('price','2. Check price',priceSeen?
        'A public price was detected'+(price?' ('+price+')':'')+'.':
        'Price was not observed in the inspected '+(phone?'mobile':'desktop')+' content.',
        priceSeen?'observed':priceSupported?'review':'unknown',pricePath),
      step('action','3. Find the next step',actionEvidence,
        active?(active.inFirstView===false?'review':'observed'):
          available?'review':'unknown',actionPath),
      step('destination','4. Check the destination',destination,
        active&&active.isPlaceholderDestination?'review':linkedPage?'observed':'unknown',
        active?.path?.startsWith('/')?active.path:actionPath)
    ];
  };
  return {
    version:1,
    source:'rendered-dom',
    desktop:makeSteps('desktop'),
    mobile:makeSteps('mobile'),
    scope:'Independent public-page checkpoints, not a recorded visitor path. No checkout click, order or payment was attempted.',
    pagesInspected:inspected.length
  };
}
const blockerPage=(item,pages)=>{
  const target=tidy(item?.location,180).split(' · ')[0]||'/';
  return pages.find(p=>localPath(p.url)===target)||
    pages.find(p=>localPath(p.url)==='/')||pages[0]||null;
};
const kindFor=item=>{
  const name=tidy(item?.title,190).toLowerCase();
  if(name.includes('headline is too generic'))return 'headline';
  if(name.includes('action labels'))return 'cta';
  if(name.includes('purchase terms'))return 'terms';
  if(name.includes('may appear late')||name.includes('find on mobile'))return 'cta-placement';
  return 'action';
};
const finish=raw=>tidy(raw,660);

export function buildConversionFixKit(blockers=[],pages=[]){
  const inspected=pageSignals(pages);
  const result=[];
  for(const item of (Array.isArray(blockers)?blockers:[]).slice(0,20)){
    if(!item||!item.title||!item.fix)continue;
    const matching=blockerPage(item,inspected);
    const sig=matching?.commerce||{};
    const type=kindFor(item);
    let asset=null;
    if(item.copyTo&&item.copyFrom){
      asset={kind:'copy',label:'CTA label',title:'Ready-to-use button wording',
        content:finish(item.copyTo),
        source:'Observed label and its recorded destination',
        verify:'Check that this wording matches what the button really opens.'};
    }else if(type==='headline'&&introCopy(sig)){
      asset={kind:'copy',label:'Headline draft',title:'Headline option from existing page copy',
        content:introCopy(sig),source:'Verbatim public supporting text on '+localPath(matching.url),
        verify:'Review this wording for accuracy before making it the primary headline.'};
    }else if(type==='terms'&&sig.hasPurchaseTerms){
      asset={kind:'copy',label:'Policy link',title:'Label for the existing terms link',
        content:'Read purchase terms',source:'A terms or purchase-policy reference was observed on the public page',
        verify:'Link this label only to the actual published terms; do not imply refunds that are not offered.'};
    }else if(type==='cta-placement'){
      const recorded=(sig.actions||[]).find(isAction);
      if(recorded){
        asset={kind:'copy',label:'Existing CTA',title:'Reuse your observed button wording',
          content:finish(recorded.label),source:'Rendered main-content button on '+localPath(matching.url),
          verify:'Position the real action where it is visible, and verify its destination works.'};
      }
    }
    if(!asset)asset={kind:'checklist',label:'Fix checklist',
      title:'Make this change',content:finish(item.fix),
      source:tidy(item.location||item.source||'Recorded audit evidence',170),
      verify:finish(item.verify)};
    result.push({
      id:'kit-'+result.length,
      blockerId:tidy(item.id||'buyer-'+(result.length+1),70),
      ...asset
    });
  }
  return result;
}

export const _test={introCopy,isAction,localPath};
