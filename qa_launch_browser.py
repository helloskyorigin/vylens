"""Production Chromium launch-readiness checks for VYLENS.
Exercises real UI, product file handoff, PDF print layout, legal pages and mobile widths.
"""
from pathlib import Path
import os
import re
import json
from playwright.sync_api import sync_playwright

BASE=os.environ.get('VYLENS_BASE','https://vylens-tan.vercel.app').rstrip('/')
CAPTURE=Path('qa-captures')
CAPTURE.mkdir(exist_ok=True)
legal_pages=['privacy.html','terms.html','refunds.html','cookies.html','disclaimer.html','contact.html']
failures=[]
observations=[]

def check(condition,label):
    if not condition:
        failures.append(label)
    else:
        print('PASS:',label,flush=True)

def assert_no_overflow(page,label):
    m=page.evaluate("""() => ({
      width:window.innerWidth,body:document.body.scrollWidth,
      doc:document.documentElement.scrollWidth,client:document.documentElement.clientWidth
    })""")
    check(max(m['body'],m['doc'])<=m['width']+3,
          f'{label} fits viewport {m}')

def goto(page,url):
    response=page.goto(url,wait_until='domcontentloaded',timeout=45000)
    page.wait_for_load_state('load',timeout=20000)
    return response

with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=['--no-sandbox'])
    # One isolated session is deliberately used to verify page-to-page file handoff.
    page=browser.new_page(viewport={'width':1280,'height':800},reduced_motion='reduce',accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    response=goto(page,BASE+'/')
    check(response is not None and response.status==200,'Landing page HTTP 200')
    check('VYLENS' in page.title(),'Landing page title')
    check(page.locator('#websiteTab').get_attribute('aria-pressed')=='true','Website mode initially selected')
    check(page.locator('#features .feature-tile').count()==6 and
          page.locator('#features .feature-lead').count()==2,'Exactly eight capabilities listed')
    check(page.locator('#hero-title').is_visible() and page.locator('#audit-tool').is_visible(),'Hero and audit input visible')
    assert_no_overflow(page,'Desktop landing')
    page.screenshot(path=str(CAPTURE/'landing-desktop.png'),full_page=True,animations='disabled')

    # Sample modal should be a real, closable dialog.
    page.locator('#openSample').click()
    check(page.locator('#reportDialog').evaluate('(d)=>d.open'),'Sample report opens')
    page.locator('.close-dialog').first.click()
    check(not page.locator('#reportDialog').evaluate('(d)=>d.open'),'Sample report closes')

    # Validation should not submit or navigate without a URL.
    page.locator('#submitAudit').click()
    check(page.locator('#websiteError').is_visible() and page.url.rstrip('/')==BASE,
          'Website input validation prevents empty audit')

    # Real uploaded product -> the approved five-card Results -> native PDF -> New Check.
    page.locator('#productTab').click()
    check(page.locator('#productTab').get_attribute('aria-pressed')=='true' and
          page.locator('#productFields').is_visible(),'Product mode changes real form')
    page.locator('#productFile').set_input_files({
        'name':'launch-check.md','mimeType':'text/markdown',
        'buffer':b'# A short guide\n\nTODO: Insert your product instructions here.\n'})
    check('launch-check.md' in page.locator('#uploadTitle').inner_text(),
          'Local Markdown file accepted')
    page.locator('#submitAudit').click()
    page.wait_for_url(re.compile(r'/results\.html'),timeout=55000)
    check('launch-check.md' in page.locator('#reportSubject').inner_text(),
          'Report identifies uploaded product')
    check(page.locator('#signalReport').is_visible(),
          'New short buyer-signal Results is visible on production')
    check(page.locator('#signalReport .signal-item').count()==5,
          'Five signal lines appear in the free preview')
    check(page.locator('.signal-unlock').count()==0,
          'No paid box or purchase promotion in the free report')
    check(page.locator('.signal-unlock-cta').count()==0,
          'No disabled checkout CTA')
    check(page.locator('.signal-finding').count()>=1,
          'Real product findings are shown for free')
    check(page.locator('.signal-change').count()>=1,
          'Each relevant product issue has an actionable fix')
    check(page.locator('.signal-plan-step').count()>=1,
          'Priority plan is available for free')
    check(not page.locator('#rvReport').is_visible() and
          not page.locator('#fiveReport').is_visible(),
          'No duplicate old dashboard sections')
    check(page.locator('.signal-score-number strong').inner_text()=='—',
          'File-only inspection does not invent a conversion score')
    check(all(v=='—' for v in page.locator('.signal-item-value').all_inner_texts()),
          'File-only inspection does not invent buyer ratings')
    check(not page.locator('#rvDownload').is_visible() and
          not page.locator('#navDownload').is_visible(),
          'Legacy PDF actions are hidden in favor of one free download')
    check(page.evaluate("() => JSON.parse(sessionStorage.getItem('vylens:result')).conversion.blockers.some(x => String(x.evidence||'').includes('TODO'))"),
          'The original product evidence remains intact')
    check(page.locator('.signal-finding').first.locator('.signal-finding-body').is_visible(),
          'The first recorded problem is expanded')
    with page.expect_download(timeout=16000) as download_event:
        page.locator('.signal-download').click()
    downloaded=download_event.value
    pdf=Path(downloaded.path()).read_bytes()
    check(downloaded.suggested_filename.endswith('.pdf') and
          pdf.startswith(b'%PDF') and b'%%EOF' in pdf[-40:] and len(pdf)>1800,
          'Full PDF is a working free download')
    check(b'Buyer Journey Review' in pdf or b'CONVERSION REPORT' in pdf,
          'PDF retains the full report content')
    page.screenshot(path=str(CAPTURE/'results-desktop.png'),full_page=True,animations='disabled')
    page.locator('.signal-bottom-actions a').click()
    page.wait_for_url(re.compile(r'/index\.html'),timeout=25000)
    check(page.locator('#websiteTab').is_visible(),
          'Run New Check returns to the scanner')

    # Critical policy/FAQ explanations reflect actual live capabilities.
    page.locator('#faq').scroll_into_view_if_needed()
    page.locator('#faq details').first.locator('summary').click()
    faq_text=page.locator('#faq').inner_text()
    check('rendered DOM' in faq_text and '24 pages' in faq_text,
          'FAQ describes current browser and page limits')

    # Responsive smoke: detect horizontal overflows on all major breakpoints.
    for width in [320,360,390,620,768,1024,1440]:
        mobile=browser.new_page(viewport={'width':width,'height':844},device_scale_factor=1,reduced_motion='reduce')
        resp=goto(mobile,BASE+'/')
        check(resp.status==200,f'Homepage HTTP 200 at {width}px')
        assert_no_overflow(mobile,f'Homepage {width}px')
        if width in (320,390):
            check(mobile.locator('#submitAudit').is_visible(),f'Audit CTA visible at {width}px')
            mobile.screenshot(path=str(CAPTURE/f'landing-{width}.png'),full_page=True,animations='disabled')
        if width==390:
            check(not mobile.locator('#mobileDock').is_visible(),
                  'No sticky button obscures mobile content')
            mobile.locator('#menuButton').click()
            check(mobile.locator('#mobileMenu').is_visible(),'Mobile menu opens')
            mobile.locator('#mobileMenu a').first.click()
            check(not mobile.locator('#mobileMenu').is_visible(),'Mobile menu closes after navigation')
        mobile.close()

    # Check legal pages' real HTTP responses, headings, contents and layout.
    for path in legal_pages:
        legal=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
        resp=goto(legal,BASE+'/'+path)
        check(resp is not None and resp.status==200,f'{path}: HTTP 200')
        check(legal.locator('main h1').count()==1,f'{path}: one main heading')
        check(legal.locator('.legal-article').count()==1,f'{path}: policy content present')
        assert_no_overflow(legal,path)
        anchors=legal.locator('.legal-toc a').evaluate_all(
           'els=>els.map(a=>({href:a.getAttribute("href"),found:!!document.getElementById(a.getAttribute("href").slice(1))}))')
        check(all(a['found'] for a in anchors),f'{path}: table-of-contents anchors resolve')
        if path=='privacy.html':
            check('browser' in legal.locator('.legal-article').inner_text().lower(),
                  'Privacy disclosure describes browser-based inspection')
        legal.close()

    # Results route without session report should have a usable empty state.
    empty=browser.new_page(viewport={'width':375,'height':800})
    resp=goto(empty,BASE+'/results.html')
    check(resp.status==200,'Direct Results route HTTP 200')
    check(empty.locator('#missingReport').is_visible(),'Direct Results route explains missing audit')
    check(empty.locator('#importReport').is_visible(),'Missing-state can restore a saved JSON report')
    empty.locator('#reportFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{}'})
    check(empty.locator('#reportImportError').is_visible(),'Invalid report JSON is safely rejected')
    saved={'mode':'website','subject':'restored.example','url':'https://example.org/',
      'issues':[{'category':'Navigation','severity':'high','title':'Restored report issue',
        'evidence':'A recorded observation.','fix':'Verify the link target.'}],
      'checks':[{'name':'Recorded check','status':'observed','detail':'Local saved report fixture.'}]}
    empty.locator('#reportFile').set_input_files({
      'name':'vylens-saved.json','mimeType':'application/json','buffer':json.dumps(saved).encode('utf-8')})
    empty.wait_for_function("""() => document.querySelector('#main') &&
      !document.querySelector('#main').hidden &&
      document.querySelector('#heroState').textContent.includes('IMPORTED')""",timeout=15000)
    check('restored.example' in empty.locator('#reportSubject').inner_text(),
          'Locally restored report renders its own saved data')
    check(empty.locator('#problemsCount').inner_text()=='1',
          'Restored report retains recorded issue count')
    empty.close()
    check(len(errors)==0,'Desktop end-to-end browser has no uncaught JavaScript errors: '+str(errors[:3]))
    browser.close()

print('QA OBSERVATIONS:',observations)
if failures:
    print('FAILED LAUNCH CHECKS:')
    for f in failures: print(' -',f)
    raise SystemExit(1)
print('PASS: FINAL VYLENS UI CHECKUP — all checks passed',flush=True)
