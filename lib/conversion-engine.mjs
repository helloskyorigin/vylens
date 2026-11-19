/**
 * VYLENS Conversion Intelligence v1.
 *
 * Diagnoses observable purchase/signup friction, NOT actual visitor drop-off.
 * No score, percentage, sales-loss estimate or unverified buyer-behavior claim.
 * Inputs are limited, publicly rendered DOM observations from the safe crawler.
 */
const tidy=(s,n=350)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
const stages=[
  {id:'clarity',label:'Offer clarity'},
  {id:'value',label:'Value & pricing'},
  {id:'trust',label:'Buyer confidence'},
  {id:'action',label:'Next step'}
];
const direct=/\b(buy|purchase|checkout|pay now|order now|add to cart|sign up|signup|subscribe|start free|get started|start trial|book demo|request demo|join now|download now|enroll|register)\b/i;
const ambiguous=/^(learn more|read more|click here|explore|discover|submit|continue|view more|see more|go|next|more)$/i;
const pricePattern=/(?:[$€£₹]\s?\d[\d,.]*(?:\s?\/\s?(?:mo|month|yr|year))?|\b(?:USD|INR|EUR|GBP)\s?\d[\d,.]*)/i;
const commerciallyRelevant=/(?:\b(?:pricing|plans?|purchase|buy|shop|checkout|subscribe|subscription|products?|services?|book a demo|start trial|sign up)\b)/i;
const pathToLabel=(url)=>{
  try {return new URL(url).pathname.slice(0,160)||'/';}
  catch{return '/';}
};
const makeBlocker=(stage,priority,title,evidence,context,fix,verify,location,source='Rendered public page',confidence='hypothesis',effort='small')=>({
  stage,priority,title:tidy(title,155),evidence:tidy(evidence,560),buyerConcern:tidy(context,500),
  fix:tidy(fix,680),verify:tidy(verify,450),location:tidy(location,190),
  confidence,source,effort
});
const isSalesPath=path=>/\/(?:pricing|plans|product|products|offer|offers|shop|services|subscribe|sale|landing)(?:\/|$)/i.test(path);
const isRoot=path=>path==='/'||path==='';
const signalsOf=page=>page?.commerce&&typeof page.commerce==='object'?page.commerce:null;
const uniq=(items,max=8)=>{
  const seen=new Set();return items.filter(item=>{
    const key=item.stage+'|'+item.title+'|'+item.location;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,max);
};

export function analyzeWebsiteConversion(pages=[],{issues=[],coverage={}}={}){
  const rendered=pages.filter(p=>p&&p.status==='rendered'&&signalsOf(p));
  const notes=[],strengths=[],blockers=[];
  const candidates=rendered.filter(p=>{
    const s=signalsOf(p),path=pathToLabel(p.url),value=tidy(s.visibleText||'',2200);
    return (isRoot(path)||isSalesPath(path)||s.hasPrice||s.actions?.some(a=>direct.test(a.label||'')))&&
      (commerciallyRelevant.test(value)||commerciallyRelevant.test(path)||s.hasPrice||s.actions?.length);
  }).slice(0,10);
  const first=rendered.find(p=>isRoot(pathToLabel(p.url)))||candidates[0];
  const targetActions=candidates.flatMap(p=>(signalsOf(p).actions||[]).map(a=>({...a,path:pathToLabel(p.url)})));
  const buyActions=targetActions.filter(a=>direct.test(a.label||''));
  const goal=/\b(sign up|signup|register|start free|trial|demo|join now)\b/i.test(buyActions.map(a=>a.label).join(' '))?
    'Signup or demo requests': /\b(buy|purchase|checkout|order|cart|subscribe|pay now)\b/i.test(buyActions.map(a=>a.label).join(' '))?
    'Purchases or subscriptions':'Buying or signup actions (not confirmed)';
  for(const p of candidates){
    const s=signalsOf(p),path=pathToLabel(p.url),where=path+' · public page';
    const heading=tidy(s.heading||'',180),intro=tidy(s.intro||'',280);
    const actions=Array.isArray(s.actions)?s.actions.slice(0,18):[];
    const hasDirect=actions.some(a=>direct.test(a.label||''));
    const hasVague=actions.filter(a=>ambiguous.test(tidy(a.label,80)));
    const price=s.priceSamples?.[0];
    const significant=isRoot(path)||isSalesPath(path);
    const genericHeading=/^(?:welcome|home|products?|services?|pricing|plans?|hello|untitled|coming soon|new page|our products?)\.?$/i.test(heading);
    const introExplainsOffer=intro.split(/\s+/).filter(Boolean).length>=10&&
      /\b(for|helps?|build|create|manage|reduce|save|automate|learn|grow|designed|turn|find|solve|track)\b/i.test(intro);
    const normalPageTitle=isSalesPath(path)&&/^(?:products?|services?|pricing|plans?)\.?$/i.test(heading);
    if(significant&&genericHeading&&!normalPageTitle&&!introExplainsOffer){
      blockers.push(makeBlocker('clarity','review',
        'The main headline is too generic to explain the offer',
        'The visible primary heading is “'+heading+'”'+(intro?' and the nearby introduction begins “'+intro.slice(0,95)+'”.':'.'),
        'A new visitor may need additional reading to understand what is being offered.',
        'Replace the generic headline with a plain-language description of who the offer helps and the outcome it provides.',
        'Ask someone unfamiliar with this business to explain the offer after reading only the first screen.',
        where+' · h1'));
    }else if(significant&&heading&&/\b(coming soon|lorem ipsum|your headline|your company here)\b/i.test(heading)){
      blockers.push(makeBlocker('clarity','high','Unfinished headline appears in the offer',
        'The main heading visibly contains “'+heading+'”.',
        'Draft text in the main buying experience may undermine clarity or confidence.',
        'Replace template language with an accurate statement of the actual offer.',
        'Reload the published page and verify that no draft wording appears.',
        where+' · h1','Rendered public page','observed'));
    }
    if(significant&&actions.length>0&&hasVague.length>0&&!hasDirect &&
      (s.hasPrice||commerciallyRelevant.test(tidy(s.visibleText,1600)))){
      const labels=hasVague.slice(0,3).map(a=>'“'+tidy(a.label,45)+'”').join(', ');
      blockers.push(makeBlocker('action','review',
        'The visible action labels may leave the next step unclear',
        'The visible offer uses '+labels+' without a clearly labeled buy, signup or demo action in the inspected page content.',
        'Visitors may have to click through to discover what the main action actually does.',
        'Use a direct action label describing the real next step, such as “View plans”, “Start free” or “Buy now”, when accurate.',
        'Confirm the action label and destination describe the same next step.',
        where+' · action buttons'));
    }
    if(isSalesPath(path)&&s.hasPrice&&actions.length===0){
      blockers.push(makeBlocker('action','review',
        'Pricing is visible but the next step was not detected',
        'A price ('+tidy(price,50)+') appears on '+path+', but no visible main-content link or button was detected in the rendered snapshot.',
        'A visitor may struggle to locate a way to continue. A widget or interaction not captured by the scan could provide one.',
        'Make the intended purchase, signup or contact action clearly reachable alongside the offer, if it is not already.',
        'Check the page on desktop and mobile and follow its main buying action.',
        where+' · pricing and main actions'));
    }
    if(significant&&s.form?.fields>=6&&s.form?.required>=5&&
       /signup|register|trial|join|demo/i.test(tidy(s.form.context||'',150)+' '+path)){
      blockers.push(makeBlocker('action','review',
        'The signup form asks for several required fields',
        'The visible '+tidy(s.form.context||'signup',50)+' form contains '+s.form.fields+
          ' fields, including '+s.form.required+' marked required.',
        'Some visitors may hesitate when asked for a lot of information before they can begin.',
        'Review whether every required field is necessary at this stage; keep essentials first.',
        'Test the form manually without submitting private information and compare completion feedback.',
        where+' · form fields','Rendered form structure','observed','medium'));
    }
    if(significant&&s.hasPrice&&hasDirect&&!s.hasPurchaseTerms&&s.actions.length>0&&
      /\b(buy|purchase|checkout|subscribe|order|pay now)\b/i.test(actions.map(a=>a.label).join(' '))){
      blockers.push(makeBlocker('trust','review',
        'Purchase terms are not readily visible beside this offer',
        'The inspected page shows a price ('+tidy(price,45)+') and a buying action, but no visible refund/return/terms reference was detected in the page snapshot.',
        'A buyer who wants to understand the transaction terms may need to search elsewhere. This does not prove the terms are absent from the site.',
        'Make the accurate purchase, refund or access terms easy to find near the buying decision where applicable.',
        'Check the real checkout and published policies manually; do not invent a refund promise.',
        where+' · purchase information'));
    }
    if(s.heading&&significant&&!genericHeading)strengths.push({stage:'clarity',title:'A visible offer heading exists',
      evidence:'Heading found: “'+heading+'”. This does not establish that its wording converts well.',location:path});
    if(s.hasPrice&&significant)strengths.push({stage:'value',title:'A price is visible',
      evidence:'Observed public price text: '+tidy(price,65)+'. Price fairness was not measured.',location:path});
    if(hasDirect&&significant)strengths.push({stage:'action',title:'A clear next-step label is visible',
      evidence:'Visible action: “'+tidy(actions.find(a=>direct.test(a.label||''))?.label,65)+'”. Its completion was not tested.',location:path});
    if(s.hasProof)strengths.push({stage:'trust',title:'Customer-proof language is displayed',
      evidence:'Observed proof-related text on '+path+'. Authenticity and relevance were not verified.',location:path});
  }
  for(const issue of issues.slice(0,160)){
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
  const normalized=uniq(blockers,8).sort((a,b)=>({high:0,review:1}[a.priority]??2)-({high:0,review:1}[b.priority]??2)||
    ({action:0,clarity:1,trust:2,value:3}[a.stage]??4)-({action:0,clarity:1,trust:2,value:3}[b.stage]??4));
  normalized.forEach((item,i)=>item.id='buyer-'+(i+1));
  if(!rendered.length)notes.push('Browser-rendered buying experience was unavailable; the site was checked using source-only technical observations.');
  if(!candidates.length)notes.push('No clearly commercial public page was identified in the inspected rendered pages; conversion-specific conclusions are limited.');
  if(coverage.complete===false)notes.push('Not all discovered pages could be inspected. The visible buying journey may extend beyond the covered pages.');
  notes.push('Actual sales, visitor drop-off, checkout success and buyer intent were not measured. No purchase or form was submitted.');
  const journey=stages.map(s=>{
    const count=normalized.filter(x=>x.stage===s.id).length;
    const positive=strengths.some(x=>x.stage===s.id);
    return {...s,status:count?'attention':positive?'observed':'unverified',
      detail:count?count+' potential blocker'+(count===1?'':'s')+' worth review':
        positive?'Visible supporting evidence was observed':'Not enough verified evidence to assess this stage'};
  });
  return {version:1,kind:'website',goal,goalEvidence:'Inferred from visible public page actions, not analytics',
    blockers:normalized,strengths:strengths.slice(0,6),journey,unverified:notes,
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
  const prices=[...plaintext.matchAll(/(?:[$€£₹]\s?\d[\d,.]*|\b(?:USD|INR|GBP|EUR)\s?\d[\d,.]*)/gi)]
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
  const directAction=actions.find(a=>direct.test(a));
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
export const _test={stages,pricePattern,direct,ambiguous,makeBlocker,analyzeSourceOffer};
