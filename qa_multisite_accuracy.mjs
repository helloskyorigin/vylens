import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { _test as multi } from './api/inspect-site.mjs';
import { _test as source } from './api/inspect.mjs';

const rules=multi.robotsRules('User-agent: OtherBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/*\nAllow: /private/public/\nDisallow: /files/*.pdf$\nDisallow: /CaseSensitive\n');
assert.equal(multi.robotsAllow('/private/document',rules),false);
assert.equal(multi.robotsAllow('/private/public/document',rules),true);
assert.equal(multi.robotsAllow('/files/file.pdf',rules),false);
assert.equal(multi.robotsAllow('/files/file.pdf/view',rules),true);
assert.equal(multi.robotsAllow('/casesensitive',rules),true);
assert.equal(multi.robotsAllow('/CaseSensitive',rules),false);
const specific=multi.robotsRules('User-agent: *\nDisallow: /all\n\nUser-agent: VYLENS-Inspector\nAllow: /all\n');
assert.equal(multi.robotsAllow('/all',specific),true);
assert.equal(multi.legal('https://example.org/privacy'),true);
assert.equal(multi.legal('https://example.org/contact'),false);
assert.equal(multi.normalize('https://example.org/logout','https://example.org/',new URL('https://example.org')),null);
assert.equal(multi.normalize('https://third-party.org/','https://example.org/',new URL('https://example.org')),null);

const a={category:'Discoverability',severity:'note',title:'Page title length deserves review',evidence:'Title contains 9 characters',location:'head'};
const b={...a,evidence:'Title contains 80 characters'};
const x={category:'Accessibility',severity:'note',title:'Document language not declared',evidence:'Missing html lang',location:'html'};
const grouped=multi.aggregate([
  {url:'https://example.org/',issues:[a,x]},
  {url:'https://example.org/pricing',issues:[b,x]},
  {url:'https://example.org/privacy',issues:[x]}
]);
assert.equal(grouped.length,3,'do not merge different evidence');
assert.equal(grouped.find(i=>i.title==='Document language not declared').affectedCount,3);
assert.deepEqual(grouped.find(i=>i.title==='Document language not declared').affectedPages,['/','/pricing','/privacy']);

assert.ok(multi.policyContentReview('https://example.org/privacy','Short text','').issues.some(i=>i.title.includes('very little readable')));
assert.ok(multi.policyContentReview('https://example.org/terms','[insert company name] '.repeat(14),'').issues.some(i=>i.title.includes('placeholder')));
assert.equal(multi.policyContentReview('https://example.org/privacy','Detailed privacy terms and clear contact instructions. '.repeat(18),'').issues.length,0);
assert.equal(multi.policyContentReview('https://example.org/contact','Short contact details','').issues.length,0);

const valid='<html lang="en"><head><title>Independent tools for creators</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Tools</h1></body></html>';
const indexed=source.review(valid,'https://example.org/',{status:200,headers:{'x-robots-tag':'noindex'}});
assert.ok(indexed.issues.some(x=>x.title==='Page explicitly requests noindex'));

class Element {
  constructor(tag='div',id='',hidden=false){
    this.tagName=tag.toUpperCase();this.id=id;this.hidden=hidden;this.children=[];
    this.lastChild={textContent:'Scan again'};this.className='';this.textContent='';
    this.dataset={};this.style={};this.attrs={};this.listeners={};
  }
  append(...children){this.children.push(...children);this.lastChild=this.children.at(-1);}
  replaceChildren(...children){this.children=[...children];this.lastChild=this.children.at(-1)||null;}
  setAttribute(key,value){this.attrs[key]=value;}
  addEventListener(key,fn){this.listeners[key]=fn;}
  get classList(){return {toggle:(name,value)=>{
    const classes=new Set(this.className.split(/\s+/).filter(Boolean));
    if(value)classes.add(name);else classes.delete(name);
    this.className=[...classes].join(' ');
  },add:name=>{this.className+=' '+name},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ')}}}
}
const markup=await readFile(new URL('./results.html',import.meta.url),'utf8');
const script=await readFile(new URL('./results.js',import.meta.url),'utf8');
const ids=[...markup.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)]
  .map(x=>({tag:x[1],id:x[2],hidden:/\bhidden\b/.test(x[0])}));
const dom=new Map(ids.map(x=>[x.id,new Element(x.tag,x.id,x.hidden)]));
const document={getElementById:id=>dom.get(id)||null,createElement:tag=>new Element(tag),
  createElementNS:(_ns,tag)=>new Element(tag)};
const report={mode:'website',url:'https://example.org',subject:'example.org',issues:[
  {...x,affectedCount:3,affectedPages:['/','/pricing','/privacy']},
  {...a,severity:'high',affectedCount:2,affectedPages:['/','/pricing']}
],checks:[{name:'a',status:'passed'},{name:'b',status:'passed'}]};
const state=new Map([['vylens:result',JSON.stringify(report)]]);
const sessionStorage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)};
const window={matchMedia:()=>({matches:false}),location:{assign:()=>{}},print(){}};
const navigator={clipboard:{writeText:async()=>{}}};
new Function('document','window','sessionStorage','navigator',script)(document,window,sessionStorage,navigator);
assert.equal(dom.get('criticalCount').textContent,'0');
assert.equal(dom.get('highCount').textContent,'2');
assert.equal(dom.get('otherCount').textContent,'3');
assert.equal(dom.get('findingsCount').textContent,'5 issues');
assert.equal(dom.get('findingsList').children.length,2);
const first=dom.get('findingsList').children[0];
assert.ok(first.children[0].children[1].children[1].textContent.includes('2 pages'));
console.log('PASS multi-page accuracy: robots, policy, distinct evidence, HTTP headers, affected-page counts');
