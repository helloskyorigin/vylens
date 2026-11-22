import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProductEvidencePacket,verifyProductSignals,reviewProductContext} from '../lib/ai-product-signals.mjs';
import {POST} from '../api/review-product.mjs';

const input={
  fileType:'pdf',price:'$19',salesPageUrl:'https://store.example/pricing',salesCoverage:'rendered',
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
