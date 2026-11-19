"""Production Chromium launch-readiness checks for VYLENS.
Exercises real UI, product file handoff, PDF print layout, legal pages and mobile widths.
"""
from pathlib import Path
import os
import re
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
    page=browser.new_page(viewport={'width':1280,'height':800},reduced_motion='reduce',accept_downloads=False)
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

    # Verify file upload and actual local product analysis end to end.
    page.locator('#productTab').click()
    check(page.locator('#productTab').get_attribute('aria-pressed')=='true' and
          page.locator('#productFields').is_visible(),'Digital Product mode changes real form')
    page.locator('#productFile').set_input_files({
      'name':'launch-check.md',
      'mimeType':'text/markdown',
      'buffer':b'# A short guide\n\nTODO: Insert your product instructions here.\n'
    })
    check('launch-check.md' in page.locator('#uploadTitle').inner_text(),'File input accepts local Markdown')
    page.locator('#submitAudit').click()
    page.wait_for_url(re.compile(r'/results\.html'),timeout=55000)
    check('launch-check.md' in page.locator('#reportSubject').inner_text(),'Results identify uploaded product')
    check(page.locator('#reportType').inner_text()=='DIGITAL PRODUCT','Results show correct audit type')
    check(page.locator('#findingsList .finding').count()>=1,'Real file findings are present')
    check(page.locator('#checksCount').inner_text().strip().isdigit(),'Checks count is numeric')

    # PDF is browser-print based; test click and print-mode appendix.
    page.evaluate('window.__printClicked=false;window.print=()=>{window.__printClicked=true}')
    page.locator('#savePdf').click()
    check(page.evaluate('window.__printClicked'),'Save PDF invokes print')
    page.emulate_media(media='print')
    check(page.locator('#printAppendix').evaluate('(e)=>getComputedStyle(e).display')!='none',
          'Print stylesheet includes full report')
    page.emulate_media(media='screen')
    check(page.locator('.report-footer a').filter(has_text='Contact').count()==1,
          'Results footer has one contact link')
    page.screenshot(path=str(CAPTURE/'results-desktop.png'),full_page=True,animations='disabled')

    # "Scan another file" must return to Product tab, not Website.
    page.locator('#recheck').click()
    page.wait_for_url(re.compile(r'/index\.html'),timeout=25000)
    check(page.locator('#productTab').get_attribute('aria-pressed')=='true',
          'Digital Product recheck retains Product mode')

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
    empty.close()
    check(len(errors)==0,'Desktop end-to-end browser has no uncaught JavaScript errors: '+str(errors[:3]))
    browser.close()

print('QA OBSERVATIONS:',observations)
if failures:
    print('FAILED LAUNCH CHECKS:')
    for f in failures: print(' -',f)
    raise SystemExit(1)
print('PASS: FINAL VYLENS UI CHECKUP — all checks passed',flush=True)
