import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidencePacket,verifyAiSignals,reviewEvidenceWithGroq} from '../lib/ai-conversion-signals.mjs';

const page={
  url:'https://example.com/pricing',status:'rendered',entry:true,
  commerce:{
    heading:'Choose a plan that fits your team',
    intro:'Start with a monthly plan and upgrade whenever you need more team members.',
    visibleText:'Choose a plan that fits your team Start with a monthly plan and upgrade whenever you need more team members. Try it free. Monthly plan $29.',
    actions:[{label:'Try it free',destination:'/signup',region:'main'}],
    prices:[{value:'$29',cadence:'monthly',plan:'Starter'}],
    offerSections:['Start with a monthly plan and upgrade whenever you need more team members.'],
    benefitStatements:['Unlimited project updates for your growing team, billed monthly.'],
    proofText:'',policyLinks:[]
  }
};
const supported={
  pageId:'p0',stage:'value',title:'Clarify what Starter includes',
  evidenceQuote:'Start with a monthly plan and upgrade whenever you need more team members.',
  buyerConcern:'A buyer may want to know the exact limits of this monthly plan.',
  suggestedFix:'List the included team seats and the upgrade rules directly beside Starter pricing.',
  howToVerify:'Read the published pricing card on desktop and mobile.'
};

test('only rendered captured pages are shared with the AI reviewer',()=>{
  const packet=buildEvidencePacket([page,{
    url:'https://example.com/login',status:'source',commerce:{heading:'Private content'}
  }]);
  assert.equal(packet.length,1);
  assert.equal(packet[0].heading,page.commerce.heading);
  assert.equal(JSON.stringify(packet).includes('Private content'),false);
});

test('verbatim source quote produces cautious signal',()=>{
  const signals=verifyAiSignals({signals:[supported]},buildEvidencePacket([page]));
  assert.equal(signals.length,1);
  assert.equal(signals[0].confidence,'hypothesis');
  assert.match(signals[0].location,/\/pricing/);
});

test('invented quotes, unknown pages and invalid stages are rejected',()=>{
  const packet=buildEvidencePacket([page]);
  const signals=verifyAiSignals({signals:[
    {...supported,evidenceQuote:'Customers immediately abandon checkout because it crashes.'},
    {...supported,pageId:'p999'},
    {...supported,stage:'purchase'},
    supported
  ]},packet);
  assert.equal(signals.length,1);
});

test('missing credential makes no outbound request',async()=>{
  const result=await reviewEvidenceWithGroq([page],{
    apiKey:'',transport:()=>{throw Error('must not call');}
  });
  assert.equal(result.status,'not-configured');
  assert.equal(result.signals.length,0);
});

test('Groq request is server-side, structured and evidence-limited',async()=>{
  let authorization='',sent;
  const result=await reviewEvidenceWithGroq([page],{
    apiKey:'test-token',
    transport:async(url,options)=>{
      assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
      authorization=options.headers.authorization;
      sent=JSON.parse(options.body);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({signals:[supported]})}}]})};
    }
  });
  assert.equal(authorization,'Bearer test-token');
  assert.equal(sent.model,'openai/gpt-oss-120b');
  assert.equal(sent.response_format.json_schema.strict,true);
  assert.equal(result.status,'completed');
  assert.equal(result.signals.length,1);
});

test('upstream errors never prevent rule-based audit',async()=>{
  const result=await reviewEvidenceWithGroq([page],{
    apiKey:'test-token',transport:async()=>({ok:false,status:429})
  });
  assert.equal(result.status,'unavailable');
  assert.deepEqual(result.signals,[]);
});
