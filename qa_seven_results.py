"""Reference five-card Results regression using a fuller set of grounded findings."""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get("VYLENS_BASE","http://127.0.0.1:8765").rstrip("/")
blockers=[{
 "title":f"Potential buyer barrier {i+1}","stage":['clarity','trust','action','value'][i%4],
 "priority":"high" if i<2 else "review","evidence":f"Observed public source {i+1}",
 "buyerConcern":f"Potential concern {i+1}","fix":f"Review observed issue {i+1}",
 "verify":f"Verify issue {i+1} on the live page","location":f"/offer/{i+1}"
} for i in range(6)]
sample={"mode":"website","subject":"example.org","url":"https://example.org/product",
 "issues":[],"checks":[{"name":"Evidence checked","status":"passed"}],
 "coverage":{"discovered":1,"inspected":1,"rendered":1,"complete":True},
 "conversion":{"version":1,"kind":"website","renderedPages":1,"inspectedOfferPages":1,
 "blockers":blockers,"strengths":[{"title":"Positive evidence","stage":"action","evidence":"Observed source"}],
 "journey":[{"id":s,"status":"attention","detail":"Observed source"} for s in ["clarity","value","trust","action"]],
 "unverified":["Actual sales were not measured."]}}
def check(ok,message):
 assert ok,message
 print("PASS",message,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
 for width in [320,390,768,1280]:
  page=browser.new_page(viewport={"width":width,"height":860},reduced_motion="reduce")
  page.add_init_script("sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(sample))+");")
  response=page.goto(BASE+"/results.html",wait_until="load",timeout=45000)
  check(response.status==200,f"Results loads {width}px")
  check(page.locator("#rvReport").is_visible(),f"Reference design visible {width}px")
  check(page.locator(".rv-card").count()==5,f"Exactly five cards {width}px")
  check(page.locator(".rv-risk").count()==4,f"Four top ranked entries {width}px")
  check(page.locator(".rv-reason").count()==3,f"Three buyer concerns {width}px")
  check(1<=page.locator(".rv-change-col").count()<=3,
        f"Only actionable Change Remove Improve groups at {width}px")
  check(page.locator(".rv-change-none").count()==0,
        f"No empty change/remove/improve placeholders at {width}px")
  check(page.locator(".rv-signal-grid .rv-signal").count()==4,
       f"Evidence coverage shown as observed/unverified signals at {width}px")
  check(page.locator(".rv-confidence-ring").count()==0,
       f"No false buyer-confidence donut at {width}px")
  check(not page.locator(".nav-actions").is_visible(),f"No profile/notification toolbar {width}px")
  bounds=page.evaluate("()=>[innerWidth,document.body.scrollWidth,document.documentElement.scrollWidth]")
  check(max(bounds[1:])<=bounds[0]+4,f"No horizontal overflow {width}px")
  page.locator(".rv-risk").first.locator("summary").click()
  check(page.locator(".rv-risk").first.evaluate("(e)=>e.open"),
        f"Buyer finding expands {width}px")
  check(page.locator(".rv-risk").first.locator(".rv-risk-fact").count()==4,
        f"Evidence detail sections {width}px")
  page.close()
 browser.close()
print("PASS: reference five-card VYLENS Results")
