/**
 * Evidence-aware editorial assessment. Scores are NOT observed conversions,
 * buyer sentiment, lost revenue, or a performance guarantee.
 * Only verified rendered observations may create positive ratings.
 */
const tidy=(v,max=190)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const keys=['clarity','value','trust','action','purchase'];
const bands=(v)=>v===null?'unknown':v<50?'red':v<75?'yellow':'green';
const stageOf=(entry)=>{
  const title=tidy(entry.title,180).toLowerCase();
  if(/refund|return policy|purchase terms|billing|delivery|payment terms|access after payment/.test(title))
    return 'purchase';
  return keys.includes(entry.stage)?entry.stage:null;
};
const named=(entry)=>tidy(entry.evidence,145);
const pretty=(entry)=>tidy(entry.title,105);
const firstMeaningful=(arr)=>arr.find(item=>item.confidence==='observed')||arr[0]||null;
const goodEvidence=(entry,key)=>{
  const title=tidy(entry.title,200).toLowerCase();
  if(key==='value')return /price (?:information|text) is visible/.test(title);
  if(key==='clarity')return /offer is explained in visible copy/.test(title);
  if(key==='action')return /clear next.step label is visible/.test(title);
  if(key==='trust')return /supporting proof is visible/.test(title);
  return false;
};
const stageHint={
  clarity:'Could not confirm how clearly the offer explains who it helps and what they get.',
  value:'A price alone does not show whether buyers see enough value.',
  trust:'An accessible policy page alone does not prove buyer trust.',
  action:'A visible button alone does not confirm checkout works.',
  purchase:'The full payment and delivery experience was not tested.'
};
const stageGood={
  clarity:'The offer describes the product in visible page copy.',
  value:'The page shows some price information; value is not established.',
  trust:'Relevant supporting proof appears in the offer.',
  action:'A clearly labelled next step was visible.',
  purchase:'Published purchase conditions were visible near the decision.'
};
const stageIssue={
  clarity:'Some offer wording may be unclear to new visitors.',
  value:'A price or value concern needs review.',
  trust:'Some trust information may need attention.',
  action:'A buying or signup step needs attention.',
  purchase:'Purchase conditions may leave questions unanswered.'
};
const assess=({key,issues,strengths,rendered,complete,offerPages,purchaseEvidence})=>{
  const blockers=issues.filter(x=>stageOf(x)===key);
  const positive=strengths.filter(x=>x.stage===key&&goodEvidence(x,key));
  const visible=positive.length>0;
  const strong=blockers.filter(x=>x.priority==='high'&&x.confidence==='observed');
  const high=blockers.filter(x=>x.priority==='high');
  const others=blockers.filter(x=>x.priority!=='high');
  const most=firstMeaningful(blockers);
  const quality=rendered&&offerPages>0;
  if(!quality){
    return {key,score:null,status:'Not checked',tone:'unknown',confidence:'limited',
      explanation:stageHint[key],evidence:''};
  }
  if(key==='purchase'&& !blockers.length && !purchaseEvidence){
    return {key,score:null,status:'Not checked',tone:'unknown',confidence:'limited',
      explanation:stageHint[key],evidence:''};
  }
  if(!blockers.length&&!visible&&!purchaseEvidence?.[key]){
    return {key,score:null,status:'Not checked',tone:'unknown',confidence:'limited',
      explanation:stageHint[key],evidence:''};
  }
  // No optimistic green result from price visibility or from an unverified link.
  let score=66;
  if(key==='value')score=63;
  if(key==='action')score=68;
  if(key==='trust')score=69;
  if(key==='purchase')score=68;
  if(key==='clarity')score=70;
  score+=visible?10:0;
  score-=Math.min(2,strong.length)*22;
  score-=Math.min(2,high.length-strong.length)*17;
  score-=Math.min(3,others.length)*10;
  if(!complete)score=Math.min(score,72);
  if(key==='value'&&!blockers.length)score=Math.min(score,68);
  if(key==='action'&&!blockers.length)score=Math.min(score,74);
  if(key==='purchase'&&!blockers.length)score=Math.min(score,68);
  if(key==='clarity'&&!blockers.length)score=Math.min(score,78);
  if(key==='trust'&&!blockers.length)score=Math.min(score,78);
  score=Math.max(15,Math.min(85,Math.round(score)));
  const tone=bands(score);
  const status=tone==='red'?'Weak':tone==='yellow'?'Needs work':'Looking good';
  return {key,score,status,tone,confidence:most?.confidence==='observed'?'observed':'review',
    explanation:most?stageIssue[key]:stageGood[key],
    evidence:most?named(most):visible?named(positive[0]):''};
};
export function buildReportAssessment({
  blockers=[],strengths=[],pages=[],coverage={},kind='website',renderedPages=0,inspectedOfferPages=0
}={}){
  const list=Array.isArray(blockers)?blockers.filter(x=>x&&tidy(x.title)):[];
  const positives=Array.isArray(strengths)?strengths.filter(x=>x&&tidy(x.title)):[];
  const visited=Array.isArray(pages)?pages:[];
  const rendered=kind==='website'&&Number(renderedPages)>0;
  const complete=coverage.complete!==false&&Number(coverage.sourceOnly||0)===0;
  const purchaseEvidence={};
  // Visible terms ≠ successful checkout. Never give an untested purchase a green.
  purchaseEvidence.purchase=visited.some(p=>{
    const c=p?.commerce||{};
    return p?.status==='rendered'&&!c.renderGap&&c.hasPrice===true&&
      c.termsNearAction===true&&Array.isArray(c.actions)&&c.actions.some(a=>/\b(buy|purchase|checkout|pay now|order)\b/i.test(a.label||''));
  });
  const signals=keys.map(key=>assess({
    key,issues:list,strengths:positives,rendered,complete,
    offerPages:inspectedOfferPages,purchaseEvidence
  }));
  const available=signals.filter(s=>s.score!==null);
  // At least three actual assessed areas, never a guessed full-site score.
  const overall=available.length>=3?
    Math.round(available.reduce((sum,s)=>sum+s.score,0)/available.length):null;
  return {version:1,kind:'editorial-offer-assessment',overall,
    signals,
    assessedAreas:available.length,coverage:complete?'rendered':'partial',
    note:'Estimates from observed pages and cited issues, not measured conversion rates or customer intentions.'};
}
export const _test={stageOf,bands,goodEvidence};
