import {reviewProductContext} from '../lib/ai-product-signals.mjs';
/** Same-origin, opt-in endpoint. Receives only bounded client-side audit observations,
 * NEVER product file bytes, raw document text, or a customer-uploaded file.
 */
const recent=new Map();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'}
});
async function boundedBody(request,maxBytes=23000){
  if(!request.body)throw new Error('empty');
  const reader=request.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let bytes=0,text='';
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value?.byteLength||0;
      if(bytes>maxBytes){
        await reader.cancel('Request too large').catch(()=>{});
        throw new Error('too-large');
      }
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }finally{try{reader.releaseLock();}catch{}}
}
export async function POST(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
    return reply({error:'JSON request required.'},415);
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Cross-site requests are blocked.'},403);
  if(origin){
    try{if(new URL(origin).origin!==new URL(request.url).origin)return reply({error:'Cross-site requests are blocked.'},403);}
    catch{return reply({error:'Invalid origin.'},403);}
  }
  if(Number(request.headers.get('content-length')||0)>23000)return reply({error:'Request too large.'},413);
  let raw;
  try{raw=await boundedBody(request);}catch(error){
    return /too-large/.test(String(error?.message))?
      reply({error:'Request too large.'},413):
      reply({error:'Could not read request.'},400);
  }
  let body;
  try{body=JSON.parse(raw);}catch{return reply({error:'Invalid JSON.'},400);}
  if(body?.consent!==true)return reply({error:'AI file-evidence processing requires explicit opt-in.'},400);
  if(!body.fileEvidence||typeof body.fileEvidence!=='object')return reply({error:'Missing product audit observations.'},400);
  const ip=(request.headers.get('x-forwarded-for')||'anonymous').split(',')[0].slice(0,90);
  const now=Date.now();
  for(const [key,last] of recent)if(now-last>30000)recent.delete(key);
  if(recent.get(ip)&&now-recent.get(ip)<18000)return reply({error:'Please retry later.',retryAfter:18},429);
  recent.set(ip,now);
  const result=await reviewProductContext(body.fileEvidence);
  return reply(result);
}
export function GET(){return reply({status:'ok',processing:'opt-in-derived-audit-evidence-only'});}
