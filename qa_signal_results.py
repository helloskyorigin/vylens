"""Buyer-signal result screen regression: short evidence-led preview and five-point offer."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get("VYLENS_BASE","http://127.0.0.1:8765").rstrip("/")
CAPTURES=Path("qa-captures")
CAPTURES.mkdir(exist_ok=True)

def fixture(kind="website", situation="findings"):
    findings = [
        {"id":"a","stage":"clarity","priority":"high","title":"The main headline is too generic to explain the offer",
         "evidence":"The heading only says 'Everything, simplified'.","fix":"Describe the real customer outcome."},
        {"id":"b","stage":"trust","priority":"high","title":"Supporting proof is not clear near the offer",
         "evidence":"No proof appeared in inspected sections.","fix":"Show authentic evidence."},
        {"id":"c","stage":"action","priority":"review","title":"The buying action label may be unclear",
         "evidence":"Button is labelled 'Continue'.","fix":"Use an accurate action label."},
        {"id":"d","stage":"trust","priority":"review","title":"Purchase terms may be hard to find",
         "evidence":"The buying page did not show terms nearby.","fix":"Link to real purchase terms."},
        {"id":"d","stage":"trust","priority":"review","title":"Purchase terms may be hard to find",
         "evidence":"Duplicate occurrence.","fix":"Link to purchase terms."}
    ]
    good=[{"stage":"value","title":"Price information is visible","evidence":"$29 price shown."}]
    if situation=="zero":
        findings=[]
        good=[{"stage":k,"title":"Positive observation","evidence":"Visible on the public page."}
              for k in ["clarity","value","trust","action"]]
    if situation=="limited":
        findings=[]
        good=[]
    if situation=="many":
        findings += [{"id":str(i),"stage":"value" if i%2 else "clarity","priority":"review",
                      "title":"Offer concern "+str(i),"evidence":"A real observation.",
                      "fix":"Check the public page."} for i in range(30)]
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
                       for key in ["clarity","value","trust","action"]],
            "unverified":["We did not watch real visitors or test purchases."]
        }
    }

def verify(value,message):
    assert value,message
    print("PASS",message,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    for width in [320,390,768,1280]:
        for mode,situation in [
            ("website","findings"),("website","zero"),("website","limited"),
            ("website","many"),("product","findings")
        ]:
            page=browser.new_page(viewport={"width":width,"height":850},
                                  reduced_motion="reduce",accept_downloads=True)
            errors=[]
            page.on("pageerror",lambda err:errors.append(str(err)))
            data=fixture(mode,situation)
            page.add_init_script("sessionStorage.setItem('vylens:result',"+
                                 json.dumps(json.dumps(data))+");")
            response=page.goto(BASE+"/results.html",wait_until="load",timeout=50000)
            label=f"{mode}/{situation} @ {width}px"
            verify(response.status==200,label+" serves HTML")
            root=page.locator("#signalReport")
            verify(root.is_visible(),label+" shows the new signal report")
            verify(page.locator("#rvReport").count()==0 or not page.locator("#rvReport").is_visible(),
                   label+" does not show the old report")
            verify(not page.locator("#fiveReport").is_visible(),label+" hides detailed report")
            verify(page.locator(".signal-item").count()==5,label+" has five signal bars")
            verify(page.locator(".signal-perk").count()==5,label+" has exactly five paid benefits")
            verify(page.locator("#fullReport").is_visible(),label+" shows full-report offer")
            verify(page.locator(".signal-unlock-cta").is_visible(),label+" has a visible CTA")
            verify(not page.locator("#navDownload").is_visible(),label+" hides free PDF action")
            verify(not page.locator("#rvDownload").is_visible(),label+" hides legacy PDF action")
            price="$9" if mode=="product" else "$19"
            verify(price in page.locator(".signal-unlock-cta").inner_text(),label+" uses correct price")
            score=page.locator(".signal-score-number strong").inner_text()
            if mode=="product" or situation=="limited":
                verify(score=="—",label+" avoids an unsupported score")
                verify(page.locator(".signal-item-value").all_inner_texts()==["—"]*5,
                       label+" avoids unsupported signal ratings")
            else:
                verify(score.isdigit(),label+" shows a backed editorial score")
            if situation=="findings" and mode=="website":
                verify(page.locator(".signal-item.signal-weak").count()==2,
                       label+" maps high-priority issues to weak signals")
                verify(page.locator(".signal-item.signal-review").count()==2,
                       label+" keeps a different terms concern separate")
                verify(page.locator(".signal-item.signal-good").count()==1,
                       label+" marks observed positive signal")
            if situation=="many":
                verify(page.locator(".signal-perk").count()==5,
                       label+" keeps the interface compact despite 30+ findings")
            verify(page.locator(".signal-checkout-state").is_visible(),
                   label+" states that checkout isn't connected")
            before=page.url
            page.locator(".signal-unlock-cta").click()
            verify(page.url==before,label+" doesn't invent a checkout")
            verify("Nothing has been charged" in page.locator(".signal-checkout-state").inner_text(),
                   label+" explains why payment cannot proceed")
            bounds=page.evaluate("()=>[innerWidth,document.body.scrollWidth,document.documentElement.scrollWidth]")
            verify(max(bounds[1:])<=bounds[0]+3,label+f" has no horizontal overflow: {bounds}")
            verify(not errors,label+" has no browser errors: "+str(errors))
            if situation=="findings" and mode=="website" and width in (390,1280):
                page.screenshot(path=str(CAPTURES/f"signal-report-{width}.png"),full_page=True)
            page.close()
    browser.close()
print("PASS: all signal-preview scenarios")