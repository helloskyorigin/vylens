"""VYLENS Results regression: no findings, partial scans and long reports at phone/desktop sizes."""
import os, json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('VYLENS_BASE','https://vylens-tan.vercel.app').rstrip('/')
def check(value,message):
    assert value,message
    print('PASS:',message,flush=True)
def report(n,complete=True,unverified=0,checks=0):
    issues=[
        {'title':f'Internal navigation destination #{i+1} requires review',
         'category':'Navigation','severity':'high' if i<2 else 'note',
         'location':f'/page-{i} · navigation',
         'evidence':f'A verified example condition was recorded for page {i}.',
         'fix':f'Review and correct the target on page {i}.',
         'verify':'Open the destination and confirm expected behavior.'}
        for i in range(n)
    ]
    statuses=['unverified' if i<unverified else 'passed' for i in range(checks)]
    return {'mode':'website','url':'https://example.org/','subject':'example.org',
      'checkedAt':'2026-11-19T10:00:00Z','issues':issues,
      'checks':[{'name':f'Check {i+1}','status':status,'detail':'Fixture-only observation.'}
                for i,status in enumerate(statuses)],
      'coverage':{'discovered':7,'inspected':6 if not complete else 7,
                  'rendered':5,'sourceOnly':1 if not complete else 0,
                  'remaining':0 if complete else 1,'skipped':0,'legal':1,'complete':complete},
      'pages':[{'path':'/','status':'rendered','type':'page'}]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    for width in (320,390,1280):
        for scenario,fixture in [('zero-complete',report(0,True,0,8)),
                                 ('zero-partial',report(0,False,3,8)),
                                 ('large',report(53,False,5,125))]:
            page=browser.new_page(viewport={'width':width,'height':844},reduced_motion='reduce')
            page.add_init_script('sessionStorage.setItem("vylens:result",'+json.dumps(json.dumps(fixture))+')')
            page.goto(BASE+'/results.html',wait_until='load',timeout=60000)
            pageErrors=[]
            page.on('pageerror',lambda e: pageErrors.append(str(e)))
            check(page.locator('#problemsCount').inner_text()==str(len(fixture['issues'])),
                  scenario+f' distinct count at {width}px')
            if scenario.startswith('zero'):
                check(not page.locator('#priorityDetails').is_visible(),
                      scenario+f' no misleading fix CTA at {width}px')
                check('No confirmed' in page.locator('#reportHeadline').inner_text(),
                      scenario+f' honest headline at {width}px')
            if scenario=='zero-partial':
                check('PARTIAL' in page.locator('#heroState').inner_text() and
                      'partial' in page.locator('#coverageMessage').inner_text().lower(),
                      scenario+f' partial scan clearly disclosed at {width}px')
            if scenario=='large':
                check(page.locator('#findingsList .finding:visible').count()==3,
                      f'First 3 findings only at {width}px')
                page.locator('#moreProblems').click()
                check(page.locator('#findingsList .finding:visible').count()==13,
                      f'Long report reveals only next ten at {width}px')
                for _ in range(4): page.locator('#moreProblems').click()
                check(page.locator('#findingsList .finding:visible').count()==53,
                      f'Long report reveals all 53 without duplicates at {width}px')
                page.locator('#moreProblems').click()
                check(page.locator('#findingsList .finding:visible').count()==3,
                      f'Long report returns to compact list at {width}px')
                page.locator('#checksPanel>summary').click()
                check(page.locator('#checkBreakdownList .check-row').count()==40,
                      f'Technical checks initially limited to 40 at {width}px')
                page.locator('#moreChecks').click()
                check(page.locator('#checkBreakdownList .check-row').count()==80,
                      f'Technical checks load progressively at {width}px')
                check(page.locator('#printAppendix .print-check').count()==125,
                      f'Full PDF appendix retains all 125 checks at {width}px')
            dimensions=page.evaluate('()=>({w:innerWidth,b:document.body.scrollWidth,d:document.documentElement.scrollWidth})')
            check(max(dimensions['b'],dimensions['d'])<=dimensions['w']+3,
                  scenario+f' no horizontal overflow {width}px: {dimensions}')
            check(not pageErrors,scenario+f' no page errors at {width}px: {pageErrors}')
            page.close()
    browser.close()
print('PASS: zero, partial and long Results states')
