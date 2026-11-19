import assert from 'node:assert/strict';
import {classifyAction,isDirectAction,isPurchaseAction} from './lib/action-intent.mjs';
const t=(label,path='')=>({label,path});
for(const [label,path] of [
 ['Buy now','/checkout'],['Purchase this ebook','/checkout'],['Sign up','/register'],
 ['Subscribe','/subscribe'],['Get started',''],['Start free','/trial'],
 ['Get instant access','/checkout'],['Get my audit','/checkout'],
 ['See pricing','/pricing'],['Choose a plan','/plans'],
 ['Start my trial','/trial'],['View plans','/pricing']
]){
 assert.ok(isDirectAction(t(label,path)),label+' should be treated as an action');
}
for(const label of [
  'Purchase Readiness 64/100','Your Purchase Readiness Score 87/100',
  'Pricing breakdown 70%','Checkout Confidence 9/10','How to purchase',
  'Get your grade','Your audit results'
]){
 assert.equal(isDirectAction(t(label,'/score')),false,label+' must stay informational');
}
assert.equal(isPurchaseAction(t('Get instant access','/checkout')),true,
  'evidence-backed contextual checkout CTA is purchase-related');
assert.equal(isPurchaseAction(t('See pricing','/pricing')),false,
  'pricing navigation is not a completed buy action');
assert.equal(isDirectAction(t('Learn more','/pricing')),false,
  'ambiguous copy stays a review item');
assert.equal(classifyAction({...t('Subscribe'),isNewsletter:true}).reason,'newsletter',
  'newsletter form submit must not count as a purchase CTA');
assert.equal(isPurchaseAction({...t('Subscribe'),isNewsletter:true}),false);
assert.equal(classifyAction(t('Get your score','/score')).reason,'unverified',
  'an uncorroborated score view is not a purchase CTA');
console.log('PASS action classifier: contextual buying actions, genuine buttons and score false positives');
