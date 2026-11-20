"""Seven-section VYLENS Results browser regression using synthetic report data.
Run with VYLENS_BASE=http://127.0.0.1:8000 python qa_seven_results.py
Run a local server in the repository root; PDF, browser state and UI are tested without scanning a real site.
"""
import json
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("VYLENS_BASE","http://127.0.0.1:8000").rstrip("/")
stages=["clarity","value","trust","action"]
blockers=[
    {"stage":stages[i%4],"title":f"Example source-backed blocker {i+1}",
     "priority":"high" if i<3 else "review",
     "source":"Rendered public page","location":f"/offer/section-{i+1}",
     "evidence":f"Visible observation {i+1}",
     "buyerConcern":f"A possible customer question about issue {i+1}",
     "fix":f"Clarify the visible action for issue {i+1}",
     "verify":f"Recheck the public page for issue {i+1}."}
    for i in range(7)
]
report={
    "mode":"website","url":"https://example.org/","subject":"example.org",
    "checkedAt":"2026-11-20T00:00:00Z","issues":[],"checks":[],
    "coverage":{"complete":False},
    "conversion":{"version":1,"goal":"Signup","renderedPages":1,
       "blockers":blockers,
       "strengths":[{"title":f"Positive observation {i+1}",
          "evidence":f"Recorded support {i+1}","stage":stages[i%4]}
          for i in range(6)],
       "unverified":["Checkout completion was not checked."],
       "journey":[{"id":stage,"status":"observed" if i%2 else "attention",
          "detail":f"Observed {stage} detail."} for i,stage in enumerate(stages)]
    }
}
previous={"mode":"website","sourceKey":"https://example.org","blockers":[
    {"stage":blockers[0]["stage"],"title":blockers[0]["title"],"location":blockers[0]["location"]},
    {"stage":"trust","title":"Older observation","location":"/pricing"}
]}
def check(result,label):
    assert result,label
    print("PASS:",label,flush=True)
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
    for width in [320,390,768,1280]:
        page=browser.new_page(viewport={"width":width,"height":850},reduced_motion="reduce")
        init="sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(report))+");"+\
          "sessionStorage.setItem('vylens:previous-conversion',"+json.dumps(json.dumps(previous))+");"
        page.add_init_script(init)
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        response=page.goto(BASE+"/results.html",wait_until="load",timeout=45000)
        check(response.status==200,f"results loads at {width}px")
        root=page.locator("#fiveReport.seven-results")
        check(root.count()==1,f"seven-section script active at {width}px")
        for section in ["five-blockers","five-action-plan","seven-strengths","seven-comparison",
                        "seven-journey","seven-limitations","seven-actions"]:
            check(page.locator("#"+section).count()==1,f"{section} exists at {width}px")
        check(page.locator("#five-blockers .five-finding").count()==7,"seven grounded findings")
        check(page.locator("#five-action-plan .seven-plan-step").count()==5,"exactly five actions")
        check(page.locator("#seven-strengths .seven-strength").count()==6,"all six positive signals")
        check(page.locator("#seven-comparison .seven-compare-stat").count()==3,"three comparison states")
        check(page.locator("#seven-journey .seven-stage").count()==4,"four buyer journey stages")
        check(page.locator("#seven-limitations .seven-limit-body p").count()>=2,"unverified areas present")
        check(page.locator("#seven-blocker-0").evaluate("(e)=>e.open"),"most important finding expanded")
        check("Possible buyer concern" in page.locator("#seven-blocker-0").inner_text(),"buyer concern visible")
        check("What to change" in page.locator("#seven-blocker-0").inner_text(),"recommended change visible")
        page.locator("#five-action-plan .seven-plan-step").nth(4).click()
        check(page.locator("#seven-blocker-4").evaluate("(e)=>e.open && !e.hidden"),
              "fifth action opens fifth finding")
        check(page.locator("#fiveBottomDownload").count()==1 and
              page.locator("#fiveBottomNew").count()==1,"PDF and New Check retained")
        check(page.locator(".seven-quiet-action").count()==3,"Recheck and JSON export/import present")
        check(page.evaluate("()=>{const p=window.VylensPdfDownload?.build();return p?.bytes?.length>1000&&String.fromCharCode(...p.bytes.slice(0,5))==='%PDF-'}"),
              "downloadable PDF bytes generated")
        check(not errors,f"no unhandled JS exceptions at {width}px: {errors}")
        dims=page.evaluate("()=>({viewport:innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth})")
        check(max(dims["body"],dims["doc"])<=dims["viewport"]+4,
              f"no horizontal overflow at {width}px: {dims}")
        page.close()
    browser.close()
print("PASS: Seven-section Results UI regression")
