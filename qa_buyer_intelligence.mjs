import assert from 'node:assert/strict';
import {buildFiveCardIntelligence,findOfferPathGaps} from './lib/buyer-intelligence.mjs';
import {analyzeWebsiteConversion} from './lib/conversion-engine.mjs';

const normal={
 heading:'Understand your SaaS checkout before launch',
 intro:'Help founders find the purchase friction in their checkout path before launch.',
 visibleText:'Clear explanation. Price: $19, one time.',
 hasPrice:true,priceSamples:['$19'],hasPurchaseTerms:true,termsNearAction:true,
 actions:[{label:'Buy now',path:'/checkout',destination:'https://example.org/checkout',
          region:'main',top:320,inFirstView:true,centerReachable:true}],
 mobileCaptured:true,mobileActions:[{label:'Buy now',path:'/checkout',region:'main',inFirstView:true}],
 hasProof:false,proofText:''
};
const page=(route,commerce,entry=true)=>({
 url:'https://example.org'+route,status:'rendered',entry,commerce
});
const clean=analyzeWebsiteConversion([page('/',normal)],{coverage:{complete:true}});
assert.equal(clean.blockers.length,0,'clear product offers are not penalized for absent testimonials');
assert.equal(clean.buyerIntelligence.version,1,'five-card decision engine present');
assert.equal(clean.buyerIntelligence.overview.findingCount,0,'grounded issue count');
assert.equal(clean.buyerIntelligence.purchaseDecisionTest.status,'not-tested',
 'not finding an issue never proves a buyer would purchase');
assert.equal(clean.buyerIntelligence.buyerNeeds.length,4,'exact four buyer needs');
assert.equal(clean.buyerIntelligence.buyerNeeds.find(x=>x.stage==='trust').status,'unverified',
 'no proof detected is an evidence gap, not a confirmed trust defect');
assert.ok(clean.buyerIntelligence.overview.observed.visiblePrices>0,
 'price is observed in supported page');

const navigationOnly=page('/',{
 ...normal,
 actions:[{label:'Buy now',path:'/checkout',destination:'https://example.org/checkout',region:'navigation'}],
 mobileActions:[{label:'Buy now',path:'/checkout',region:'navigation'}]
});
const navResult=analyzeWebsiteConversion([navigationOnly],{coverage:{complete:true}});
assert.ok(navResult.blockers.some(x=>x.code==='offer-nav-only'),
 'nav-only buying path can warrant a cautious review');
assert.ok(navResult.blockers.find(x=>x.code==='offer-nav-only').evidence.includes('navigation'),
 'findings cite real observed main vs nav location');
assert.ok(navResult.buyerIntelligence.whyNotBuying.length>0,
 'finding becomes a grounded possible buyer hesitation');
assert.ok(navResult.buyerIntelligence.biggestSalesKillers.some(x=>x.id),
 'risk cards inherit stable finding references');
assert.ok(navResult.buyerIntelligence.whatToChangeRemoveImprove.change.length+
 navResult.buyerIntelligence.whatToChangeRemoveImprove.improve.length+
 navResult.buyerIntelligence.whatToChangeRemoveImprove.remove.length>=1,
 'action groups are backed by actual fixes');

const jsButton=page('/pricing',{
 ...normal,actions:[{label:'Buy now',path:'',destination:'',region:'main',top:230}],
 mobileActions:[{label:'Buy now',path:'',region:'main',inFirstView:true}]
});
const buttonResult=analyzeWebsiteConversion([jsButton],{coverage:{complete:true}});
const unknown=buttonResult.blockers.find(x=>x.code==='purchase-unknown-target');
assert.ok(unknown,'uninspectable JS-owned purchase action is marked for review');
assert.equal(unknown.confidence,'hypothesis','a missing public href is not a verified broken CTA');
assert.match(unknown.evidence,/not exposed as a public link/,'evidence describes actual inspection limit');

const mismatchDestination=analyzeWebsiteConversion([page('/pricing',{
 ...normal,actions:[{label:'Buy now',path:'/privacy',destination:'https://example.org/privacy',region:'main'}],
 mobileActions:[{label:'Buy now',path:'/privacy',region:'main',inFirstView:true}]
})],{coverage:{complete:true}});
assert.ok(mismatchDestination.blockers.some(x=>x.code==='purchase-info-destination'),
 'an explicit buying CTA linking to an information page gets a review finding');
assert.equal(mismatchDestination.blockers.find(x=>x.code==='purchase-info-destination').confidence,
 'hypothesis','information-page destination may have a JavaScript handoff, so not confirmed broken');

const named=(route,price,plan='Starter')=>page(route,{
 ...normal,heading:'Compare Starter plans',hasPrice:true,
 prices:[{plan,value:price,cadence:'monthly'}],priceSamples:[price]
},route==='/');
const inconsistent=analyzeWebsiteConversion([
 named('/','$19'),named('/pricing','$29')
],{coverage:{complete:true}});
assert.ok(inconsistent.blockers.some(x=>x.code==='named-plan-price-mismatch'),
 'same explicitly named plan with different rendered prices prompts a consistency check');
const alternate=analyzeWebsiteConversion([
 named('/','$19','Starter'),named('/pricing','$29','Pro')
],{coverage:{complete:true}});
assert.ok(!alternate.blockers.some(x=>x.code==='named-plan-price-mismatch'),
 'different plans are not treated as inconsistent prices');
const genericPlan=analyzeWebsiteConversion([
 named('/','$19','Pricing'),named('/pricing','$29','Pricing')
],{coverage:{complete:true}});
assert.ok(!genericPlan.blockers.some(x=>x.code==='named-plan-price-mismatch'),
 'a generic page heading is not proof of the same named plan');

const noCommercial=buildFiveCardIntelligence({pages:[],blockers:[],strengths:[],
 coverage:{complete:false},kind:'website'});
assert.equal(noCommercial.overview.status,'source-only');
assert.equal(noCommercial.biggestSalesKillers.length,0);
assert.equal(noCommercial.purchaseDecisionTest.status,'not-tested');
assert.equal(noCommercial.buyerNeeds.filter(x=>x.status==='unverified').length,4);
assert.equal(findOfferPathGaps([{url:'https://example.org/',status:'source',commerce:normal}]).length,0,
 'never infer rendered purchase defects from source-only fallback');

const known={
 id:'buyer-fixed',stage:'trust',priority:'high',title:'A linked policy returned 404',
 evidence:'Public /refund page returned HTTP 404 twice.',location:'/refund',
 confidence:'observed',buyerConcern:'Buyers cannot review the published terms.',
 fix:'Restore the policy link.',verify:'Reload the public destination.'
};
const withFinding=buildFiveCardIntelligence({pages:[page('/',normal)],blockers:[known,known],
 strengths:[{stage:'value',title:'Price shown',evidence:'$19 on pricing page'}],coverage:{complete:true}});
assert.equal(withFinding.overview.findingCount,1,'duplicate blocker removed from five-card model');
assert.equal(withFinding.purchaseDecisionTest.status,'potential-hesitation');
assert.equal(withFinding.buyerNeeds.find(x=>x.stage==='trust').status,'review');
assert.ok(withFinding.biggestSalesKillers[0].evidence.includes('twice'),
 'risk card keeps specific observed evidence');
for(const group of Object.values(withFinding.whatToChangeRemoveImprove))
 for(const item of group)assert.ok(item.fix&&item.evidence&&item.verify,
  'every action is backed by a fix, observed evidence and validation path');

const product=buildFiveCardIntelligence({kind:'product',coverage:{complete:true},
 blockers:[known],strengths:[]});
assert.equal(product.overview.status,'file-only','file inspection never impersonates buying sessions');
assert.equal(product.overview.limited,true);
assert.ok(product.purchaseDecisionTest.explanation.includes('not measured'));
console.log('PASS: Five-card intelligence, no-false-claims, nav-only and JS-button checks');
