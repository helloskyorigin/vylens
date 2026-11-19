import assert from 'node:assert/strict';
import {analyzeWebsiteConversion,analyzeSourceOffer} from './lib/conversion-engine.mjs';

const page=(path,commerce)=>({url:'https://example.org'+path,status:'rendered',commerce});
const offer=(overrides={})=>({
  heading:'Tools to help founders grow their startups',
  intro:'Help founders identify the problems stopping their buyers from finding the next action.',
  visibleText:'Founder growth tools. Pricing starts at $29. Sign up to begin.',
  actions:[{label:'Sign up',path:'/register'}],
  priceSamples:['$29'],hasPrice:true,hasPurchaseTerms:true,hasProof:false,form:null,...overrides
});
const clean=analyzeWebsiteConversion([page('/',offer())],{coverage:{complete:true}});
assert.equal(clean.blockers.length,0,'normal commercial landing page must not produce imagined blockers');
assert.equal(clean.journey.length,4,'always provide the four buyer stages');
assert.ok(clean.strengths.some(x=>x.stage==='action'),'visible signup label is a supported positive');
assert.ok(clean.unverified.some(x=>x.includes('Actual sales')),'never claim observed conversions');

const vague=analyzeWebsiteConversion([page('/',offer({
  heading:'Welcome',intro:'Hi.',
  actions:[{label:'Learn more',path:'/pricing'}],hasPurchaseTerms:false
}))],{coverage:{complete:true}});
assert.ok(vague.blockers.some(x=>x.stage==='clarity'),'generic unsupported homepage heading deserves review');
assert.ok(vague.blockers.some(x=>x.stage==='action'),'ambiguous buying CTA deserves review');
assert.ok(vague.blockers.every(x=>x.evidence&&x.fix&&x.buyerConcern&&x.verify),
  'all buyer blockers have evidence, rationale, fix and verification');
assert.ok(vague.blockers.every(x=>!/\b\d+%/.test(x.buyerConcern)),
  'no invented conversion rate');

const richIntro=analyzeWebsiteConversion([page('/',offer({
  heading:'Welcome',
  intro:'We help founders launch and grow their businesses by simplifying customer onboarding in one platform.'
}))],{coverage:{complete:true}});
assert.ok(!richIntro.blockers.some(x=>x.stage==='clarity'),
  'informative supporting copy avoids falsely flagging a conventional headline');
const pricing=analyzeWebsiteConversion([page('/pricing',offer({
  heading:'Pricing',intro:'Choose a plan to suit your needs.'
}))],{coverage:{complete:true}});
assert.ok(!pricing.blockers.some(x=>x.stage==='clarity'),
  'Pricing is a valid heading on a pricing page');

const broken=analyzeWebsiteConversion([page('/',offer())],{
 issues:[{title:'Linked page returned HTTP 404',severity:'high',category:'Navigation',
   location:'/pricing',evidence:'The public /pricing destination returned HTTP 404 twice.',
   fix:'Restore the pricing page.',verify:'Open pricing page and confirm it works.'}],
 coverage:{complete:true}
});
assert.ok(broken.blockers.some(x=>x.priority==='high'&&x.stage==='action'),
  'verified buying-path HTTP error becomes a genuine blocker');
const irrelevant=analyzeWebsiteConversion([page('/',offer())],{
 issues:[{title:'Favicon declaration missing',severity:'note',category:'Brand',
   location:'HTML head',evidence:'Missing favicon.'}],coverage:{complete:true}
});
assert.equal(irrelevant.blockers.length,0,'technical-only metadata is not silently relabeled as lost sales');
const sourceOnly=analyzeWebsiteConversion([],{coverage:{complete:false}});
assert.equal(sourceOnly.blockers.length,0,'no visual/browser observation must produce no fabricated blockers');
assert.ok(sourceOnly.unverified.some(x=>x.includes('source-only')));

const source=analyzeSourceOffer(
  '<html><body><h1>Coming soon</h1><p>Buy this kit for $19</p><a href="/buy">Buy now</a></body></html>',
  'https://example.org/offer');
assert.equal(source.blockers.length,1,'only literal draft-like source headlines produce this source finding');
assert.equal(source.blockers[0].confidence,'source-only');
assert.equal(source.strengths.length,3,'price and action source observations are preserved');
const dynamic=analyzeSourceOffer('<html><head></head><body><div id="app"></div><script>renderOffer()</script></body></html>',
  'https://example.org/product');
assert.equal(dynamic.blockers.length,0,'blank SPA source cannot imply a missing CTA');
assert.ok(dynamic.unverified.some(x=>x.includes('JavaScript')));

// Buyer-proximate trust cues must not be confused with an unrelated footer link.
const footerTerms=analyzeWebsiteConversion([page('/',offer({
  actions:[{label:'Buy now',path:'/order',top:320,inFirstView:true}],
  hasPurchaseTerms:true,termsNearAction:false
}))],{coverage:{complete:true}});
assert.ok(footerTerms.blockers.some(x=>x.stage==='trust'&&x.evidence.includes('elsewhere')),
  'footer policy link alone does not prove buyer-adjacent purchase terms');
const nearbyTerms=analyzeWebsiteConversion([page('/',offer({
  actions:[{label:'Buy now',path:'/order',top:320,inFirstView:true}],
  hasPurchaseTerms:true,termsNearAction:true
}))],{coverage:{complete:true}});
assert.ok(!nearbyTerms.blockers.some(x=>x.stage==='trust'),'terms beside purchase action avoid this heuristic blocker');
const belowFold=analyzeWebsiteConversion([page('/',offer({
  actions:[{label:'Buy now',path:'/order',top:1350,inFirstView:false}]
}))],{coverage:{complete:true}});
assert.ok(belowFold.blockers.some(x=>x.stage==='action'&&x.title.includes('late')),
  'off-screen buyer CTA becomes an evidence-qualified concern');
const firstScreen=analyzeWebsiteConversion([page('/',offer({
  actions:[{label:'Buy now',path:'/order',top:250,inFirstView:true}]
}))],{coverage:{complete:true}});
assert.ok(!firstScreen.blockers.some(x=>x.title.includes('late')),
  'in-first-view CTA should not trigger a scroll-friction warning');
const draft=analyzeWebsiteConversion([page('/',offer({
  heading:'Coming soon',intro:'Tiny placeholder sentence.'
}))],{coverage:{complete:true}});
assert.ok(draft.blockers.some(x=>x.priority==='high'&&x.title.includes('Unfinished')),
  'unpublished draft heading is more serious than an ordinary generic title');
assert.ok(!draft.blockers.some(x=>x.title.includes('too generic')),
  'one draft heading is not duplicated as a weaker generic finding');
const customerProof=analyzeWebsiteConversion([page('/',offer({
  hasProof:true,proofText:'Our small business customer saved onboarding time after using this product.'
}))],{coverage:{complete:true}});
assert.ok(customerProof.strengths.some(x=>x.stage==='trust'&&x.evidence.includes('customer saved')),
  'proof section is grounded in an actual visible excerpt');
const proofWithoutEvidence=analyzeWebsiteConversion([page('/',offer({hasProof:true}))],
 {coverage:{complete:true}});
assert.ok(!proofWithoutEvidence.strengths.some(x=>x.stage==='trust'),
 'trust positive is not claimed without observable supporting text');

// A navigation item about purchase readiness is NOT a buy/checkout button.
const scoreLink=analyzeWebsiteConversion([page('/',offer({
  heading:'Purchase Readiness Audit',
  actions:[{label:'Purchase Readiness 64/100',path:'/score',top:1206,inFirstView:false}],
  hasPurchaseTerms:true,termsNearAction:false
}))],{coverage:{complete:true}});
assert.ok(!scoreLink.blockers.some(x=>/main buying action may appear late|purchase terms/i.test(x.title)),
  'purchase readiness text must not masquerade as a real purchase CTA');
assert.ok(!scoreLink.strengths.some(x=>x.stage==='action'),
  'purchase readiness score must not count as clear purchase action');
const exactCTA=analyzeWebsiteConversion([page('/',offer({
  actions:[{label:'Buy now',path:'/purchase',top:1250,inFirstView:false}],
  hasPurchaseTerms:true,termsNearAction:false
}))],{coverage:{complete:true}});
assert.ok(exactCTA.blockers.some(x=>/main buying action may appear late/.test(x.title)),
  'real offscreen Buy now button still causes a cautious review');
assert.ok(exactCTA.blockers.every(x=>x.buyerQuestion || !['action','trust'].includes(x.stage)),
  'buyer-facing concerns have question-style explanations');
console.log('PASS conversion engine: commercial heuristics, CTA score false positives, offer evidence and no fake revenue math');
