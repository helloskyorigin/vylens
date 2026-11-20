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
    check(page.locator('#rvReport').is_visible(),
          'Reference five-card Results visible on production')
    check(page.locator('#rvReport .rv-card').count()==5,
          'Exactly five buyer-facing cards, no extra sections')
    check(not page.locator('.nav-actions').is_visible() and
          not page.locator('#fiveReport').is_visible(),
          'No top extra icons, sidebar or old report sections')
    check(page.locator('.rv-overview').is_visible() and
          page.locator('.rv-signal-grid .rv-signal').count()==4 and
          not page.locator('.rv-confidence-ring').count(),
          'Buyer evidence shown without invented buyer confidence score')
    check(page.locator('.rv-risk').count()>=1,
          'Real product TODO issue appears among prioritized blockers')
    first=page.locator('.rv-risk').first
    first.locator('summary').click()
    check(first.evaluate('(e)=>e.open') and 'TODO' in first.inner_text(),
          'The affected product evidence is visible on expansion')
    check(first.locator('.rv-risk-fact').count()==4,
          'Evidence, buyer concern, change and verification visible')
    check(1<=page.locator('.rv-change-col').count()<=3 and
          page.locator('.rv-change-none').count()==0,
          'Only evidence-backed Change / Remove / Improve groups appear')
    check(page.locator('#rvDownload').is_visible() and
          page.locator('#rvNewCheck').is_visible(),
          'Only two primary report actions')
    with page.expect_download(timeout=16000) as download_event:
        page.locator('#rvDownload').click()
    downloaded=download_event.value
    pdf=Path(downloaded.path()).read_bytes()
    check(downloaded.suggested_filename.endswith('.pdf') and
          pdf.startswith(b'%PDF-1.4') and b'%%EOF' in pdf[-40:] and len(pdf)>1800,
          'Download PDF creates a valid document')
    check(b'Buyer Journey Review' in pdf and b"What Couldn't Be Verified" in pdf,
          'Full PDF retains detailed evidence and limitations')
    page.screenshot(path=str(CAPTURE/'results-desktop.png'),full_page=True,animations='disabled')
    page.locator('#rvNewCheck').click()
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
