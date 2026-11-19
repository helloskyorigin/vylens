import assert from 'node:assert/strict';
import {buildBuyerReplay,buildConversionFixKit} from './lib/buyer-experience.mjs';

const p=(path,commerce)=>({url:'https://example.org'+path,status:'rendered',commerce});
const page=p('/',{
  heading:'Make sense of your sales page',intro:'We help founders understand the buying experience of their public website.',
  hasPrice:true,priceSamples:['$19'],mobilePriceVisible:true,
  actions:[{label:'Buy now',path:'/checkout',top:260,inFirstView:true}],
  mobileActions:[{label:'Buy now',path:'/checkout',top:940,inFirstView:false}]
});
const journey=buildBuyerReplay([page]);
assert.equal(journey.source,'rendered-dom');
assert.equal(journey.desktop.length,4);
assert.equal(journey.mobile.length,4);
assert.equal(journey.desktop[2].status,'observed');
assert.equal(journey.mobile[2].status,'review');
assert.ok(journey.desktop[3].description.includes('/checkout'));
assert.equal(journey.desktop[3].status,'unknown','href is not proof of successful checkout');
const confirmedPublic=buildBuyerReplay([page,p('/checkout',{
  heading:'Payment information',hasPrice:false,actions:[],mobileActions:[]
})]);
assert.equal(confirmedPublic.desktop[3].status,'observed',
  'a public link target can be independently observed as rendered');
assert.match(confirmedPublic.desktop[3].description,/Payment and form submission were not tested/);
assert.equal(confirmedPublic.desktop[3].place,'/checkout');
assert.match(journey.scope,/not a recorded visitor path/);
assert.equal(buildBuyerReplay([]),null);

const scores=p('/',{
  heading:'Purchase readiness scanner',intro:'A scanner to help founders review their public offer.',
  hasPrice:false,actions:[{label:'Purchase Readiness 64/100',path:'/score'}],
  mobileActions:[{label:'Purchase Readiness 64/100',path:'/score'}]
});
const scoreJourney=buildBuyerReplay([scores]);
assert.equal(scoreJourney.desktop[2].status,'review','score text is not a real CTA');
assert.equal(scoreJourney.desktop[3].status,'unknown');
const withNewsletter=p('/',{
  heading:'Buy a guide',intro:'We help founders improve the way visitors discover digital products.',
  hasPrice:true,priceSamples:['$29'],
  actions:[
    {label:'Subscribe',isNewsletter:true,path:'',top:110,inFirstView:true},
    {label:'Buy now',path:'/checkout',top:860,inFirstView:false}
  ],
  mobileActions:[
    {label:'Subscribe',isNewsletter:true,path:'',top:140,inFirstView:true},
    {label:'Buy now',path:'/checkout',top:990,inFirstView:false}
  ]
});
const purchaseJourney=buildBuyerReplay([withNewsletter]);
assert.match(purchaseJourney.desktop[2].description,/Buy now/);
assert.equal(purchaseJourney.desktop[2].status,'review',
  'a newsletter button cannot hide a below-the-fold real checkout button');
assert.match(purchaseJourney.mobile[2].description,/Buy now/);
assert.match(purchaseJourney.desktop[3].title,/Check the destination/);

const problems=[
  {id:'buyer-1',stage:'clarity',title:'The main headline is too generic to explain the offer',
   location:'/ · h1',fix:'Explain the real value.',verify:'Ask a new visitor to read it.'},
  {id:'buyer-2',stage:'action',title:'The visible action labels may leave the next step unclear',
   location:'/ · action buttons',fix:'Use direct CTA.',copyFrom:'Learn more',copyTo:'View pricing',
   verify:'Check that pricing opens.'},
  {id:'buyer-3',stage:'trust',title:'Purchase terms may be hard to find near the buying action',
   location:'/ · purchase action',fix:'Surface accurate policy.',verify:'Open the actual terms.'}
];
const kit=buildConversionFixKit(problems,[page]);
assert.equal(kit.length,3);
assert.equal(kit[0].kind,'copy');
assert.match(kit[0].content,/We help founders/);
assert.equal(kit[1].content,'View pricing');
assert.equal(kit[2].kind,'checklist');
const verifiedTerms=buildConversionFixKit([problems[2]],[p('/',{
  ...page.commerce,hasPurchaseTerms:true
})]);
assert.equal(verifiedTerms[0].kind,'copy');
assert.match(verifiedTerms[0].verify,/actual published terms/);
const noHallucination=buildConversionFixKit([problems[0]],[p('/',{
  heading:'Welcome',intro:'Hi.',actions:[],mobileActions:[]
})]);
assert.equal(noHallucination[0].kind,'checklist','no invented offer outcome');
assert.equal(buildConversionFixKit([],[]).length,0);
console.log('PASS buyer journey and conversion kit: desktop/mobile, verified copy, fallbacks and safety');
