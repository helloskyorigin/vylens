/**
 * VYLENS evidence-based editorial scoring.
 * 0–100 scores are NOT conversion rates, real buyer sentiment, revenue,
 * or a site-wide percentage of quality. Unchecked areas have null scores.
 */
const tidy=(x,max=185)=>String(x??'').replace(/\s+/g,' ').trim().slice(0,max);
const keys=['clarity','value','trust','action','purchase'];
const bands=score=>score===null?'unknown':score<50?'red':score<75?'yellow':'green';
const stageOf=entry=>{
  const title=tidy(entry.title).toLowerCase();
  if(/(?:refund|return policy|purchase terms|billing|delivery|payment terms|access after payment|what happens after payment)/.test(title))
    return 'purchase';
  return keys.includes(entry.stage)?entry.stage:null;
};
const goodEvidence=(entry,key)=>{
  const title=tidy(entry.title,200).toLowerCase();
  if(key==='value')return /price (?:information|text) is visible/.test(title);
  if(key==='clarity')return /offer is explained in visible copy/.test(title);
  if(key==='action')return /clear next.step label is visible/.test(title);
  if(key==='trust')return /supporting proof is visible/.test(title);
  return false;
};
const missing={
  clarity:'We could not verify that the first screen explains the offer clearly.',
  value:'We could not establish whether the benefits justify the price.',
  trust:'No specific buyer-facing proof could be verified in the checked offer.',
  action:'The main buying or signup step was not verified.',
  purchase:'Payment, access and delivery were not tested.'
};
const detected={
  clarity:'The main offer wording needs a closer look.',
  value:'A price or offer detail may leave buyers uncertain.',
  trust:'Proof or reassurance may need attention.',
  action:'The buying or signup path has a possible obstacle.',
  purchase:'Purchase conditions or access may need clarification.'
};
const round5=x=>Math.max(15,Math.min(85,Math.round(x/5)*5));
const first=items=>items.find(x=>x.confidence==='observed')||items[0]||null;
const sentence=(raw,max=155)=>{
  const text=tidy(raw,max+75);
  if(!text)return '';
  const part=text.split(/(?<=[.!?])\s+/)[0];
  return part.length<=max?part:part.slice(0,max).replace(/\s+\S*$/,'').trimEnd()+'…';
};
const observations=(p,key,understanding)=>{
  const c=p?.commerce||{};
  const result={strong:false,weak:false,description:''};
  if(key==='clarity'){
    if(understanding?.outcomeExamples?.length&&understanding.headline){
      result.strong=true;
      result.description='The offer describes: "'+tidy(understanding.outcomeExamples[0].text,94)+'".';
    }
  }else if(key==='value'){
    const pricing=Boolean(c.hasPrice||understanding?.prices?.length);
    const benefits=Boolean(understanding?.benefitExamples?.length||
      understanding?.includedExamples?.length||understanding?.outcomeExamples?.length);
    result.strong=pricing&&benefits;
    result.weak=pricing;
    if(result.strong)result.description='Price and some offer benefits were found; their value to a buyer still needs testing.';
    else if(pricing)result.description='A price was found, but price alone does not prove good value.';
  }else if(key==='trust'){
    result.strong=Boolean(understanding?.proofSeen||
      c.hasProof&&tidy(c.proofText));
    if(result.strong)result.description='Specific supporting proof was visible in the inspected offer.';
  }else if(key==='action'){
    result.weak=Boolean(understanding?.actions||
      (c.actions||[]).some(x=>/\b(buy|purchase|checkout|sign up|start free|try for free|subscribe|order|register)\b/i.test(x.label||'')));
    result.strong=result.weak;
    if(result.strong)result.description='A next-step action was visible, but completion was not tested.';
  }else if(key==='purchase'){
    const visible=Boolean(understanding?.termsNearAction||
      c.termsNearAction===true);
    result.weak=visible;
    result.strong=visible;
    if(visible)result.description='Purchase conditions appeared near a buying step; checkout was not completed.';
  }
  return result;
};
function assess(key,issues,positives,pages,understanding,complete){
  const found=issues.filter(x=>stageOf(x)===key);
  const good=positives.filter(x=>x.stage===key&&goodEvidence(x,key));
  const firstPage=pages.find(x=>x?.status==='rendered'&&x?.commerce&&!x.commerce.renderGap);
  const facts=observations(firstPage,key,understanding);
  if(good.length&&!facts.strong&&key!=='value'){
    // Backward-compatible support for explicit observations in older tests,
    // but never make a policy link equivalent to customer proof.
    facts.strong=true;
    facts.description=key==='clarity'?'The public offer explains an outcome in visible copy.':
      key==='action'?'A clearly named next step was found.':'Specific supporting proof was visible.';
  }
  if(key==='value'&&good.length&&!facts.strong)facts.weak=true;
  const serious=found.filter(x=>x.priority==='high'&&x.confidence==='observed');
  const high=found.filter(x=>x.priority==='high'&&x.confidence!=='observed');
  const reviews=found.filter(x=>x.priority!=='high');
  const main=first(found);
  const supported=Boolean(firstPage&&(found.length||facts.strong||
    (facts.weak&&key==='value'&&good.length>0)));
  if(!supported)return {key,score:null,status:'Not checked',tone:'unknown',
    confidence:'limited',explanation:missing[key],evidence:''};
  // Score only after positive/negative observations are available. Each
  // component is a cautious editorial band, not an empirical conversion model.
  let score=facts.strong?78:facts.weak?65:62;
  if(key==='value'&&!facts.strong)score=Math.min(score,60);
  if(key==='action')score=Math.min(score,73);
  if(key==='purchase')score=Math.min(score,70);
  if(!complete)score=Math.min(score,70);
  score-=Math.min(2,serious.length)*25;
  score-=Math.min(2,high.length)*18;
  score-=Math.min(3,reviews.length)*13;
  if(found.length&&!facts.strong)score=Math.min(score,59);
  score=round5(score);
  const tone=bands(score);
  const status=tone==='red'?'Weak':tone==='yellow'?'Needs work':'Looking good';
  const explanation=main?
    sentence(main.buyerConcern||main.buyerQuestion||main.evidence,155)||detected[key]:
    facts.description||missing[key];
  return {key,score,status,tone,
    confidence:serious.length?'observed':found.length?'review':
      facts.strong?'observed':facts.weak?'limited':'review',
    explanation,evidence:main?tidy(main.evidence,165):
      good.length?tidy(good[0].evidence,165):facts.description};
}
export function buildReportAssessment({
  blockers=[],strengths=[],pages=[],coverage={},kind='website',
  renderedPages=0,inspectedOfferPages=0,offerUnderstanding=null
}={}){
  const issues=Array.isArray(blockers)?blockers.filter(x=>x&&tidy(x.title)):[];
  const positives=Array.isArray(strengths)?strengths.filter(x=>x&&tidy(x.title)):[];
  const visited=Array.isArray(pages)?pages:[];
  const rendered=kind==='website'&&Number(renderedPages)>0&&Number(inspectedOfferPages)>0;
  const complete=coverage.complete!==false&&Number(coverage.sourceOnly||0)===0;
  const signals=keys.map(key=>rendered?
    assess(key,issues,positives,visited,offerUnderstanding,complete):
    {key,score:null,status:'Not checked',tone:'unknown',
     confidence:'limited',explanation:missing[key],evidence:''});
  const available=signals.filter(s=>s.score!==null);
  const graded=new Set(available.map(s=>s.key));
  // Three easy-to-spot elements must not turn an incomplete site review into
  // a seemingly authoritative conversion score. At least FOUR distinct
  // assessed dimensions, including clarity, value and the buying step.
  const substantivelyObserved=available.filter(s=>s.confidence==='observed').length;
  const directlyObservedCritical=issues.filter(x=>x.confidence==='observed'&&x.priority==='high').length;
  const enough=available.length>=4&&
    ['clarity','value','action'].every(key=>graded.has(key))&&
    (substantivelyObserved>=3||(substantivelyObserved>=2&&directlyObservedCritical>=1));
  const overall=enough?round5(available.reduce((sum,s)=>sum+s.score,0)/available.length):null;
  return {
    version:1,kind:'observed-offer-assessment',
    overall,signals,assessedAreas:available.length,totalAreas:keys.length,
    coverage:complete?'rendered':'partial',
    explanation:overall===null?
      'Not enough of the buyer experience was checked to give a responsible overall score.':
      'Editorial offer assessment from observed buyer-facing evidence; not recorded conversions.',
    note:'A score is an evidence-based review of public offer information, not actual sales, buyer behavior, or predicted revenue.'
  };
}
export const _test={stageOf,bands,goodEvidence,observations};
