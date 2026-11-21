import assert from 'node:assert/strict';
import {buildReportAssessment} from './lib/report-assessment.mjs';
const site={url:'https://example.org',status:'rendered',commerce:{
  heading:'Get clear answers',hasPrice:true,termsNearAction:false,
  actions:[{label:'Buy now',path:'/checkout'}]
}};
const buyer=(stage,priority,title,confidence='observed')=>({
  stage,priority,title,confidence,evidence:'Observed '+title+'.',fix:'Fix '+title,
  buyerQuestion:'How can I use this?',location:'/pricing'
});
const sample={kind:'website',pages:[site],coverage:{complete:true},
  renderedPages:1,inspectedOfferPages:1};
const none=buildReportAssessment({...sample,blockers:[],strengths:[]});
assert.equal(none.overall,null,'no evidence must not produce a fake score');
assert.ok(none.signals.every(x=>x.score===null),'unknown must stay unknown');
const price=buildReportAssessment({...sample,blockers:[],
  strengths:[{stage:'value',title:'Price information is visible',evidence:'$29 on /pricing'}]});
assert.ok(price.signals.find(x=>x.key==='value').score<75,'visible price is not proof of good value');
assert.equal(price.signals.find(x=>x.key==='trust').score,null,'no proof is not green');
assert.equal(price.signals.find(x=>x.key==='purchase').score,null,'checkout was never confirmed');
const problem=buildReportAssessment({...sample,
  blockers:[buyer('action','high','Mobile buy button clipped'),
    buyer('clarity','review','Headline vague','hypothesis'),
    buyer('trust','review','No nearby proof','hypothesis')],
  strengths:[{stage:'value',title:'Price information is visible',evidence:'$29'},
    {stage:'clarity',title:'The offer is explained in visible copy',evidence:'Clear outcome'}]});
assert.ok(problem.signals.find(x=>x.key==='action').score<50,'observed high buying blocker is red');
assert.ok(problem.signals.find(x=>x.key==='clarity').score<75,'concern offsets positive copy');
assert.ok(Number.isInteger(problem.overall),'three assessed dimensions allow cautious score');
const partial=buildReportAssessment({...sample,coverage:{complete:false},
  blockers:[],strengths:[{stage:'clarity',title:'The offer is explained in visible copy',evidence:'The offer helps people'},
    {stage:'value',title:'Price information is visible',evidence:'$29'},
    {stage:'trust',title:'Supporting proof is visible',evidence:'Observed case study'}]});
assert.ok(partial.signals.filter(x=>x.score!==null).every(x=>x.score<=72),
  'partially checked sites do not produce overly confident green signals');
const file=buildReportAssessment({...sample,kind:'product',renderedPages:0});
assert.equal(file.overall,null,'a product file is not a public sales-page conversion score');
assert.ok(file.signals.every(x=>x.score===null),'do not invent a score from an uploaded file');
const terms={...site,commerce:{...site.commerce,termsNearAction:true}};
const buying=buildReportAssessment({...sample,pages:[terms],strengths:[],
  blockers:[]});
assert.ok(buying.signals.find(x=>x.key==='purchase').score!==null,
  'explicit visible conditions near a real buying action can be assessed cautiously');
assert.ok(buying.signals.find(x=>x.key==='purchase').score<75,
  'purchase terms alone cannot confirm checkout success');
console.log('PASS evidence-aware report assessment: buyer signals, risk and coverage honesty');
