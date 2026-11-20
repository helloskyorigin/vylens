import {buildBuyerReplay,buildConversionFixKit} from './buyer-experience.mjs';
import {isDirectAction,isPurchaseAction,pickPrimaryAction} from './action-intent.mjs';

/**
 * VYLENS Conversion Intelligence v1.
 *
 * Diagnoses observable purchase/signup friction, NOT actual visitor drop-off.
 * No score, percentage, sales-loss estimate or unverified buyer-behavior claim.
 * Inputs are limited, publicly rendered DOM observations from the safe crawler.
 */
const tidy=(value,max=350)=>{
  const raw=String(value??'').replace(/\s+/g,' ').trim();
  if(raw.length<=max)return raw;
  // Make it obvious that evidence is shortened and never slice mid-word.
  const prefix=raw.slice(0,max);
  const sentence=Math.max(prefix.lastIndexOf('. '),prefix.lastIndexOf('? '),prefix.lastIndexOf('! '));
  const word=prefix.lastIndexOf(' ');
  const cut=sentence>max*0.7?sentence+1:word>max*0.55?word:max;
  return prefix.slice(0,cut).trimEnd().replace(/[,;:\s]+$/,'')+'…';
};
const stages=[
  {id:'clarity',label:'Offer clarity'},
  {id:'value',label:'Value & pricing'},
  {id:'trust',label:'Buyer confidence'},
  {id:'action',label:'Next step'}
];
// Match a real action label, never a piece of informational copy such as
// "Purchase Readiness 64/100". Bias toward unknown rather than false positives.
// Action classification lives in action-intent.mjs, shared with the journey renderer.
const buyerQuestionFor=title=>{
  const t=tidy(title,160).toLowerCase();
  if(t.includes('main buying action may appear late'))return 'Where do I click to buy or sign up?';
  if(t.includes('placeholder destination'))return 'Does the buy button really open checkout?';
  if(t.includes('not detected in the mobile'))return 'Where can I buy on my phone?';
  if(t.includes('difficult to find on mobile'))return 'How do I start buying on my phone?';
  if(t.includes('mobile price')||t.includes('price text differs'))return 'What does this cost on my phone?';
  if(t.includes('covered by another element'))return 'Why can I not tap this button on my phone?';
  if(t.includes('extends beyond the screen'))return 'Where did the rest of the buying button go?';
  if(t.includes('purchase terms'))return 'What are the purchase or refund conditions?';
  if(t.includes('headline is too generic'))return 'What exactly does this product do for me?';
  if(t.includes('unfinished headline'))return 'Is this offer ready for customers?';
  if(t.includes('action labels'))return 'What happens when I click this button?';
  if(t.includes('pricing is visible'))return 'How do I buy at the price shown?';
  if(t.includes('signup form'))return 'Why do I have to share so much information?';
  if(t.includes('may be unreachable'))return 'Will the purchase or signup page actually open?';
  return '';
};
const ambiguous=/^(learn more|read more|click here|explore|discover|submit|continue|view more|see more|go|next|more)$/i;
const pricePattern=/(?:[$€£₹]\s?\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s?\/\s?(?:mo|month|yr|year))?|\b(?:USD|INR|EUR|GBP)\s?\d+(?:,\d{3})*(?:\.\d{1,2})?)/i;
const commerciallyRelevant=/(?:\b(?:pricing|plans?|purchase|buy|shop|checkout|subscribe|subscription|products?|services?|book a demo|start trial|sign up)\b)/i;
const pathToLabel=(url)=>{
  try {return new URL(url).pathname.slice(0,160)||'/';}
  catch{return '/';}
};
const makeBlocker=(stage,priority,title,evidence,context,fix,verify,location,source='Rendered public page',confidence='hypothesis',effort='small')=>({
  stage,priority,title:tidy(title,155),buyerQuestion:buyerQuestionFor(title),
  evidence:tidy(evidence,560),buyerConcern:tidy(context,500),
  fix:tidy(fix,680),verify:tidy(verify,450),location:tidy(location,190),
  confidence,source,effort
});
const isSalesPath=path=>/\/(?:pricing|plans|product|products|offer|offers|purchase|shop|services|subscribe|sale|landing)(?:[\/-]|$)/i.test(path);
const isRoot=path=>path==='/'||path==='';
const priceKey=value=>String(value||'').toLowerCase().replace(/[\s,]/g,'')
  .replace(/^usd/,'$').replace(/^eur/,'€').replace(/^gbp/,'£').replace(/^inr/,'₹')
  .replace(/\.00(?=\/|$)/,'').replace(/(?:\/|per)(?:months?|mo)$/,'/mo')
  .replace(/(?:\/|per)(?:years?|yrs?)$/,'/yr');
const signalsOf=page=>page?.commerce&&typeof page.commerce==='object'?page.commerce:null;
const hasCommercialContext=(s,path)=>s.hasPrice||s.actions?.some(isDirectAction)||
  commerciallyRelevant.test(s.visibleText||'')||isSalesPath(path);
const uniq=(items,max=8)=>{
  const seen=new Set();return items.filter(item=>{
    const key=item.fingerprint||item.stage+'|'+item.title+'|'+item.location;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,max);
};

export function analyzeWebsiteConversion(pages=[],{issues=[],coverage={},destinations}={}){
  const rendered=pages.filter(p=>p&&p.status==='rendered'&&signalsOf(p));
  const notes=[],strengths=[],blockers=[];
  const candidates=rendered.filter(p=>{
    const s=signalsOf(p),path=pathToLabel(p.url),value=tidy(s.visibleText||'',2200);
    if(!p.entry&&/\/(?:privacy|terms|refund|cookies?|legal|policy|disclaimer|contact|my-reports)(?:[\/-]|$)/i.test(path))return false;
    return (p.entry||isRoot(path)||isSalesPath(path)||s.hasPrice||s.actions?.some(isDirectAction))&&
      (!!s.heading||!!s.draft||commerciallyRelevant.test(value)||commerciallyRelevant.test(path)||s.hasPrice||s.actions?.length);
  }).slice(0,20);
  const targetActions=candidates.flatMap(p=>(signalsOf(p).actions||[]).map(a=>({...a,path:pathToLabel(p.url)})));
  const buyActions=targetActions.filter(a=>isDirectAction(a));
  const goal=/\b(sign up|signup|register|start free|trial|demo|join now)\b/i.test(buyActions.map(a=>a.label).join(' '))?
    'Signup or demo requests': /\b(buy|purchase|checkout|order|cart|subscribe|pay now)\b/i.test(buyActions.map(a=>a.label).join(' '))?
    'Purchases or subscriptions':'Buying or signup actions (not confirmed)';
  for(const p of candidates){
    const s=signalsOf(p),path=pathToLabel(p.url),where=path+' · public page';
    const heading=tidy(s.heading||'',180),intro=tidy(s.intro||'',280);
    const actions=Array.isArray(s.actions)?s.actions:[];
    const mobileActions=Array.isArray(s.mobileActions)?s.mobileActions:[];
    const mobileCaptured=s.mobileCaptured===true||s.mobileCaptured===undefined&&Array.isArray(s.mobileActions);
    const phoneReliable=mobileCaptured&&!s.renderGap&&!s.resourceGap;
    const phoneContentReliable=phoneReliable&&!s.mobileGap;
    const primaryActions=actions.filter(a=>a.region!=='navigation');
    const commercial=hasCommercialContext(s,path);
    const attached=(item,code,component='')=>{
      item.code=code;
      item.fingerprint=[code,path,component].join('|');
      item.affectedPages=[path];
      blockers.push(item);
    };
    const hasDirect=actions.some(a=>isDirectAction(a));
    const hasVague=actions.filter(a=>ambiguous.test(tidy(a.label,80)));
    const price=s.priceSamples?.[0];
    const significant=p.entry||isRoot(path)||isSalesPath(path)||s.hasPrice;
    const genericHeading=/^(?:welcome|home|products?|services?|pricing|plans?|hello|untitled|coming soon|new page|our products?|the future is here|unlock your potential)\.?$/i.test(heading)||
      !!s.brand&&heading.toLowerCase()===s.brand.toLowerCase();
    const introExplainsOffer=intro.split(/\s+/).filter(Boolean).length>=10&&
      /\b(for|helps?|build|create|manage|reduce|save|automate|learn|grow|designed|turn|find|solve|track)\b/i.test(intro);
    const normalPageTitle=isSalesPath(path)&&/^(?:products?|services?|pricing|plans?)\.?$/i.test(heading);
    if(significant&&heading&&/\b(coming soon|lorem ipsum|your headline|your company here|insert headline)\b/i.test(heading)){
      blockers.push(makeBlocker('clarity','high','Unfinished headline appears in the offer',
        'The main heading visibly contains “'+heading+'”.',
        'Draft text in the main buying experience may undermine clarity or confidence.',
        'Replace template language with an accurate statement of the actual offer.',
        'Reload the published page and verify that no draft wording appears.',
        where+' · h1','Rendered public page','observed'));
    }else if(significant&&s.draft&&!s.renderGap){
      attached(makeBlocker('clarity','high','Unfinished copy appears in the public offer',
        'The offer contains the visible excerpt “'+tidy(s.draft,140)+'”.',
        'A buyer may be unsure whether the offer is ready.',
        'Replace the unfinished copy with the actual product details.',
        'Reload the page on desktop and phone and read the affected section.',
        where+' · offer copy','Rendered public page','observed'),'offer-draft');
    }else if(significant&&commercial&&genericHeading&&!normalPageTitle&&!introExplainsOffer&&!s.renderGap){
      blockers.push(makeBlocker('clarity','review',
        'The main headline is too generic to explain the offer',
        'The visible primary heading is “'+heading+'”'+(intro?' and the nearby introduction begins “'+intro.slice(0,95)+'”.':'.'),
        'A new visitor may need additional reading to understand what is being offered.',
        'Replace the generic headline with a plain-language description of who the offer helps and the outcome it provides.',
        'Ask someone unfamiliar with this business to explain the offer after reading only the first screen.',
        where+' · h1'));
    }
    if(significant&&!s.renderGap&&actions.length>0&&hasVague.length>0&&!hasDirect &&
      (s.hasPrice||commerciallyRelevant.test(tidy(s.visibleText,1600)))){
      const labels=hasVague.slice(0,3).map(a=>'“'+tidy(a.label,45)+'”').join(', ');
      blockers.push(makeBlocker('action','review',
        'The visible action labels may leave the next step unclear',
        'The visible offer uses '+labels+' without a clearly labeled buy, signup or demo action in the inspected page content.',
        'Visitors may have to click through to discover what the main action actually does.',
        'Use a direct action label describing the real next step, such as “View plans”, “Start free” or “Buy now”, when accurate.',
        'Confirm the action label and destination describe the same next step.',
        where+' · action buttons'));
      // Only offer paste-ready copy when the observed link destination supports
      // its meaning. Otherwise preserve advice rather than inventing a CTA.
      const target=hasVague.find(a=>/^\/(?:pricing|plans)(?:\/|$)/i.test(a.path||'')||
        /^\/(?:signup|register|join)(?:\/|$)/i.test(a.path||'')||
        /^\/(?:checkout|purchase)(?:\/|$)/i.test(a.path||''));
      const specific=target&&(
        /^\/(?:pricing|plans)(?:\/|$)/i.test(target.path)?'View pricing':
        /^\/(?:signup|register|join)(?:\/|$)/i.test(target.path)?'Create an account':
        'Continue to checkout');
      if(specific){
        const finding=blockers[blockers.length-1];
        finding.copyFrom=tidy(target.label,80);
        finding.copyTo=specific;
      }
    }
    if(significant&&!s.renderGap&&s.hasPrice&&!hasDirect&&!hasVague.length&&primaryActions.length===0){
      blockers.push(makeBlocker('action','review',
        'Pricing is visible but the next step was not detected',
        'A price ('+tidy(price,50)+') appears on '+path+', but no visible main-content link or button was detected in the rendered snapshot.',
        'A visitor may struggle to locate a way to continue. A widget or interaction not captured by the scan could provide one.',
        'Make the intended purchase, signup or contact action clearly reachable alongside the offer, if it is not already.',
        'Check the page on desktop and mobile and follow its main buying action.',
        where+' · pricing and main actions'));
    }
    const buyingForm=s.form&&/sign[ -]?up|register|trial|join|demo|order|checkout|billing/i.test(tidy(s.form.context||'',150)+' '+path);
    if(significant&&!s.renderGap&&buyingForm&&s.form.unnamedRequired?.length){
      attached(makeBlocker('action','high','Required fields lack accessible names',
        'Required controls with no label: '+s.form.unnamedRequired.join(', ')+'.',
        'A screen reader user may be unable to tell what the form requires.',
        'Associate each required field with a visible label and verify its accessible name.',
        'Inspect the form with a screen reader and keyboard without submitting it.',
        where+' · '+s.form.locator,'Rendered form structure','observed'),'unnamed-required-field',s.form.locator);
    }
    if(significant&&!s.renderGap&&buyingForm&&s.form.fields>=6&&s.form.required>=5){
      blockers.push(makeBlocker('action','review',
        'The signup form asks for several required fields',
        'The visible '+tidy(s.form.context||'signup',50)+' form contains '+s.form.fields+
          ' fields, including '+s.form.required+' marked required.',
        'Some visitors may hesitate when asked for a lot of information before they can begin.',
        'Review whether every required field is necessary at this stage; keep essentials first.',
        'Test the form manually without submitting private information and compare completion feedback.',
        where+' · form fields','Rendered form structure','observed','medium'));
    }
    if(significant&&!s.renderGap&&s.hasPrice&&actions.some(a=>isPurchaseAction(a)&&a.region!=='navigation')&&
      s.termsNearAction===false&&s.actions.length>0){
      blockers.push(makeBlocker('trust','review',
        'Purchase terms may be hard to find near the buying action',
        'A price ('+tidy(price,45)+') and a purchase action are visible, but no terms/refund link was detected within roughly 550 vertical pixels of the action on the inspected desktop page.'+
          (s.hasPurchaseTerms?' A policy link was found elsewhere on the page.':' This does not mean the site lacks a policy.'),
        'Someone checking the transaction conditions may have to search elsewhere. Whether this affects purchases was not measured.',
        'Where relevant, place a clear link to accurate terms, refund or access conditions near the buying decision. Do not add promises you cannot honor.',
        'Open the public offer on phone and desktop and check whether the purchase terms are easy to find without hunting.',
        where+' · purchase action'));
    }
    // Only report actual observed action destinations, never guessed click outcomes.
    const placeholder=actions.find(a=>isDirectAction(a)&&a.isPlaceholderDestination);
    if(significant&&placeholder){
      blockers.push(makeBlocker('action','review',
        'The buying button points to a placeholder destination',
        'A visible purchase action "'+tidy(placeholder.label,70)+
          '" on '+path+' has an empty or "#" destination in its rendered link.',
        'Visitors might not reach checkout unless a separate click handler is working.',
        'Verify what happens when the button is tapped. Replace an inactive placeholder with the real checkout destination if needed.',
        'Tap the action on a phone and desktop. Confirm that it opens the intended buying flow.',
        where+' · buying button','Rendered link destination','observed'));
    }
    const fragment=actions.find(a=>isDirectAction(a)&&a.missingFragment);
    if(significant&&fragment&&!s.renderGap){
      attached(makeBlocker('action','high','Buying action targets a missing page section',
        '“'+fragment.label+'” points to '+fragment.destination+', but the matching target was absent in the rendered DOM.',
        'A buyer following this link may stay on the current screen without seeing the promised next step.',
        'Restore the target ID or point the control to the right section.',
        'Open the page and verify the control scrolls to its intended section.',
        where+' · '+fragment.locator,'Rendered link destination','observed'),'missing-action-fragment',fragment.destination);
    }
    const unnamed=actions.find(a=>a.nameMissing&&/^\/(?:buy|checkout|purchase|pricing|order|signup)\b/i.test(a.path));
    if(significant&&unnamed&&!s.renderGap){
      attached(makeBlocker('action','high','A buying link has no accessible name',
        'The rendered link '+unnamed.locator+' points to '+unnamed.path+' and exposed no detectable name.',
        'A screen reader user may be unable to identify the buying step.',
        'Add meaningful visible link text or an accessible name that describes the destination.',
        'Confirm the name in the browser accessibility tree and with keyboard focus.',
        where+' · '+unnamed.locator,'Rendered link accessibility','observed'),'unnamed-buying-link',unnamed.path);
    }
    // Compare the same actual action on desktop and on a real narrow viewport.
    const preferBuy=s.hasPrice&&actions.some(isPurchaseAction);
    const desktopAction=pickPrimaryAction(actions,preferBuy);
    const phoneAction=preferBuy?mobileActions.find(isPurchaseAction)||null:
      pickPrimaryAction(mobileActions,false);
    if(significant&&phoneContentReliable&&desktopAction&&!phoneAction){
      blockers.push(makeBlocker('action','review',
        'The main buying action was not detected in the mobile page',
        'On desktop a visible action "'+tidy(desktopAction.label,70)+
          '" was found, but no equivalent clearly labeled action appeared among the inspected mobile main-content controls at 390px.',
        'A visitor using a phone may have a harder time finding how to buy or sign up. A menu or widget not captured by the scan could still provide it.',
        'Review the phone layout and ensure a clearly labeled, working buying action is visible without relying on a hidden menu.',
        'Open the mobile page and locate and follow the real buying action.',
        where+' · mobile purchase path','Rendered mobile page','hypothesis'));
    }else if(significant&&phoneReliable&&phoneAction&&desktopAction&&
      desktopAction.inFirstView===true&&phoneAction.inFirstView===false&&
      Number.isFinite(phoneAction.top)){
      blockers.push(makeBlocker('action','review',
        'The main buying action may be difficult to find on mobile',
        'The clearly labeled action "'+tidy(phoneAction.label,70)+
          '" was visible in the initial desktop screen but begins around '+
          Math.round(phoneAction.top)+'px below the top on a 390px-wide phone view.',
        'Phone visitors may need to scroll to find the next step. Sticky elements and alternative paths were not ruled out.',
        'Consider placing the real buying action near the main offer on mobile if testing confirms it is hard to find.',
        'On a phone, open the page and check whether the first screen makes the next step obvious.',
        where+' · mobile first screen','Rendered mobile page','hypothesis'));
    }
    const obstructed=[...mobileActions,...(s.narrowActions||[])].find(a=>isDirectAction(a)&&a.centerReachable===false&&
      a.inFirstView===true&&!a.clippedHorizontally);
    if(significant&&phoneReliable&&obstructed){
      blockers.push(makeBlocker('action','review',
        'A mobile buying control may be covered by another element',
        'On the '+(obstructed.frame||390)+'px view, the center of "'+tidy(obstructed.label,75)+
          '" was not the top hit-tested control, even though the button was visible in the first screen.',
        'An overlay or another element might block tapping this control. This is not a completed click test.',
        'Review overlays or sticky elements above the buying button. Keep the action unobstructed and clearly clickable.',
        'Tap the real button on a phone after clearing cookie notices, and confirm the next page opens.',
        where+' · mobile button','Rendered mobile hit test','observed'));
    }
    const clippedAction=[...mobileActions,...(s.narrowActions||[])]
      .find(a=>isDirectAction(a)&&(a.clippedHorizontally===true||a.textClipped===true));
    if(significant&&phoneReliable&&clippedAction){
      blockers.push(makeBlocker('action','review',
        clippedAction.clippedHorizontally?'The mobile buying button extends beyond the screen':'A mobile buying label is clipped',
        'The buying action "'+tidy(clippedAction.label,70)+'" at '+(clippedAction.frame||390)+
          'px '+(clippedAction.clippedHorizontally?'extends outside the viewport.':'has wider text than its clipped container.'),
        'A phone visitor may have to scroll sideways or miss part of the main action.',
        'Fit the buying action inside the mobile width without obscuring the label.',
        'Open the page at 390px and 320px, and verify the entire button is reachable.',
        where+' · mobile action bounds','Rendered mobile geometry','observed'));
    }
    // A single clear price on each viewport can be compared without mixing
    // multiple plans or currencies. Differences are for REVIEW, not fraud claims.
    const desktopPrices=Array.isArray(s.priceSamples)?s.priceSamples:[];
    const mobilePrices=Array.isArray(s.mobilePriceSamples)?s.mobilePriceSamples:[];
    const desktopPlan=s.prices?.[0]?.plan,mobilePlan=s.mobilePrices?.[0]?.plan;
    const readingSamePlan=!desktopPlan||!mobilePlan||desktopPlan===mobilePlan;
    const desktopCadence=s.prices?.[0]?.cadence,mobileCadence=s.mobilePrices?.[0]?.cadence;
    const cadenceMismatch=desktopCadence&&mobileCadence&&desktopCadence.toLowerCase()!==mobileCadence.toLowerCase();
    if(significant&&!s.renderGap&&!s.resourceGap&&!s.mobileGap&&desktopPrices.length===1&&mobilePrices.length===1&&readingSamePlan&&
       (priceKey(desktopPrices[0])!==priceKey(mobilePrices[0])||cadenceMismatch)){
      blockers.push(makeBlocker('value','review',
        'The public price text differs between desktop and mobile',
        'Desktop showed "'+tidy([desktopPrices[0],desktopCadence].filter(Boolean).join(' '),70)+
          '" and the phone view showed "'+tidy([mobilePrices[0],mobileCadence].filter(Boolean).join(' '),70)+'" on '+path+'.',
        'Responsive price variants or a currency switch may explain the difference; it needs review.',
        'Check that the intended current price and currency are clear on both devices.',
        'Confirm the same plan, locale and currency on desktop and phone.',
        where+' · price presentation','Rendered viewport price samples','hypothesis'));
    }
    if(significant&&!s.renderGap&&!s.resourceGap&&!s.mobileGap&&s.hasPrice&&s.mobilePriceVisible===false){
      blockers.push(makeBlocker('value','review',
        'A visible desktop price was not detected in the mobile page',
        'A price was observed on the inspected desktop '+path+
          ' page, but the 390px mobile main-content snapshot did not contain visible price text.',
        'Mobile buyers may not have the same price clarity. Prices behind tabs or widgets may require a separate check.',
        'Verify the real mobile page shows the correct offer price before checkout, where the business intends it to appear.',
        'Open the relevant offer on a phone and locate the current price.',
        where+' · mobile price presentation','Rendered mobile page','hypothesis'));
    }
    const tracked=s.hasPrice&&actions.some(isPurchaseAction)?
      actions.filter(isPurchaseAction):actions.filter(isDirectAction);
    if((p.entry||isRoot(path))&&!s.renderGap&&hasDirect&&s.hasPrice&&
      tracked.some(a=>a.inFirstView===false&&Number.isFinite(a.top))&&
      !tracked.some(a=>a.inFirstView===true)){
      const firstBelow=tracked.find(a=>a.inFirstView===false);
      blockers.push(makeBlocker('action','review',
        'The main buying action may appear late in the first visit',
        'The first detected main-content buying action “'+tidy(firstBelow.label,70)+
          '” begins around '+Math.round(firstBelow.top)+'px below the desktop viewport origin; no equivalent action was observed in the initial screen.',
        'Visitors may need to scroll before finding their next step. Sticky elements or alternative routes might still be available.',
        'Consider exposing the main accurate action in the first-screen content, without crowding the offer explanation.',
        'Reopen the public homepage on mobile and desktop and check how quickly a new visitor can identify the next step.',
        where+' · first-screen actions'));
    }
    const priceContrast=(p.technical?.lowContrast||[]).filter(item=>
      /\b(?:pricing|one.time|per month|subscription|refund|purchase|checkout)\b/i.test(item.text)||
      pricePattern.test(item.text)&&!/^\s*[$€£₹]/.test(item.text));
    if(significant&&!s.renderGap&&priceContrast.length){
      attached(makeBlocker('value','review','Some offer or payment copy has low contrast',
        priceContrast.slice(0,3).map(item=>'“'+item.text+'” measured '+item.ratio+':1 (target '+item.required+':1)').join('; ')+'.',
        'Important pricing or purchase context may be hard to read.',
        'Increase text contrast for the cited offer copy against its solid background.',
        'Measure the cited text and background with a browser contrast checker.',
        where+' · '+priceContrast[0].target,'Rendered text contrast','observed'),'offer-contrast');
    }
    const paid=actions.find(a=>isPurchaseAction(a)&&!a.disabled&&!a.isPlaceholderDestination&&!a.missingFragment&&a.centerReachable!==false);
    const usable=paid||actions.find(a=>isDirectAction(a)&&!a.disabled&&!a.isPlaceholderDestination&&!a.missingFragment&&a.centerReachable!==false);
    const relevantIntro=introExplainsOffer||intro.length>=38&&commercial;
    if(heading&&significant&&!genericHeading&&!s.draft&&relevantIntro)
      strengths.push({stage:'clarity',title:'The offer is explained in visible copy',
        evidence:'“'+heading+'” · “'+tidy(intro,155)+'”',location:path});
    if(s.hasPrice&&significant){
      const priceEvidence=s.prices?.length?
        [...new Set(s.prices.slice(0,8).map(x=>[x.plan,x.value,x.cadence].filter(Boolean).join(' · ')))].slice(0,2).join(' / '):
        tidy(price,65);
      strengths.push({stage:'value',title:'Price information is visible',evidence:priceEvidence,location:path});
    }
    if(usable&&significant&&!destinations?.some(d=>d.kind==='action'&&d.referrer===path&&d.state==='broken'&&d.path===usable.path))
      strengths.push({stage:'action',title:'A clear next-step label is visible',
        evidence:'“'+tidy(usable.label,65)+'”'+(usable.destination?' leads to '+usable.destination+'.':'. The control’s destination requires a manual check.'),location:path});
    if(s.hasProof&&tidy(s.proofText||'',180))strengths.push({stage:'trust',title:'Supporting proof is visible',
      evidence:'“'+tidy(s.proofText,155)+'”',location:path});
  }
  const uniqueDestinations=new Map();
  for(const link of destinations||[]){
    const group=uniqueDestinations.get(link.url)||[];
    group.push(link);
    uniqueDestinations.set(link.url,group);
  }
  for(const links of uniqueDestinations.values()){
    const link=links[0];
    if(link.state!=='broken')continue;
    const action=links.find(x=>x.kind==='action'),policy=links.find(x=>x.kind==='policy');
    const representative=action||policy;
    const refs=[...new Set(links.map(x=>x.referrer))];
    const item=makeBlocker(action?'action':'trust',action?'high':'review',
      action?'A buying-related page or link may be unreachable':'A linked purchase or privacy policy is unavailable',
      '“'+tidy(representative.label,85)+'” on '+refs.join(', ')+' links to '+link.path+
        ', which returned HTTP '+link.status+' twice.',
      action?'Following this action may interrupt the buying path.':'A buyer may be unable to review the published conditions.',
      'Restore '+link.path+' or update the link to the current public destination.',
      'Open the link from the cited page and confirm the intended destination loads.',
      refs[0]+' · '+(representative.locator||representative.label)+' → '+link.path,'Repeated public HTTP checks','observed');
    item.fingerprint=(action?'buying-destination':'policy-destination')+'|'+link.path;
    item.affectedPages=refs;
    item.destinationPath=link.path;
    blockers.push(item);
  }
  const accessiblePolicies=[...uniqueDestinations.values()].flatMap(links=>links.find(x=>x.kind==='policy'&&x.state==='responded')||[]);
  if(accessiblePolicies.length){
    strengths.push({stage:'trust',title:'Linked policies responded publicly',
      evidence:accessiblePolicies.slice(0,3).map(x=>x.label+' ('+x.path+', HTTP '+x.status+')').join(' · '),
      location:accessiblePolicies[0].referrer});
  }
  for(const p of candidates){
    const s=p.commerce,path=pathToLabel(p.url);
    if(!s.renderGap)continue;
    notes.push(path+' · '+s.renderGap+' Open the offer in a regular browser and confirm the content and primary action.');
  }
  for(const issue of (destinations===undefined?issues.slice(0,160):[])){
    const exact=tidy(issue.evidence||'',380),location=tidy(issue.location||'',150);
    if((/\b(broken|404|410|server error|returned HTTP)\b/i.test(issue.title||'')||
      /returned HTTP (?:404|410|500|502|503)/i.test(exact))&&
       /\b(?:pricing|plan|checkout|cart|buy|product|subscribe|purchase|register|signup)\b/i.test(
         location+' '+exact+' '+tidy(issue.title,150))){
      blockers.push(makeBlocker('action','high','A buying-related page or link may be unreachable',
        exact||'A linked commercial page returned a confirmed error.',
        'A visitor following that link may be unable to continue the buying or signup journey.',
        tidy(issue.fix||'Restore the public destination or update the link.'),
        tidy(issue.verify||'Open the destination and confirm that it responds normally.'),
        location||'Public link','Repeated public HTTP checks','observed','medium'));
    }
  }
  const risk=item=>{
    const severity=item.priority==='high'?0:100;
    const observed=item.confidence==='observed'?0:25;
    const interaction=item.stage==='action'?0:item.stage==='trust'?8:14;
    return severity+observed+interaction-Math.min(6,(item.affectedPages?.length||1)-1);
  };
  const grouped=uniq(blockers,100).sort((a,b)=>risk(a)-risk(b)||a.title.localeCompare(b.title));
  const normalized=grouped.slice(0,20);
  normalized.forEach((item,i)=>{
    item.id='buyer-'+(i+1);
    item.fingerprint||=[item.stage,item.title,item.location].join('|');
    const path=item.location?.split(' · ')[0];
    if(!item.affectedPages&&path?.startsWith('/'))item.affectedPages=[path];
  });
  if(grouped.length>20)notes.push('Additional supported findings exceeded the 20-finding report limit.');
  for(const gap of (coverage.gaps||[]).slice(0,6)){
    if(!notes.some(note=>note.startsWith(gap.path+' · '+gap.reason)))
      notes.push(gap.path+' · '+gap.reason+' Verify the public page directly.');
  }
  if(!rendered.length)notes.push('Browser-rendered offer evidence was unavailable; review the public homepage and primary action in a browser. HTML checks are source-only.');
  if(!candidates.length)notes.push('No public offer page could be assessed visually. Start a recheck from the specific offer or pricing URL.');
  if(coverage.remaining)notes.push(coverage.remaining+' discovered pages were outside the inspection budget.');
  if(coverage.complete===false&&!coverage.gaps?.length&&!coverage.remaining)
    notes.push('Some public pages or viewports could not be verified.');
  const unresolved=destinations?.filter(x=>x.state==='unverified')||[];
  if(unresolved.length)notes.push('Unverified linked destinations: '+[...new Set(unresolved.map(x=>x.path))].slice(0,4).join(', ')+'. Open these links in a regular browser.');
  notes.push('Actual sales, visitor drop-off and checkout completion were outside the scan. JavaScript actions were observed without clicking.');
  const limitedDetails={
    clarity:'Open the first screen and confirm it explains the offer and intended customer.',
    value:'Find the current price and billing terms on the offer or pricing page.',
    trust:'Open the relevant policies and supporting proof from the offer.',
    action:'Open the main action and confirm it leads to the intended next step.'
  };
  const supportedStrengths=[...new Map(strengths.map(item=>[[item.stage,item.title,item.evidence].join('|'),item])).values()];
  const priorityStrengths=stages.map(s=>supportedStrengths.find(x=>x.stage===s.id)).filter(Boolean);
  const shownStrengths=[...new Set([...priorityStrengths,...supportedStrengths])].slice(0,6);
  const journey=stages.map(s=>{
    const finding=normalized.find(x=>x.stage===s.id);
    const positive=shownStrengths.find(x=>x.stage===s.id);
    return {...s,status:finding?'attention':positive?'observed':'unverified',
      detail:finding?tidy(finding.evidence,218):positive?tidy(positive.evidence,218):limitedDetails[s.id]};
  });
  const buyerReplay=buildBuyerReplay(candidates.filter(p=>!p.commerce.renderGap));
  const fixKit=buildConversionFixKit(normalized,candidates);
  return {version:1,kind:'website',goal,goalEvidence:'Inferred from visible public page actions',
    blockers:normalized,strengths:shownStrengths,journey,buyerReplay,fixKit,unverified:notes,
    inspectedOfferPages:candidates.length,renderedPages:rendered.length,
    scope:'Evidence-backed public-page hypotheses. No real customer sessions, checkout submissions or revenue data were accessed.'};
}
/**
 * Optional public sales-page inspection from initial HTML only.
 * Absence of a button, review or price in initial source is NOT a blocker:
 * JavaScript might render those after load.
 */
export function analyzeSourceOffer(html,url){
  const original=String(html||'').slice(0,450000);
  const safe=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ');
  const plaintext=tidy(safe.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'"),6500);
  const heading=tidy((safe.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'',250)
    .replace(/<[^>]+>/g,' ').trim();
  const prices=[...plaintext.matchAll(/(?:[$€£₹]\s?\d+(?:,\d{3})*(?:\.\d{1,2})?|\b(?:USD|INR|GBP|EUR)\s?\d+(?:,\d{3})*(?:\.\d{1,2})?)/gi)]
    .slice(0,3).map(x=>tidy(x[0],45));
  const actions=[...safe.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)]
    .slice(0,100).map(x=>tidy(x[1].replace(/<[^>]+>/g,' '),80)).filter(Boolean);
  const blockers=[],strengths=[],unverified=[
    'Only initial public HTML was inspected for this sales page. Dynamic content, visual layout, checkout and actual purchases were not verified.'
  ];
  const path=pathToLabel(url);
  if(/\b(?:coming soon|lorem ipsum|your headline here|insert headline)\b/i.test(heading)){
    blockers.push(makeBlocker('clarity','review',
      'The public sales-page source contains a draft-like headline',
      'The page source contains a headline reading “'+heading+'”. It may differ from the rendered page.',
      'Unfinished source copy may weaken the offer if buyers actually see it.',
      'Confirm the rendered offer and replace any visible unfinished placeholder wording.',
      'Open the public sales page and inspect the final rendered headline.',
      path+' · HTML heading','Initial public HTML','source-only'));
  }
  if(prices.length)strengths.push({stage:'value',title:'Price text is present in the sales-page source',
    evidence:'Observed source price text: '+prices[0]+'. Its rendered visibility and price suitability were not verified.',location:path});
  const directAction=actions.find(a=>isDirectAction({label:a}));
  if(directAction)strengths.push({stage:'action',title:'A buying-related action label appears in the source',
    evidence:'Source label: “'+directAction+'”. Its visibility, destination and completion were not tested.',location:path});
  if(heading)strengths.push({stage:'clarity',title:'Sales-page HTML contains a primary heading',
    evidence:'Source heading: “'+heading.slice(0,130)+'”. Offer clarity requires reviewing the rendered page.',location:path});
  if(!heading)unverified.push('A rendered headline could not be verified from initial HTML; JavaScript may supply it.');
  if(!prices.length)unverified.push('The initial HTML did not confirm a visible selling price. It may be rendered later or shown in checkout.');
  const journey=stages.map(s=>{
    const count=blockers.filter(x=>x.stage===s.id).length;
    const positive=strengths.some(x=>x.stage===s.id);
    return {...s,status:count?'attention':positive?'observed':'unverified',
      detail:count?'A source-level concern needs manual review':
        positive?'A relevant source observation was found':'Not verified from initial HTML'};
  });
  blockers.forEach((b,i)=>b.id='sales-source-'+(i+1));
  return {version:1,kind:'sales-page-source',goal:'Purchase or signup presentation',
    goalEvidence:'Initial HTML only',blockers,strengths,journey,unverified,
    inspectedOfferPages:1,renderedPages:0,
    scope:'Source-only observations, without browser rendering or checkout submission.'};
}
export const _test={stages,pricePattern,isDirectAction,isPurchaseAction,ambiguous,makeBlocker,analyzeSourceOffer};
