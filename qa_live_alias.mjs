import assert from 'node:assert/strict';
import {POST,GET,_test} from './api/inspect.mjs';
const make=(headers,body={url:'http://127.0.0.1'})=>POST(new Request('https://internal-deployment.vercel.app/api/inspect',{
 method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)
}));
const sameOrigin=await make({'origin':'https://vylens-tan.vercel.app','sec-fetch-site':'same-origin'});
assert.equal(sameOrigin.status,400,'same-origin production alias should reach input validation, not 403');
const crossSite=await make({'origin':'https://attacker.example.net','sec-fetch-site':'cross-site'});
assert.equal(crossSite.status,403);
const forwarded=await make({'origin':'https://vylens-tan.vercel.app','x-forwarded-host':'vylens-tan.vercel.app'});
assert.equal(forwarded.status,400);
const invalidOrigin=await make({'origin':'%%invalid%%'});
assert.equal(invalidOrigin.status,403);
assert.equal(_test.choosePublicAddress([{address:'2606:4700::1',family:6},{address:'104.16.0.1',family:4}]).family,4);
assert.throws(()=>_test.choosePublicAddress([{address:'104.16.0.1',family:4},{address:'127.0.0.1',family:4}]),/safely/);
let allAddressResult;
_test.pinnedLookup({address:'93.184.216.34',family:4})('example.com',{all:true},(err,value)=>{
  assert.equal(err,null);allAddressResult=value;
});
assert.deepEqual(allAddressResult,[{address:'93.184.216.34',family:4}]);
let scalarResult;
_test.pinnedLookup({address:'93.184.216.34',family:4})('example.com',{},(err,address,family)=>{
  assert.equal(err,null);scalarResult={address,family};
});
assert.deepEqual(scalarResult,{address:'93.184.216.34',family:4});
assert.equal((await GET()).status,200);
console.log('PASS Vercel same-origin alias, cross-site rejection, IPv4 preference, private-IP block, API health');
