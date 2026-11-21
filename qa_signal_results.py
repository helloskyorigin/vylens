"""VYLENS full free report: buyer signals, complete findings, PDF and responsive QA."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get("VYLENS_BASE","http://127.0.0.1:8765").rstrip("/")
CAPTURES=Path("qa-captures")
CAPTURES.mkdir(exist_ok=True)

def fixture(kind="website", situation="findings"):
    findings=[
        {"id":"a","stage":"clarity","priority":"high",
         "title":"The main headline is too generic to explain the offer",
         "evidence":"The heading only says Everything, simplified.","fix":"Describe the real customer outcome.",
         "buyerQuestion":"What does this product help me do?"},
        {"id":"b","stage":"trust","priority":"high",
         "title":"Supporting proof is not clear near the offer",
         "evidence":"No proof appeared in inspected sections.","fix":"Show authentic evidence.",
         "buyerQuestion":"Can I trust these claims?"},
        {"id":"c","stage":"action","priority":"review",
         "title":"The buying action label may be unclear",
         "evidence":"Button is labelled Continue.","fix":"Use an accurate action label.",
         "buyerQuestion":"What happens when I click Continue?"},
        {"id":"d","stage":"trust","priority":"review",
         "title":"Purchase terms may be hard to find",
         "evidence":"The buying page did not show terms nearby.","fix":"Link to real purchase terms.",
         "buyerQuestion":"What are the purchase conditions?"},
        {"id":"d","stage":"trust","priority":"review",
         "title":"Purchase terms may be hard to find",
         "evidence":"Duplicate occurrence.","fix":"Link to real purchase terms.",
         "buyerQuestion":"What are the purchase conditions?"}
    ]
    good=[{"stage":"value","title":"Price information is visible","evidence":"$29 price shown."}]
    if situation=="zero":
        findings=[]
        good=[{"stage":k,"title":"Positive observation","evidence":"Visible on the page."}
              for k in ("clarity","value","trust","action")]
    if situation=="limited":
        findings=[]
        good=[]
    if situation=="many":
        findings += [
            {"id":str(i),"stage":"value" if i%2 else "clarity","priority":"review",
             "title":"Offer concern "+str(i),"evidence":"An actual observation.",
             "fix":"Check the offer presentation."}
            for i in range(30)]
    return {
        "mode":kind,"url":"https://example.org/shop",
        "subject":"example.org" if kind=="website" else "my-guide.pdf",
        "issues":[],"checks":[{"name":"Sample check","status":"passed"}],
        "coverage":{"complete":situation!="limited","discovered":3,"inspected":1},
        "conversion":{
            "version":1,"kind":kind,"renderedPages":0 if situation=="limited" else 1,
            "inspectedOfferPages":0 if situation=="limited" else 1,
            "blockers":findings,"strengths":good,
            "journey":[{"id":key,"status":"review","detail":"Visible offer checked."}
                       for key in ("clarity","value","trust","action")],
            "unverified":["We did not observe real purchases."]
        }
    }

def verify(value,message):
    assert value,message
    print("PASS",message,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    cases=[("website","findings"),("website","zero"),("website","limited"),
           ("website","many"),("product","findings")]
    for width in (320,390,768,1280):
        for mode,situation in cases:
            page=browser.new_page(viewport={"width":width,"height":850},
                                  reduced_motion="reduce",accept_downloads=True)
            errors=[]
            page.on("pageerror",lambda error:errors.append(str(error)))
            report=fixture(mode,situation)
            page.add_init_script("sessionStorage.setItem('vylens:result',"+
                                 json.dumps(json.dumps(report))+");")
            response=page.goto(BASE+"/results.html",wait_until="load",timeout=50000)
            label=f"{mode}/{situation} @ {width}px"
            verify(response.status==200,label+" serves results")
            verify(page.locator("#signalReport").is_visible(),label+" shows signal result")
            verify(page.locator(".signal-item").count()==5,label+" has five signals")
            verify(page.locator(".signal-unlock").count()==0 and
                   page.locator(".signal-unlock-cta").count()==0,
                   label+" has no paid box or checkout button")
            verify("PREVIEW" not in page.locator(".signal-eyebrow").inner_text(),
                   label+" offers the full report")
            count=34 if situation=="many" else (0 if situation in ("zero","limited") else 4)
            verify(page.locator(".signal-finding").count()==count,
                   label+f" preserves {count} unique findings")
            verify(page.locator(".signal-change").count()==count,
                   label+" shows all specific fixes")
            verify(page.locator(".signal-plan-step").count()==count,
                   label+" shows each priority task")
            verify(page.locator(".signal-question").count()==(0 if count==0 else 4),
                   label+" includes only recorded distinct buyer questions")
            verify(page.locator(".signal-download").is_visible(),
                   label+" allows the full PDF")
            verify(not page.locator("#rvReport").is_visible() and
                   not page.locator("#fiveReport").is_visible(),
                   label+" hides old duplicate dashboard")
            score=page.locator(".signal-score-number strong").inner_text()
            if mode=="product" or situation=="limited":
                verify(score=="—",label+" does not invent a score")
                verify(page.locator(".signal-item-value").all_inner_texts()==["—"]*5,
                       label+" avoids unsupported signal ratings")
            else:
                verify(score.isdigit(),label+" uses evidence-based editorial score")
            if count:
                first=page.locator(".signal-finding").first
                verify(first.evaluate("(node)=>node.open"),
                       label+" initially opens first finding")
                verify("Everything, simplified" in first.inner_text(),
                       label+" includes the underlying evidence")
                first.locator("summary").click()
                verify(not first.evaluate("(node)=>node.open"),
                       label+" can collapse a finding")
                first.locator("summary").click()
                verify(first.evaluate("(node)=>node.open"),
                       label+" can expand a finding")
                page.locator(".signal-plan-step").last.click()
                verify(page.locator(".signal-change").last.evaluate(
                    "(node)=>document.activeElement===node"),
                    label+" plan navigates to the right fix")
            if situation=="findings" and mode=="website" and width==390:
                with page.expect_download(timeout=15000) as event:
                    page.locator(".signal-download").click()
                pdf=Path(event.value.path()).read_bytes()
                verify(pdf.startswith(b"%PDF") and len(pdf)>1800,
                       label+" downloads a real full PDF")
                page.screenshot(path=str(CAPTURES/"signal-full-390.png"),full_page=True)
            if situation=="findings" and mode=="website" and width==1280:
                page.screenshot(path=str(CAPTURES/"signal-full-1280.png"),full_page=True)
            dimensions=page.evaluate(
                "()=>[innerWidth,document.body.scrollWidth,document.documentElement.scrollWidth]")
            verify(max(dimensions[1:])<=dimensions[0]+3,
                   label+f" has no horizontal overflow: {dimensions}")
            verify(not errors,label+" has no browser errors: "+str(errors))
            page.close()
    browser.close()
print("PASS: complete free VYLENS report in all scenarios")
