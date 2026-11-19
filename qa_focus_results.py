"""Focused audit Results visual and interaction QA (synthetic data; never user-visible)."""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get("VYLENS_BASE","https://vylens-tan.vercel.app").rstrip("/")
OUT=Path("qa-captures");OUT.mkdir(exist_ok=True)
checks=[
    {"name":f"Navigation · check {i}","status":"attention" if i<4 else ("unverified" if i<7 else "passed"),
     "detail":"Real browser or source-based inspection."}
    for i in range(36)
]
issues=[
  {"title":"Confirmed internal navigation link returns HTTP 404","severity":"high","category":"Navigation",
   "location":"/pricing · header navigation","affectedCount":2,"affectedPages":["/","/pricing"],
   "evidence":"Destination returned HTTP 404 on two GET requests.","fix":"Restore page or update link.","verify":"Open it after fixing."},
  {"title":"Some interactive controls lack accessible names","severity":"high","category":"Accessibility",
   "location":"/contact · input[name=email]","evidence":"No accessible name detected.","fix":"Associate a visible label.","verify":"Check accessibility tree."},
  {"title":"Unusually long page heading with confusing navigation labels that should wrap without distorting the page layout on narrow phone screens","severity":"note","category":"Content clarity",
   "location":"/about · heading","evidence":"Very long heading observed.","fix":"Simplify the heading."},
  {"title":"Policy contains unfinished placeholder","severity":"note","category":"Policy content",
   "location":"/privacy","evidence":"Placeholder copy present.","fix":"Replace draft text."},
  {"title":"Mobile interactive targets are small","severity":"note","category":"Accessibility",
   "location":"/pricing · mobile","evidence":"Two controls smaller than 32px.","fix":"Expand clickable areas."},
  {"title":"Sharing metadata is missing a description","severity":"note","category":"Sharing",
   "location":"/about · head","evidence":"og:description absent.","fix":"Add descriptive metadata."}
]
report={"mode":"website","url":"https://example.org/","subject":"example.org",
  "checkedAt":"2026-11-19T08:00:00Z","issues":issues,"checks":checks,
  "coverage":{"discovered":7,"inspected":6,"legal":2,"remaining":1,"skipped":0,"complete":False},
  "pages":[{"path":"/","type":"page","status":"rendered"},{"path":"/privacy","type":"legal","status":"rendered"}]}
def check(test,label):
    assert test,label
    print("PASS:",label,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    for width in [320,390,768,1280]:
        page=browser.new_page(viewport={"width":width,"height":844},reduced_motion="reduce")
        page.add_init_script("sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(report))+");")
        response=page.goto(BASE+"/results.html",wait_until="load",timeout=50000)
        check(response.status==200,f"Report available at {width}px")
        check(page.locator(".metrics-section .metric").count()==2,f"Only 2 cards at {width}px")
        check(page.locator("#problemsCount").inner_text()=="7",f"Affected-page counts at {width}px")
        check(page.locator("#checksCount").inner_text()=="36",f"Checks counted at {width}px")
        check(page.locator("#findingsList .finding").count()==4,f"Four initial priorities at {width}px")
        check(page.locator("#impactText").inner_text().strip()!="",f"Impact explained at {width}px")
        check(not page.locator("#checksPanel").evaluate("(e)=>e.open"),f"Checks initially collapsed at {width}px")
        bounds=page.evaluate("()=>({w:innerWidth,b:document.body.scrollWidth,d:document.documentElement.scrollWidth})")
        check(max(bounds["b"],bounds["d"])<=bounds["w"]+3,f"No horizontal overflow {width}px: {bounds}")
        if width==390:
            red=page.locator(".metric-problems").evaluate("(e)=>getComputedStyle(e).backgroundColor")
            green=page.locator(".metric-checks").evaluate("(e)=>getComputedStyle(e).backgroundColor")
            check(red=="rgb(255, 241, 240)","Problems card red")
            check(green=="rgb(235, 248, 232)","Checks card green")
        first=page.locator("#findingsList .finding").first
        first.locator("summary").click()
        check(first.evaluate("(e)=>e.open"),f"Problem expands at {width}px")
        check("HTTP 404" in first.inner_text(),f"Evidence shown at {width}px")
        first.locator("summary").click()
        page.locator("#moreProblems").click()
        check(page.locator("#findingsList .finding").count()==6,f"View all exposes 6 at {width}px")
        check(page.locator("#findingsList").evaluate("(e)=>getComputedStyle(e).overflowY")=="auto",
              f"Expanded issues have bounded scroller at {width}px")
        page.locator("#moreProblems").click()
        check(page.locator("#findingsList .finding").count()==4,f"Collapse restores compact list at {width}px")
        page.locator("#checksPanel > summary").click()
        check(page.locator("#checkBreakdownList .check-row").count()==36,f"Checks complete at {width}px")
        check(page.locator("#siteCoverage").is_visible(),f"Page coverage inside checks at {width}px")
        bounds=page.evaluate("()=>({w:innerWidth,b:document.body.scrollWidth,d:document.documentElement.scrollWidth})")
        check(max(bounds["b"],bounds["d"])<=bounds["w"]+3,f"No expanded overflow {width}px: {bounds}")
        page.locator("#checksPanel > summary").click()
        if width in (320,390,1280):
            page.screenshot(path=str(OUT/f"focus-results-{width}.png"),full_page=True,animations="disabled")
        page.close()
    browser.close()
print("PASS: Focus Results responsive and interaction QA",flush=True)
