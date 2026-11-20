"""VYLENS scanner retry behavior: bounded 429 cooldown and subsequent successful rescan."""
import json
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('VYLENS_BASE','https://vylens-tan.vercel.app').rstrip('/')
mock_result={
 'mode':'website','url':'https://example.org/','subject':'example.org',
 'issues':[],
 'checks':[{'name':'Mock public page response','status':'passed','detail':'Fixture response only.'}],
 'coverage':{'discovered':1,'inspected':1,'rendered':1,'sourceOnly':0,
             'remaining':0,'skipped':0,'complete':True,'legal':0},
 'pages':[{'path':'/','type':'page','status':'rendered'}]
}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
    failures=[]
    page.on('pageerror',lambda e:failures.append(str(e)))
    attempts=[0]
    def respond(route):
        attempts[0]+=1
        if attempts[0]==1:
            route.fulfill(status=429,content_type='application/json',
                headers={'retry-after':'2'},
                body=json.dumps({'error':'Please retry in 2 seconds.','retryAfter':2}))
        else:
            assert 'application/x-ndjson' in route.request.headers['accept']
            events=[{'stage':'connecting'},{'stage':'rendering'},{'stage':'diagnosing'},{'report':mock_result}]
            route.fulfill(status=200,content_type='application/x-ndjson',
                body='\n'.join(json.dumps(event) for event in events)+'\n')
    page.route('**/api/inspect-site',respond)
    page.add_init_script("""sessionStorage.setItem('vylens:pending',
      JSON.stringify({mode:'website',url:'https://example.org/'}))""")
    page.goto(BASE+'/inspect.html',wait_until='load',timeout=45000)
    page.locator('#analysisError').wait_for(state='visible',timeout=10000)
    assert page.locator('#analysisRetry').is_disabled(),'Retry must be disabled during server cooldown'
    assert '2 seconds' in page.locator('#analysisErrorMessage').inner_text()
    page.wait_for_function("() => !document.querySelector('#analysisRetry').disabled",timeout=7500)
    assert page.locator('#analysisRetry').inner_text().startswith('Try again')
    page.locator('#analysisRetry').click()
    page.wait_for_url('**/results.html',timeout=15000)
    assert attempts[0]==2,attempts
    assert page.locator('#checksCount').inner_text()=='1'
    assert 'No confirmed' in page.locator('#reportHeadline').inner_text()
    assert not failures,failures
    browser.close()
print('PASS: scanner cooldown, accessible retry and recovery to Results')
