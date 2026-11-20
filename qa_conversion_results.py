"""VYLENS approved-reference Results: five visible cards, screenshot-style composition,
real evidence, working PDF and responsive phone/desktop presentation.
Only UI is changed. Scanner/legacy report fixtures stay independent.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('VYLENS_BASE','http://127.0.0.1:8765').rstrip('/')
OUT=Path('qa-captures');OUT.mkdir(exist_ok=True)

def fixture(n=3,mode='website',limited=False):
    names=['Offer outcome is unclear','Proof near the decision needs review',
           'The next step needs clarification','Mobile price is not visible',
           'Purchase terms are difficult to find','Unfinished offer copy']
    stages=['clarity','trust','action','value','trust','clarity']
    blockers=[{
       'stage':stages[i], 'title':names[i], 'priority':'high' if i<2 else 'review',
       'buyerConcern':f'Could this create hesitation around {stages[i]}?',
       'buyerQuestion':f'Can I trust the information about {stages[i]}?',
       'evidence':f'Observed public-page signal {i+1} at /pricing.',
       'fix':f'Clarify the relevant {stages[i]} information on the public offer.',
       'verify':f'Open /pricing on phone and desktop to verify {stages[i]}.',
       'location':'/pricing · offer', 'confidence':'observed'
    } for i in range(n)]
    strengths=[{'stage':'clarity','title':'Offer heading is visible','evidence':'Rendered title observed.','location':'/'}]
    return {
      'mode':mode, 'url':'https://example.org/product',
      'subject':'example.org' if mode=='website' else 'product-guide.md',
      'checkedAt':'2026-11-20T07:45:00Z',
      'issues':[], 'checks':[{'name':'Sample check','status':'passed'}],
      'coverage':{'complete':not limited,'inspected':1,'rendered':0 if limited else 1,
                  'discovered':3 if limited else 1,'sourceOnly':1 if limited else 0},
      'conversion':{'version':1,'kind':mode,'blockers':blockers,'strengths':strengths,
                    'renderedPages':0 if limited else 1,'inspectedOfferPages':0 if limited else 1,
                    'journey':[{'id':stage,'status':'attention' if any(x['stage']==stage for x in blockers) else 'unverified',
                     'detail':'Only observed page evidence was checked.'}
                    for stage in ['clarity','value','trust','action']],
                    'unverified':['Real buyer purchases were not measured.']}
    }

def check(value,label):
    assert value,label
    print('PASS',label,flush=True)

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for w in [320,360,390,590,768,1024,1408]:
    for label,n,limited,mode in [('findings',3,False,'website'),
                                ('zero',0,False,'website'),
                                ('partial',0,True,'website'),
                                ('product',2,False,'product')]:
      page=browser.new_page(viewport={'width':w,'height':900},reduced_motion='reduce',
                            accept_downloads=True)
      errors=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      sample=fixture(n,mode,limited)
      page.add_init_script('sessionStorage.setItem("vylens:result",'+json.dumps(json.dumps(sample))+')')
      response=page.goto(BASE+'/results.html',wait_until='load',timeout=55000)
      check(response.status==200,f'{label} {w}: HTTP 200')
      root=page.locator('#rvReport')
      check(root.is_visible(),f'{label} {w}: approved reference Results visible')
      check(page.locator('body.rv-ui').count()==1,f'{label} {w}: UI scoped')
      check(page.locator('#rvReport .rv-card').count()==5,f'{label} {w}: exactly five cards')
      check(page.locator('.rv-content-grid > .rv-card').count()==5,f'{label} {w}: five-grid structure')
      check(page.locator('.rv-overview').is_visible(),f'{label} {w}: horizontal summary card')
      check(page.locator('#rvReport .rv-actions button').count()==2,
            f'{label} {w}: only two report actions')
      check(page.locator('#rvDownload').is_visible() and page.locator('#rvNewCheck').is_visible(),
            f'{label} {w}: PDF and new audit actions')
      check(not page.locator('#fiveReport').is_visible() and not page.locator('.report-hero').is_visible(),
            f'{label} {w}: old sections not shown')
      check(not page.locator('#navActions').is_visible(),f'{label} {w}: no top extra actions')
      check(not page.locator('.rv-sidebar,.rv-notification,.rv-profile').count(),
            f'{label} {w}: no sidebar, notification or profile')
      check(page.locator('.rv-confidence-ring').get_attribute('aria-label')==
            'Buying confidence not measured from public pages',
            f'{label} {w}: no fabricated buying confidence')
      check(page.locator('.rv-risk').count()==min(n,4),
            f'{label} {w}: risk list derives from recorded blockers')
      if n:
        check(page.locator('.rv-overview h2').inner_text().startswith(str(n)),
              f'{label} {w}: summary uses real count')
        page.locator('.rv-risk summary').first.click()
        detail=page.locator('.rv-risk').first
        check(detail.evaluate('(el)=>el.open') and
              detail.locator('.rv-risk-fact').count()==4,
              f'{label} {w}: real issue expands to four evidence fields')
        check('Observed public-page signal' in detail.inner_text(),
              f'{label} {w}: no invented finding evidence')
      else:
        check(page.locator('.rv-risk-list .rv-quiet-state').count()==1 and
              not page.locator('.rv-overview h2').inner_text().startswith('3'),
              f'{label} {w}: honest zero-findings state')
        check('No removal supported' in page.locator('.rv-change-card').inner_text(),
              f'{label} {w}: no invented fixes')
      if limited:
        check('Limited' in page.locator('.rv-overview h2').inner_text(),
              f'{label} {w}: partial evidence is acknowledged')
      check(not errors,f'{label} {w}: no unhandled JavaScript errors {errors}')
      dims=page.evaluate('()=>({w:innerWidth,b:document.body.scrollWidth,d:document.documentElement.scrollWidth})')
      check(max(dims['b'],dims['d'])<=dims['w']+4,
            f'{label} {w}: no horizontal overflow {dims}')
      if label=='findings' and w in [320,390,1408]:
        page.screenshot(path=str(OUT/f'reference-results-{w}.png'),full_page=True,animations='disabled')
      if label=='findings' and w==390:
        with page.expect_download(timeout=17000) as pending:
          page.locator('#rvDownload').click()
        out=pending.value
        buf=Path(out.path()).read_bytes()
        check(out.suggested_filename.endswith('.pdf') and buf.startswith(b'%PDF-1.4') and
              b'%%EOF' in buf[-50:] and len(buf)>1800,'native PDF download still works')
      page.close()
  # Older standalone technical reports are preserved; this new layout is conversion-only.
  legacy=fixture(0)
  legacy.pop('conversion')
  page=browser.new_page(viewport={'width':390,'height':900})
  page.add_init_script('sessionStorage.setItem("vylens:result",'+json.dumps(json.dumps(legacy))+')')
  page.goto(BASE+'/results.html',wait_until='load',timeout=55000)
  check(page.locator('#rvReport').count()==0,'old reports retain their original renderer')
  page.close()
  browser.close()
print('PASS: VYLENS approved-reference five-card Results',flush=True)
