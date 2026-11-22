import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProductEvidencePacket,verifyProductSignals,reviewProductContext} from '../lib/ai-product-signals.mjs';
import {POST,GET} from '../api/review-product.mjs';

const input={
  fileType:'pdf',price:'$19',salesPageUrl:'https://store.example/pricing',salesCoverage:'rendered',
  fileSamples:[{location:'PDF page 2',
    excerpt:'This workbook contains twenty daily prompts and a reusable daily planning worksheet for creators.'}],
  fileIssues:[{title:'Getting-started guide missing',
    evidence:'The delivered ZIP includes five files but no named quick-start instructions.',
    location:'Local ZIP directory'}],
  fileStrengths:[{title:'File opened',evidence:'The local PDF has 32 pages of readable text.',location:'Local PDF'}],
  salesIssues:[{title:'Download instructions unclear',
    evidence:'The offer says "Get instant access" without describing how files are delivered.',
    location:'/pricing'}],
  salesStrengths:[{title:'Price shown',
    evidence:'The published sales page shows a one-time price of $19.',location:'/pricing'}]
};
const comparison={
  sourceId:'file-0',relatedSourceId:'sales-0',stage:'action',
  title:'Explain how buyers receive their purchase',
  evidenceQuote:'The delivered ZIP includes five files but no named quick-start instructions.',
  relatedEvidenceQuote:'The offer says "Get instant access" without describing how files are delivered.',
  buyerConcern:'The sales offer mentions instant access but local delivery guidance may be unclear.',
  suggestedFix:'Explain exactly which download files buyers receive and add short start-here instructions.',
  howToVerify:'Read the public offer, then open the delivered bundle as a first-time customer.'
};

test('packet contains only capped diagnostic excerpts, never raw file bytes',()=>{
  const p=buildProductEvidencePacket({...input,rawFile:'SECRET PRIVATE CONTENT',fileIssues:[...input.fileIssues,...Array(30).fill(input.fileIssues[0])]});
  assert.ok(p.sources.length<=26);
  assert.equal(JSON.stringify(p).includes('SECRET PRIVATE CONTENT'),false);
  assert.ok(p.sources.some(s=>s.origin==='file'));
  assert.ok(p.sources.some(s=>s.origin==='sales-page'));
});

test('two-source comparison requires exact excerpts from both origins',()=>{
  const packet=buildProductEvidencePacket(input);
  const result=verifyProductSignals({signals:[comparison]},packet);
  assert.equal(result.length,1);
  assert.equal(result[0].evidenceKind,'cross-source');
  assert.equal(result[0].confidence,'hypothesis');
  assert.match(result[0].evidence,/Related sales page excerpt/);
});

test('reject fabricated file quotes and unrelated source IDs',()=>{
  const p=buildProductEvidencePacket(input);
  assert.deepEqual(verifyProductSignals({signals:[
    {...comparison,evidenceQuote:'This product is guaranteed to sell every day'},
    {...comparison,relatedSourceId:'unknown-999'},
    {...comparison,relatedSourceId:'file-1',relatedEvidenceQuote:'The local PDF has 32 pages of readable text.'}
  ]},p),[]);
});

test('single-source AI claims cannot masquerade as cross-source verification',()=>{
  const p=buildProductEvidencePacket(input);
  const record={...comparison,relatedSourceId:'',relatedEvidenceQuote:''};
  const found=verifyProductSignals({signals:[record]},p);
  assert.equal(found.length,1);
  assert.equal(found[0].evidenceKind,'single-source');
});

test('no key disables remote processing',async()=>{
  const r=await reviewProductContext(input,{apiKey:'',transport:()=>{throw Error('must not call');}});
  assert.equal(r.status,'not-configured');
});

test('mocked Groq JSON schema returns verified advice',async()=>{
  const seen=[];
  const r=await reviewProductContext(input,{
    apiKey:'test-only',transport:async(url,opt)=>{
      seen.push({url,auth:opt.headers.Authorization,body:JSON.parse(opt.body)});
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({signals:[comparison]})}}]})};
    }
  });
  assert.equal(r.status,'completed');
  assert.equal(r.signals.length,1);
  assert.equal(seen[0].url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(seen[0].auth,'Bearer test-only');
  assert.equal(seen[0].body.response_format.json_schema.strict,true);
  assert.ok(seen[0].body.messages[1].content.includes('sales-page'));
});

test('upstream error always preserves rule-based report path',async()=>{
  const r=await reviewProductContext(input,{
    apiKey:'dummy',transport:async()=>({ok:false,status:429})
  });
  assert.equal(r.status,'unavailable');
  assert.deepEqual(r.signals,[]);
});

test('server refuses missing consent and cross-origin requests',async()=>{
  const base='https://vylens.vercel.app/api/review-product';
  const noConsent=await POST(new Request(base,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({fileEvidence:input})}));
  assert.equal(noConsent.status,400);
  const cross=await POST(new Request(base,{method:'POST',headers:{'content-type':'application/json',
    origin:'https://malicious.example'},body:JSON.stringify({consent:true,fileEvidence:input})}));
  assert.equal(cross.status,403);
});

test('reject oversized requests even without content-length header',async()=>{
  const r=await POST(new Request('https://vylens.vercel.app/api/review-product',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({consent:true,fileEvidence:input,extra:'a'.repeat(24000)})
  }));
  assert.equal(r.status,413);
});

test('text excerpts are treated as specific cited product evidence rather than proof of missing features',()=>{
  const packet=buildProductEvidencePacket(input);
  assert.ok(packet.sources.some(s=>s.sourceId==='content-0'&&s.kind==='content-excerpt'));
  const comparison={
    sourceId:'content-0',relatedSourceId:'sales-0',stage:'value',
    title:'Explain the workbook deliverables more clearly',
    evidenceQuote:'This workbook contains twenty daily prompts and a reusable daily planning worksheet for creators.',
    relatedEvidenceQuote:'The offer says "Get instant access" without describing how files are delivered.',
    buyerConcern:'The public offer may not explain how the delivered workbook should be used.',
    suggestedFix:'Explain the twenty daily prompts and reusable worksheet within the public sales offer.',
    howToVerify:'Compare the public offer wording with page two of the workbook.'
  };
  const verified=verifyProductSignals({signals:[comparison]},packet);
  assert.equal(verified.length,1);
  assert.equal(verified[0].evidenceKind,'cross-source');
  assert.ok(verified[0].location.includes('PDF page 2'));
  const falseQuote=verifyProductSignals({signals:[{...comparison,
    evidenceQuote:'The workbook promises 500 pages of done-for-you templates.'}]},packet);
  assert.equal(falseQuote.length,0);
});

test('AI cannot call a single sampled excerpt a sales-promise mismatch or proof of missing content',()=>{
  const packet=buildProductEvidencePacket(input);
  const oneSided={...comparison,relatedSourceId:'',relatedEvidenceQuote:'',
    title:'The sales page promises content but the delivered file mismatches'};
  assert.equal(verifyProductSignals({signals:[oneSided]},packet).length,0);
  const missing={...oneSided,sourceId:'content-0',
    title:'The workbook lacks important deliverables',
    evidenceQuote:'This workbook contains twenty daily prompts and a reusable daily planning worksheet for creators.'};
  assert.equal(verifyProductSignals({signals:[missing]},packet).length,0);
});

test('AI health endpoint reports configuration status but never discloses an API key',async()=>{
  const r=await GET();
  assert.equal(r.status,200);
  const value=await r.json();
  assert.equal(typeof value.aiConfigured,'boolean');
  assert.equal(typeof value.model,'string');
  assert.ok(value.model.length>0);
  assert.equal(JSON.stringify(value).includes('Bearer '),false);
  assert.equal('apiKey' in value,false);
});
