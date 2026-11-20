/**
 * VYLENS five-card buyer intelligence — deterministic, evidence-first interpretation.
 *
 * No external model call, fabricated consumer research, real checkout click,
 * buyer-confidence score or inferred conversion percentage.
 */
import {isDirectAction,isPurchaseAction} from './action-intent.mjs';
const text=(v,n=280)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const stages=['clarity','value','trust','action'];
const stageNames={
 clarity:'Understand the actual offer and intended buyer',
 value:'Know what is included, what it costs and why it is valuable',
 trust:'Find credible proof and accurate purchase conditions',
 action:'Reach a clear next step that actually opens'
};
const locationOf=p=>{try{return new URL(p.url).pathname||'/';}catch{return '/';}};
const meaningful=i=>i&&typeof i==='object'&&text(i.title)&&text(i.evidence)&&text(i.fix);
const rank=i=>(i.priority==='high'?0:1)*100+
 (i.confidence==='observed'?0:i.confidence==='source-only'?40:15)+
 ({action:0,trust:5,value:10,clarity:15}[i.stage]??25);
const asId=(item,i)=>text(item.id||item.fingerprint||'finding-'+i,200);
const details=(item,i)=>({
 id:asId(item,i),stage:item.stage||'clarity',priority:item.priority==='high'?'high':'review',
 title:text(item.title,135),evidence:text(item.evidence,500),
 location:text(item.location,180),confidence:item.confidence||'hypothesis',
 concern:text(item.buyerConcern||item.buyerQuestion||'Potential buyer hesitation requires confirmation.',230),
 fix:text(item.fix,500),verify:text(item.verify||'Check the changed offer in a real browser.',290)
});
const categorise=item=>{
 const label=(item.title+' '+item.fix).toLowerCase();
 if(/\b(remove|delete|eliminate|placeholder|draft|unfinished|duplicat|hidden overlay|misleading copy)\b/.test(label))
   return 'remove';
 if(item.stage==='trust'||/\b(add|provide|include|show|evidence|visible|proof|confidence|review)\b/.test(label))
   return 'improve';
 return 'change';
};
const coverageStatus=(pages,coverage,kind)=>{
 if(kind==='product')return 'file-only';
 const count=pages.filter(p=>p&&p.status==='rendered'&&p.commerce).length;
 if(!count)return 'source-only';
 if(coverage.complete===false)return 'partial';
 return 'rendered';
};
const onePassEvidence=(pages)=>{
 const samples=pages.filter(p=>p&&p.status==='rendered'&&p.commerce).slice(0,20);
 const summary={
   commercialPages:0,visibleHeadings:0,visiblePrices:0,visibleNextSteps:0,
   visibleProof:0,visibleTerms:0,phoneViews:0,
   examples:[]
 };
 for(const page of samples){
   const s=page.commerce;
   const path=locationOf(page);
   const actions=Array.isArray(s.actions)?s.actions:[];
   const relevant=path==='/'||/\/(?:product|products|pricing|plans|offer|shop|services|subscribe)(?:\/|$)/i.test(path)||
     s.hasPrice||actions.some(isDirectAction);
   if(!relevant)continue;
   summary.commercialPages++;
   if(text(s.heading))summary.visibleHeadings++;
   if(s.hasPrice)summary.visiblePrices++;
   if(actions.some(isDirectAction))summary.visibleNextSteps++;
   if(s.hasProof&&text(s.proofText))summary.visibleProof++;
   if(s.hasPurchaseTerms||s.termsNearAction===true)summary.visibleTerms++;
   if(s.mobileCaptured===true||Array.isArray(s.mobileActions))summary.phoneViews++;
   if(summary.examples.length<4)summary.examples.push({
     path,headline:text(s.heading,110),intro:text(s.intro,155),
     price:text(s.priceSamples?.[0],48),
     action:text(actions.find(isPurchaseAction)?.label||actions.find(isDirectAction)?.label,65),
     proof:s.hasProof===true&&!!text(s.proofText),
     terms:s.hasPurchaseTerms===true
   });
 }
 return summary;
};
export function buildFiveCardIntelligence({
 pages=[],blockers=[],strengths=[],coverage={},kind='website',goal='Buying journey'
}={}){
 const observed=onePassEvidence(Array.isArray(pages)?pages:[]);
 const ranked=(Array.isArray(blockers)?blockers:[]).filter(meaningful)
   .slice(0,30).sort((a,b)=>rank(a)-rank(b));
 const unique=new Set();
 const findings=ranked.filter(i=>{
   const key=i.fingerprint||[i.stage,i.title,i.location].map(s=>text(s,170).toLowerCase()).join('|');
   if(unique.has(key))return false;
   unique.add(key);return true;
 }).map(details);
 const positive=Array.isArray(strengths)?strengths.filter(i=>i&&text(i.title)&&text(i.evidence)):[];
 const coverageType=coverageStatus(Array.isArray(pages)?pages:[],coverage,kind);
 const limited=coverageType==='source-only'||coverageType==='partial'||coverageType==='file-only';
 const blockersByStage=Object.fromEntries(stages.map(stage=>[stage,findings.filter(i=>i.stage===stage)]));
 const reasons=findings.slice(0,4).map(item=>({
   findingId:item.id,stage:item.stage,priority:item.priority,heading:item.title,
   buyerQuestion:item.concern,evidence:item.evidence,location:item.location,
   confidence:item.confidence
 }));
 const killers=findings.slice(0,4);
 const needs=stages.map(stage=>{
   const issue=blockersByStage[stage][0];
   const strength=positive.find(s=>s.stage===stage);
   return {
     stage,need:stageNames[stage],
     status:issue?'review':strength?'observed':'unverified',
     findingId:issue?.id||null,
     why:issue?issue.concern:strength?'Observed supporting signal; effectiveness is not measured.':
       'This buying criterion was not established from available evidence.',
     evidence:issue?.evidence||text(strength?.evidence,330),
     fix:issue?.fix||'',
     location:issue?.location||text(strength?.location,140)
   };
 });
 const actionGroups={change:[],remove:[],improve:[]};
 for(const item of findings){
   const type=categorise(item);
   if(actionGroups[type].length>=3)continue;
   actionGroups[type].push({findingId:item.id,title:item.title,fix:item.fix,
     evidence:item.evidence,verify:item.verify,location:item.location,priority:item.priority});
 }
 const blocked=killers.length>0;
 const decision={
   status:blocked?'potential-hesitation':'not-tested',
   headline:blocked?'Potential hesitation before buying':'Purchase decision cannot be determined',
   explanation:blocked?
     'The observed offer contains '+killers.length+' highlighted concern'+(killers.length===1?'':'s')+
       '. A skeptical buyer might pause. Real buyer behavior and checkout completion were not measured.':
     'No specific buying obstacle was established from assessed evidence. This does not confirm a successful purchase decision.',
   evidence:killers.slice(0,2).map(x=>({id:x.id,title:x.title,source:x.evidence})),
   questions:needs.filter(x=>x.status!=='observed').slice(0,3).map(x=>({
     stage:x.stage,question:x.need,verification:x.fix||'Verify this with a real prospective buyer.'
   })),
   nextTest:limited?
     'Review the live sales page and any unverified viewports before drawing a purchase conclusion.':
     'Ask a prospective buyer to describe the offer, find its price and follow the real next step without placing an order.'
 };
 const problemCount=findings.length,highCount=findings.filter(x=>x.priority==='high').length;
 const coverageMessage=coverageType==='source-only'?'No rendered public buying page was verified.':
   coverageType==='file-only'?'Only locally supplied product evidence was inspected.':
   coverageType==='partial'?'The rendered inspection was partial.':
   'Public buying-page evidence was inspected.';
 return {
   version:1,
   scope:'Public evidence and explicit hypotheses, not actual customer sessions, lost revenue, checkout submissions or purchase probability.',
   goal:text(goal,110),overview:{
     findingCount:problemCount,highPriorityCount:highCount,limited,
     status:coverageType,coverageMessage,observed,positiveSignals:positive.length,
     headline:problemCount?problemCount+' potential buying concern'+(problemCount===1?'':'s')+' to review':
       limited?'Buying evidence is incomplete':'No specific buying blocker established',
     intro:problemCount?'Prioritized against actual observed pages and controls. Real buyer behavior remains unmeasured.':
       limited?'Some buying decisions could not be evaluated from this scan.':
       'No supported blocker was detected in inspected areas; purchases were not tested.'
   },
   whyNotBuying:reasons,
   biggestSalesKillers:killers,
   buyerNeeds:needs,
   whatToChangeRemoveImprove:actionGroups,
   purchaseDecisionTest:decision
 };
}

/* Extra bounded checks use only recorded rendered DOM observations.
 * "Not seen" results become REVIEW hypotheses, never verified broken functionality.
 */
export function findOfferPathGaps(pages=[]){
 const findings=[];
 for(const page of (Array.isArray(pages)?pages:[]).slice(0,20)){
   const s=page?.commerce;
   if(page?.status!=='rendered'||!s||s.renderGap||s.resourceGap)continue;
   const location=locationOf(page),actions=Array.isArray(s.actions)?s.actions:[];
   const mainActions=actions.filter(a=>a.region!=='navigation');
   const mainDirect=mainActions.filter(isDirectAction);
   const navDirect=actions.filter(a=>a.region==='navigation'&&isDirectAction(a));
   const isOffer=page.entry===true||location==='/'||
     /\/(?:pricing|plans|product|products|offer)(?:\/|$)/i.test(location);
   if(!isOffer)continue;
   // The page has a verifiable commercial context and a nav-only next step.
   if(s.hasPrice===true&&navDirect.length&&mainDirect.length===0&&
      s.mobileCaptured!==false){
     findings.push({
       stage:'action',priority:'review',
       title:'The offer’s detected buying action is only in the navigation',
       evidence:'A rendered price '+text(s.priceSamples?.[0]||'',50)+' appeared on '+location+
         ', while the detected next step “'+text(navDirect[0].label,75)+
         '” was in navigation rather than main offer content.',
       buyerConcern:'Someone focused on the offer may need to search the navigation for the next step.',
       fix:'Consider placing an accurate working buying action beside the offer without removing the navigation option.',
       verify:'Open the published offer on phone and desktop; verify the main section clearly presents a next step.',
       source:'Rendered offer/navigation comparison',confidence:'hypothesis',
       location:location+' · offer/action placement',
       fingerprint:'offer-nav-only|'+location,affectedPages:[location],code:'offer-nav-only'
     });
   }
   // If a page exposes a real purchase button but no reliable, clickable destination,
   // the visible evidence is a review requirement; never call checkout broken.
   const unknownPurchase=mainActions.find(a=>isPurchaseAction(a)&&
     !a.isPlaceholderDestination&&!a.missingFragment&&!text(a.destination)&&!text(a.path));
   // Explicit buying label routed to an observed legal/info path is a concrete
   // label/destination mismatch worth review; other destinations are not judged.
   const mismatch=mainActions.find(a=>
     isPurchaseAction(a)&&
     /^\/(?:privacy|terms|refunds?|faq|help|blog|about|contact)(?:\/|$)/i.test(text(a.path,160))&&
     !a.isNewsletter);
   if(mismatch&&s.hasPrice===true){
     findings.push({
       stage:'action',priority:'review',
       title:'The purchase label and its public destination appear inconsistent',
       evidence:'The observed “'+text(mismatch.label,70)+'” control on '+location+
         ' points to '+text(mismatch.path,120)+', an informational page rather than a detected checkout URL.',
       buyerConcern:'A buyer expecting payment might arrive at an information page instead.',
       fix:'Check the real click outcome. If the destination is wrong, connect the action to the intended payment or order flow.',
       verify:'Click the public action without submitting payment and confirm that its destination matches the label.',
       source:'Rendered action destination',confidence:'hypothesis',
       location:location+' · purchase destination',fingerprint:'purchase-info-destination|'+location,
       affectedPages:[location],code:'purchase-info-destination'
     });
   }
   if(unknownPurchase&&s.hasPrice===true){
     findings.push({
       stage:'action',priority:'review',
       title:'The rendered purchase action has no inspectable destination',
       evidence:'“'+text(unknownPurchase.label,80)+'” is visible beside a priced offer on '+location+
         ', but its target was not exposed as a public link in the sampled DOM.',
       buyerConcern:'Whether clicking this button leads to checkout cannot be determined from a read-only scan.',
       fix:'Test the genuine buying button in a regular browser. Keep the real checkout accessible and clearly labeled.',
       verify:'Manually activate the button without completing payment and verify the intended next page opens.',
       source:'Rendered buying control',confidence:'hypothesis',
       location:location+' · purchase button',fingerprint:'purchase-unknown-target|'+location,
       affectedPages:[location],code:'purchase-unknown-target'
     });
   }
 }
 // Cross-page consistency: compare only the SAME explicitly named plan,
 // same currency and a single price per page. Different plans, promotions,
 // regional prices and unidentified plans are deliberately not judged.
 const seenPrices=new Map();
 for(const page of (Array.isArray(pages)?pages:[]).slice(0,20)){
   const s=page?.commerce;
   if(page?.status!=='rendered'||!s||s.renderGap||s.resourceGap||
      !Array.isArray(s.priceSamples)||s.priceSamples.length!==1||
      !Array.isArray(s.prices)||s.prices.length!==1)continue;
   const price=s.prices[0],plan=text(price?.plan,90).toLowerCase();
   const value=text(s.priceSamples[0],55),currency=(value.match(/[$€£₹]|\b(?:USD|EUR|GBP|INR)\b/i)||[])[0];
   if(!plan||!currency||!value||/^(?:pricing|plans?|products?|services?|offers?|home)$/i.test(plan))continue;
   const key=plan+'|'+currency.toUpperCase()+'|'+text(price.cadence,35).toLowerCase();
   const prev=seenPrices.get(key);
   if(!prev){seenPrices.set(key,{path:locationOf(page),value});continue;}
   if(prev.value===value||prev.path===locationOf(page))continue;
   findings.push({
     stage:'value',priority:'review',
     title:'The same named plan displays different public prices across pages',
     evidence:'Plan “'+plan+'” showed '+prev.value+' on '+prev.path+
       ' and '+value+' on '+locationOf(page)+'. Both are rendered public observations.',
     buyerConcern:'Buyers may wonder which amount applies. Promotions or presentation differences may explain it.',
     fix:'Confirm that both pages describe the same current plan, region and promotion, then make the intended price and billing terms clear.',
     verify:'Compare both pages in the same locale with active promotions and plan selection documented.',
     source:'Repeated rendered offer prices',confidence:'hypothesis',
     location:prev.path+' · '+locationOf(page)+' · named plan',
     fingerprint:'named-plan-price-mismatch|'+key,
     affectedPages:[prev.path,locationOf(page)],code:'named-plan-price-mismatch'
   });
   seenPrices.set(key,{path:locationOf(page),value});
 }
 return findings.slice(0,16);
}
