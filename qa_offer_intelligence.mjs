import assert from 'node:assert/strict';
import {analyzeOfferUnderstanding} from './lib/offer-intelligence.mjs';
import {analyzeWebsiteConversion} from './lib/conversion-engine.mjs';

const lorem='This page introduces the offer and describes its availability. '.repeat(15);
const page=(commerce,url='https://example.org/')=>({url,status:'rendered',entry:true,commerce});
const basic=(rest={})=>({
  heading:'Welcome',intro:'Explore our offer.',
  visibleText:lorem+' This is a digital product. The ebook costs $29. You can buy now.',
  actions:[{label:'Buy now',path:'/checkout',region:'main',top:250,inFirstView:true}],
  hasPrice:true,priceSamples:['$29'],hasProof:false,proofText:'',
  hasPurchaseTerms:false,termsNearAction:false,benefitStatements:[],offerSections:[],
  ...rest
});
const weak=analyzeOfferUnderstanding([page(basic())]);
const titles=weak.questions.map(x=>x.code);
assert.ok(titles.includes('outcome-unclear'),'first screen with no outcome must be flagged');
assert.ok(titles.includes('price-without-specific-value'),'price without a concrete value needs review');
assert.ok(titles.includes('after-payment-unclear'),'paid digital offer without access instructions needs review');
assert.ok(titles.includes('proof-not-seen-near-offer'),'missing captured proof needs careful review');
assert.ok(weak.questions.every(x=>x.evidence&&x.fix&&x.verify&&x.buyerQuestion),
  'no buyer problem without evidence, repair and verification');
assert.ok(weak.questions.every(x=>x.confidence==='hypothesis'),
  'absence from inspected material does not prove actual buyer behavior');
const rich=basic({
  heading:'Find the questions preventing buyers from purchasing your product',
  intro:'Help founders identify the obstacles stopping customers from buying and improve their offer.',
  visibleText:lorem+' Our ebook includes 5 real examples and an action plan. Instant access after purchase.'+
    ' Buyer testimonials and demonstrations appear on our sales page.',
  benefitStatements:[
    'Get a practical checklist to review your sales page and find what to improve.',
    'Includes 5 examples of how different offer messages affect buying decisions.'
  ],
  offerSections:['What you receive after purchasing this product'],
  hasProof:true,proofText:'Verified feedback from a customer about our product.',
  termsNearAction:true,hasPurchaseTerms:true
});
const strong=analyzeOfferUnderstanding([page(rich)]);
assert.equal(strong.questions.length,0,'clear, evidenced offer must not get fabricated problems');
assert.ok(strong.benefitExamples.length>0,'benefits from visible offer are retained');
assert.ok(strong.includedExamples.length>0,'deliverables from visible offer are retained');
assert.equal(strong.prices[0],'$29','price sample remains grounded');
const genericWithDetail=basic({
  heading:'Welcome',
  intro:'We help founders identify the questions preventing people from buying their digital products.',
  visibleText:lorem+' Our guide includes a practical checklist and examples. Instant access after purchase.',
  benefitStatements:['The guide includes checklists and examples that help founders improve their sales page.'],
  hasProof:true,proofText:'A verified customer review appears on the page.',
  termsNearAction:true
});
genericWithDetail.intro+='.';
const reuse=analyzeOfferUnderstanding([page(genericWithDetail)]);
assert.equal(reuse.reuses.length,1,'an existing supporting outcome can become a headline suggestion');
assert.equal(reuse.reuses[0].content,genericWithDetail.intro,'reuse actual text without inventing claims');
const limited=analyzeOfferUnderstanding([
  {url:'https://example.org/',status:'source',commerce:basic()}
],{coverage:{complete:false}});
assert.equal(limited.questions.length,0,'source-only and failed renders cannot produce absence diagnoses');
const hindi='हमारी वेबसाइट पर खरीदारों के लिए उपयोगी जानकारियां और उत्पादों की जानकारी उपलब्ध है। '.repeat(8);
const language=analyzeOfferUnderstanding([page(basic({
  heading:'खरीदारी आसान बनाइए',
  intro:'हम खरीदारों को उत्पाद समझने और सही निर्णय लेने में मदद करते हैं।',
  visibleText:hindi+'ebook $29 Buy now'
}))]);
assert.equal(language.questions.length,0,
  'English phrase absence must not punish a clearly non-English offer');
const full=analyzeWebsiteConversion([page(basic())],{coverage:{complete:true}});
assert.ok(full.offerUnderstanding?.version===1,'new offer intelligence is connected to conversion engine');
assert.ok(full.blockers.some(x=>x.code==='price-without-specific-value'),
  'meaningful offer-level value blocker survives conversion analysis');
assert.ok(full.blockers.some(x=>x.code==='after-payment-unclear'),
  'what buyers receive after payment is diagnosed');
assert.ok(full.assessment?.version===1,'new results retain assessment');
assert.equal(full.assessment.overall,null,
  'shallow evidence and a few negative hypotheses must not become a precise conversion score');
console.log('PASS offer understanding: weak/rich offer, honest gap evidence, multilingual, safe copy and report wiring');
