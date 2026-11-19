"""Browser QA for buyer-first Results, safe empty states and legacy technical appendix."""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('VYLENS_BASE','https://vylens-tan.vercel.app').rstrip('/')
OUT=Path('qa-captures');OUT.mkdir(exist_ok=True)

def blocker(n,stage='clarity',confidence='hypothesis'):
    return {'id':'buyer-'+str(n),'stage':stage,
      'priority':'high' if n==1 else 'review',
      'title':f'Finding {n}: public buying action may be unclear',
      'evidence':f'The inspected public page showed a navigation label {n}.',
      'buyerConcern':'Visitors may need to work harder to identify their next step.',
      'fix':f'Make action {n} clearly describe its destination.',
      'verify':f'Open public page {n} and confirm the action target.',
      'location':'/pricing · main action','confidence':confidence,
      'source':'Rendered public DOM','effort':'small'}
def report(mode='website',blockers=3):
    bs=[blocker(i+1,['clarity','action','trust'][i%3]) for i in range(blockers)]
    return {'mode':mode,'url':'https://example.org/','subject':'example.org',
      'checkedAt':'2026-11-19T08:00:00Z',
      'issues':[{'title':'Missing meta description','category':'Discoverability',
        'severity':'note','evidence':'Initial HTML had no meta description.',
        'fix':'Add a relevant description.','location':'/ · head'}],
      'checks':[{'name':f'Technical check {i+1}','status':'passed','detail':'Fixture result.'} for i in range(35)],
      'coverage':{'discovered':4,'inspected':3,'rendered':3,'sourceOnly':0,'remaining':1,'complete':False},
      'pages':[{'path':'/','status':'rendered','type':'page'}],
      'conversion':{'version':1,'kind':mode,'goal':'Purchase or signup',
        'blockers':bs,
        'journey':[{'id':s,'label':name,'status':'attention' if i<blockers else 'unverified',
                    'detail':'Example evidence summary'}
                   for i,(s,name) in enumerate([('clarity','Offer clarity'),('value','Value & pricing'),
                                                 ('trust','Buyer confidence'),('action','Next step')])],
        'strengths':[{'stage':'action','title':'An action label is present',
                      'evidence':'A public next-step link appeared.','location':'/'}],
        'unverified':['Real visitor behavior, checkout completion and purchases were not measured.'],
        'inspectedOfferPages':1,'renderedPages':3,'scope':'Evidence from public pages only.'}}
def check(condition,label):
    assert condition,label
    print('PASS:',label,flush=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
    for width in [320,390,768,1280]:
        for kind,fixture in [('website',report()),('no-blockers',report(blockers=0)),
                             ('product',report('product',1))]:
            page=browser.new_page(viewport={'width':width,'height':850},reduced_motion='reduce')
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.add_init_script('sessionStorage.setItem("vylens:result",'+json.dumps(json.dumps(fixture))+')')
            resp=page.goto(BASE+'/results.html',wait_until='load',timeout=55000)
            check(resp.status==200,f'{kind} results HTTP 200 at {width}')
            check(page.locator('#conversionReport').is_visible(),f'{kind} conversion view shown at {width}')
            check(page.locator('#buyerJourney .journey-stage').count()==4,f'{kind} four buyer stages at {width}')
            check(not page.locator('.metrics-section').is_visible(),
                  f'{kind} technical metrics initially secondary at {width}')
            check(page.locator('#technicalAppendix').is_visible() and
                  not page.locator('#technicalAppendix').evaluate('(e)=>e.open'),
                  f'{kind} technical appendix collapsed at {width}')
            check('not measured' in page.locator('.conversion-disclaimer').inner_text().lower() or
                  'proof of lost sales' in page.locator('.conversion-disclaimer').inner_text().lower(),
                  f'{kind} no ungrounded sales attribution at {width}')
            if kind=='website':
                check(page.locator('.buyer-blocker').count()==3,f'three evidence-based blockers at {width}')
                check(page.locator('#conversionPlan .plan-row').count()==3,
                      f'prioritized action plan at {width}')
                check(page.locator('#primaryBlocker').inner_text().find('WHY A BUYER MIGHT HESITATE')>=0,
                      f'first blocker has buyer concern and remedy at {width}')
                second=page.locator('#secondaryBlockers details').first
                second.locator('summary').click()
                check(second.evaluate('(e)=>e.open'),f'secondary blocker details open at {width}')
                second.locator('summary').click()
            elif kind=='no-blockers':
                check(page.locator('#primaryBlocker .blocker-empty').count()==1,
                      f'no-results state is explicit at {width}')
                check(not page.locator('#copyPlan').is_visible(),
                      f'no misleading action plan at {width}')
            else:
                check('delivered file only' in page.locator('#conversionGoal').inner_text().lower(),
                      f'product report explains file-only scope at {width}')
            page.locator('#technicalAppendix > summary').click()
            check(page.locator('#checksPanel').is_visible(),f'{kind} technical checks remain accessible at {width}')
            check(page.locator('#findingsList .finding').count()==1,
                  f'{kind} original technical evidence retained at {width}')
            check(page.locator('#printAppendix .print-buyer-blocker').count()==len(fixture['conversion']['blockers']),
                  f'{kind} printed buyer findings retained at {width}')
            check(page.locator('#printAppendix .print-check').count()==35,
                  f'{kind} complete technical print appendix at {width}')
            dims=page.evaluate('()=>({w:innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth})')
            check(max(dims['body'],dims['doc'])<=dims['w']+3,
                  f'{kind} no horizontal overflow at {width}: {dims}')
            check(not errors,f'{kind} no page errors at {width}: {errors}')
            if kind=='website' and width in (320,390,1280):
                page.locator('#technicalAppendix > summary').click()
                page.screenshot(path=str(OUT/f'conversion-results-{width}.png'),
                                full_page=True,animations='disabled')
            page.close()
    browser.close()
print('PASS: VYLENS conversion-first Results responsive and edge-state browser QA')
