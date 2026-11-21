/**
 * Offer Intelligence: evidence from the offer itself, NOT simulated customers.
 * Screenshots/DOM are observations, missing copy is an invitation to review.
 * No network calls or LLM, no fabricated promise, price, testimonials or metrics.
 */
import {isDirectAction,isPurchaseAction} from './action-intent.mjs';
const tidy=(v,max=320)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const path=url=>{try{return new URL(url).pathname||'/';}catch{return '/';}};
const offerPath=p=>p==='/'||/\/(?:product|products|pricing|plans|offer|offers|shop|services|subscribe|sale|landing)(?:[/-]|$)/i.test(p);
const weakHeadline=/^(?:welcome|home|hello|products?|services?|pricing|plans?|unlock your potential|the future is here|coming soon|our platform|all in one|everything you need|new page)\W*$/i;
const draft=/(?:lorem ipsum|insert (?:text|headline)|coming soon|your (?:company|headline) here|placeholder)/i;
const benefitWords=/(?:\b(?:help|helps|helping|build|create|grow|increase|reduce|save|automate|manage|deliver|discover|identify|improve|track|learn|receive|access|download|include|includes|included|contains|feature|features|templates?|reports?|checklists?|plans?|guides?|results?|insights?|customers?|bookings?|sales|time|money|ready.to.use|step.by.step)\b)/i;
const outcomeWords=/(?:\b(?:help|helps|improve|grow|reduce|save|automate|manage|create|build|find|identify|discover|learn|track|convert|increase|simplify|earn|generate|launch|reach|deliver|solve|understand)\b)/i;
const contentWords=/(?:\b(?:includes?|you(?:'| wi)?ll get|what(?:'s| is) included|access to|receive|download|deliver(?:ed|y)?|templates?|checklists?|pages?|lessons?|modules?|videos?|reports?|features?|guides?|support|setup|step.by.step)\b)/i;
const afterPay=/(?:\b(?:instant access|after (?:you )?(?:pay|purchase|checkout)|immediate download|digital download|delivered by email|access (?:your|the) (?:file|course|dashboard)|no subscription|billed monthly|billed annually|renew(?:al)?|cancel anytime|refund policy|all sales final|one.time payment|lifetime access)\b)/i;
const nonEnglish=s=>{
  const letters=[...String(s||'')].filter(ch=>/\p{L}/u.test(ch));
  return letters.length>=8&&letters.filter(ch=>!/\p{Script=Latin}/u.test(ch)).length/letters.length>.35;
};
const enough=s=>tidy(s).split(/\s+/).filter(Boolean).length>=7&&!draft.test(s);
const actionable=s=>enough(s)&&outcomeWords.test(s);
const standalone=s=>tidy(s,220).length>=30&&tidy(s,220).length<=165&&
    actionable(s)&&/[.!?]$/.test(tidy(s,220));
const notNoise=s=>!draft.test(s)&&!/^.{1,5}$/.test(tidy(s))&&
  !/^(?:terms|privacy|contact|home|navigation|learn more|click here)$/i.test(tidy(s));
const effectiveBuyerPage=(p)=>{
  const c=p?.commerce;
  if(p?.status!=='rendered'||!c||c.renderGap)return false;
  const pth=path(p.url);
  if(/\/(?:privacy|terms|refund|cookies?|legal|policy|disclaimer|contact)(?:[/-]|$)/i.test(pth))return false;
  const text=tidy(c.visibleText,2800);
  return (p.entry||offerPath(pth)||c.hasPrice||
    (c.actions||[]).some(isDirectAction))&&
    (!!tidy(c.heading)||!!tidy(c.intro)||!!text);
};
const make=(stage,code,title,evidence,concern,fix,verify,location,confidence='hypothesis')=>({
  stage,code,fingerprint:'offer-understanding|'+code,
  priority:'review',title,evidence,confidence,buyerQuestion:concern,
  buyerConcern:concern,fix,verify,location,source:'Public offer content',
  affectedPages:[location.split(' · ')[0]]
});
export function analyzeOfferUnderstanding(pages=[],{coverage={}}={}){
  const candidates=(Array.isArray(pages)?pages:[]).filter(effectiveBuyerPage).slice(0,20);
  const ordered=[...candidates].sort((a,b)=>{
    const priority=p=>path(p.url)==='/'?0:p.commerce?.hasPrice?1:2;
    return priority(a)-priority(b);
  });
  const home=ordered[0]||null;
  const headline=tidy(home?.commerce?.heading,180);
  const intro=tidy(home?.commerce?.intro,280);
  const examples=[];
  for(const page of ordered){
    const c=page.commerce||{},p=path(page.url);
    if(examples.length>=6)break;
    examples.push({page:p,headline:tidy(c.heading,145),description:tidy(c.intro,220),
      price:tidy(c.priceSamples?.[0],54),
      primaryAction:tidy((c.actions||[]).find(isDirectAction)?.label,72)});
  }
  const entries=ordered.flatMap(p=>{
    const c=p.commerce||{},urlPath=path(p.url);
    const listed=Array.isArray(c.benefitStatements)?c.benefitStatements:[];
    const headings=Array.isArray(c.offerSections)?c.offerSections:[];
    return [...listed,...headings].map(text=>({text:tidy(text,250),page:urlPath}));
  }).filter(x=>x.text.length>=22&&notNoise(x.text));
  const distinct=[],seen=new Set();
  entries.forEach(item=>{
    const key=item.text.toLowerCase().replace(/\W+/g,'').slice(0,110);
    if(!seen.has(key)){distinct.push(item);seen.add(key);}
  });
  const benefits=distinct.filter(x=>benefitWords.test(x.text)).slice(0,12);
  const details=distinct.filter(x=>contentWords.test(x.text)).slice(0,10);
  const introOutcomes=ordered
    .map(x=>({text:tidy(x.commerce?.intro,270),page:path(x.url)}))
    .filter(x=>actionable(x.text));
  const outcomes=[...introOutcomes,...benefits.filter(x=>actionable(x.text))].slice(0,7);
  const pricePages=ordered.filter(p=>p.commerce?.hasPrice);
  const offersPrice=pricePages.length>0;
  const paidActions=ordered.some(p=>(p.commerce?.actions||[]).some(isPurchaseAction));
  const allActions=ordered.some(p=>(p.commerce?.actions||[]).some(isDirectAction));
  const publicProof=ordered.filter(p=>p.commerce?.hasProof&&tidy(p.commerce.proofText,260));
  const termsBeside=ordered.some(p=>p.commerce?.termsNearAction===true);
  const termsPublished=ordered.some(p=>p.commerce?.hasPurchaseTerms===true);
  const offerText=ordered.map(p=>tidy(p.commerce?.visibleText,5500)).join(' ');
  const digital=/(?:\b(?:ebook|e.book|pdf|online course|digital product|download|toolkit|software|saas|app|membership|subscription|templates?|playbook|online program)\b)/i.test(offerText);
  const delivery=afterPay.test(offerText);
  const audience=/(?:\b(?:for|built for|designed for|made for|helps?)\s+(?:solo |small |new |busy )?(?:creators?|founders?|startups?|developers?|teams?|business(?:es)?|students?|freelancers?|agencies|shops?|owners?|marketers?|professionals?|teachers?|parents?|designers?|writers?|readers?|coaches?|customers?|entrepreneurs?)\b)/i.test([headline,intro,...benefits.map(x=>x.text)].join(' '));
  const understood=Boolean(home&&headline&&outcomes.length&&
    (!offersPrice||benefits.length>0||details.length>0));
  const questions=[];
  const add=item=>questions.push(item);
  const pageFor=path(home?.url||ordered[0]?.url||'/');
  const enoughBody=ordered.some(p=>tidy(p.commerce?.visibleText,10000).length>=240);
  // Do not turn a failed or source-only scan into missing-claim diagnoses.
  // English-keyword absence is NOT evidence against a Hindi/Chinese/etc offer.
  if(home&&enoughBody&&!nonEnglish(headline+' '+intro)){
    const generic=weakHeadline.test(headline)||(!headline&&intro.length<28);
    if(generic&&outcomes.length===0&&draft.test(headline)===false){
      add(make('clarity','outcome-unclear',
        'The first screen does not clearly state the buyer outcome',
        'The captured headline is "'+(headline||'not readable')+'" and the supporting text did not explain a specific result.',
        'What will this offer actually help me do?',
        'Put the real buyer outcome in the headline or first supporting line. Describe what changes after using the product, without adding unsupported promises.',
        'Show the first mobile screen to someone unfamiliar with the offer and ask them to explain the outcome.',pageFor+' · offer headline'));
    }
    if(offersPrice&&benefits.length===0&&details.length===0&&outcomes.length===0){
      const x=pricePages[0];
      add(make('value','price-without-specific-value',
        'The offer price is visible before the benefits are clear',
        'The captured '+path(x.url)+' page shows '+(x.commerce.priceSamples?.slice(0,2).join(' / ')||'a price')+
          ', but the inspected offer sections did not explain a concrete result or what is included.',
        'What exactly am I getting for this price?',
        'Show the key outcome and a short, factual list of what the buyer receives next to the price.',
        'Compare the published price block with the actual included deliverables and confirm both are readable on mobile.',
        path(x.url)+' · offer and price'));
    }else if(offersPrice&&outcomes.length>0&&details.length===0&&benefits.length<=1&&
      digital&&ordered.some(p=>tidy(p.commerce?.visibleText,8000).length>=550)){
      add(make('value','included-items-unclear',
        'The offer explains a benefit but not enough of what is included',
        'The inspected content describes "'+tidy(outcomes[0].text,150)+
          '" but did not reveal a clear list of included items next to the paid offer.',
        'What will I actually receive after buying?',
        'List the real deliverables, format or included features near the price. Do not create fictional extras.',
        'Verify the list against the real product and make it visible on mobile.',
        path(pricePages[0].url)+' · paid offer'));
    }
    if(offersPrice&&paidActions&&digital&&!delivery&&!termsBeside&&
      !/\/(?:checkout|cart)(?:[/-]|$)/i.test(pageFor)){
      add(make('purchase','after-payment-unclear',
        'The offer does not clearly explain what happens after payment',
        'The captured buying pages show a price and purchase action, but no clear delivery or access wording was recorded near the offer.',
        'How and when do I get what I paid for?',
        'Explain the real access, delivery or download process beside the purchase button. Add only verified conditions.',
        'Complete a manual test purchase in a safe test environment and confirm the published delivery wording matches it.',
        path(pricePages[0].url)+' · buying details'));
    }
    // Lack of a visible testimonial is not proof the business is untrustworthy.
    if(offersPrice&&paidActions&&!publicProof.length&&ordered.length>=1&&
      ordered.some(p=>tidy(p.commerce?.visibleText,12000).length>=750)){
      add(make('trust','proof-not-seen-near-offer',
        'Supporting proof was not visible in the checked buying sections',
        'We reviewed '+ordered.length+' buyer-facing '+(ordered.length===1?'page':'pages')+
          ' but did not capture a specific customer example, review or case study next to the offer.',
        'What real evidence supports this offer?',
        'If genuine proof exists, present a verified example, demonstration or customer result close to the offer. Never invent reviews.',
        'Check the public buying page for genuine, attributable proof and keep it readable on mobile.',
        path(pricePages[0].url)+' · trust evidence'));
    }
    if(offersPrice&&paidActions&&!termsPublished&&!termsBeside&&!delivery&&digital){
      // The after-payment finding already captures the exact purchase uncertainty.
    }
  }
  // Rewrites can only rearrange already observed claims, never invent results.
  // A complete supporting line can be promoted to the main headline when
  // the heading itself is generic. Keep unchanged facts and no new promises.
  const reuses=[];
  if(home&&weakHeadline.test(headline)){
    const truthful=introOutcomes.find(x=>standalone(x.text));
    if(truthful)reuses.push({
      kind:'copy',label:'Headline',title:'Headline using your existing offer description',
      content:truthful.text,copyFrom:headline,page:truthful.page,
      source:'Existing public description, not newly invented sales claims.',
      verify:'Confirm the meaning is accurate and readable as a headline.'
    });
  }
  return {version:1,kind:'observed-offer-understanding',
    inspectedPages:ordered.length,limited:!home||coverage?.complete===false,
    headline,intro,prices:[...new Set(pricePages.flatMap(p=>p.commerce?.priceSamples||[]))].slice(0,9),
    actions:allActions,paidActions,proofSeen:publicProof.length>0,
    termsNearAction:termsBeside,deliveryExplained:delivery,
    audienceExplicit:audience,outcomeExamples:outcomes.slice(0,4),
    benefitExamples:benefits.slice(0,5),includedExamples:details.slice(0,5),
    examples,understood,questions,reuses,
    note:'These observations come from rendered public content only. Missing capture is not proof that information does not exist.'};
}
