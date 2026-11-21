"""VYLENS result UX QA: score ring, five closed cards, color meanings, full report PDF."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get("VYLENS_BASE","http://127.0.0.1:8765").rstrip("/")
CAPTURES=Path("qa-captures")
CAPTURES.mkdir(exist_ok=True)

def fixture(kind="website",situation="findings"):
    issues=[
      {"id":"a","stage":"clarity","priority":"high","title":"Unclear headline",
       "evidence":"The heading only says Everything, simplified.",
       "fix":"Describe the real customer outcome.",
       "buyerQuestion":"What does this product help me do?"},
      {"id":"b","stage":"trust","priority":"high","title":"Proof is hard to find",
       "evidence":"No proof appeared near the offer.","fix":"Add real supporting proof.",
       "buyerQuestion":"Can I trust these claims?"},
      {"id":"c","stage":"action","priority":"review","title":"Buying button is unclear",
       "evidence":"Button is labelled Continue.","fix":"Use an accurate buying button label.",
       "buyerQuestion":"What happens when I click Continue?"},
      {"id":"d","stage":"trust","priority":"review","title":"Purchase terms need clarity",
       "evidence":"The buying page did not show terms nearby.",
       "fix":"Link to real purchase terms.",
       "buyerQuestion":"What are the purchase conditions?"},
      {"id":"d","stage":"trust","priority":"review","title":"Purchase terms need clarity",
       "evidence":"Duplicate occurrence.","fix":"Link to real purchase terms.",
       "buyerQuestion":"What are the purchase conditions?"}
    ]
    strengths=[{"stage":"value","title":"Price is visible","evidence":"Price appears."}]
    if situation=="zero":
        issues=[]
        strengths=[{"stage":x,"title":"Positive observation","evidence":"Observed."}
                   for x in ("clarity","value","trust","action")]
    if situation in ("limited","capturefailed"):
        issues=[]
        strengths=[]
    if situation=="many":
        issues += [{"id":str(i),"stage":"value" if i%2 else "clarity",
                    "priority":"review","title":"Offer concern "+str(i),
                    "evidence":"Visible offer information.",
                    "fix":"Make the offer easier to understand."} for i in range(30)]
    if situation=="rewrite":
        issues[0]["copyTo"]="See exactly how the product helps"
    conversion={
      "version":1,"kind":kind,
      "renderedPages":0 if situation in ("limited","capturefailed") else 1,
      "inspectedOfferPages":0 if situation in ("limited","capturefailed") else 1,
      "blockers":issues,"strengths":strengths,
      "journey":[{"id":s,"status":"review"} for s in ("clarity","value","trust","action")],
      "unverified":["Actual purchases were not measured."]
    }
    if situation=="capturefailed":
        conversion["scanDiagnostic"]={
          "status":"insufficient-offer-evidence",
          "reason":"Pages opened, but usable offer content was not captured.",
          "openedPages":7,"offerEvidencePages":0,"unreadableRendered":7,
          "sourcesOnly":0,
          "examples":[{"page":"/","reason":"Verification screen instead of offer"}]
        }
        conversion["sourcePreview"]={
          "observations":[{"title":"Sales-page HTML contains a primary heading",
                           "evidence":"Source heading: Example Sales Offer"}]
        }
    if situation=="rewrite":
        conversion["fixKit"]=[{"kind":"copy","title":"Suggested CTA",
                               "content":"View plans and pricing",
                               "verify":"Make sure the button points to the real pricing page."},
                              {"kind":"checklist","title":"Technical repair",
                               "content":"Do not mistake this for a copy rewrite."}]
    return {
        "mode":kind,"url":"https://example.org/shop",
        "subject":"example.org" if kind=="website" else "my-guide.pdf",
        "issues":[{"category":"Metadata","severity":"note","title":"Reference scan finding",
                   "location":"/home","evidence":"A real extra page check was recorded.",
                   "fix":"Review the page metadata.","verify":"Open the public page."}],
        "checks":[{"name":"Sample check","status":"passed"}],
        "coverage":{"complete":situation not in ("limited","capturefailed"),
                    "discovered":7 if situation=="capturefailed" else 3,
                    "inspected":7 if situation=="capturefailed" else 1,
                    "rendered":7 if situation=="capturefailed" else 0},
        "conversion":conversion
    }

def check(value,message):
    assert value,message
    print("PASS",message,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    cases=[("website","findings"),("website","zero"),("website","limited"),
           ("website","capturefailed"),
           ("website","many"),("website","rewrite"),("product","findings")]
    for width in (320,390,768,1280):
        for mode,situation in cases:
            page=browser.new_page(viewport={"width":width,"height":850},
                                  reduced_motion="reduce",accept_downloads=True)
            errors=[]
            page.on("pageerror",lambda err:errors.append(str(err)))
            source=fixture(mode,situation)
            page.add_init_script("sessionStorage.setItem('vylens:result',"+
                                 json.dumps(json.dumps(source))+");")
            response=page.goto(BASE+"/results.html",wait_until="load",timeout=50000)
            label=f"{mode}/{situation} @ {width}px"
            check(response.status==200,label+" serves report")
            check(page.locator("#signalReport").is_visible(),label+" shows signal report")
            if mode=="website" and situation in ("limited","capturefailed"):
                check(page.locator(".signal-diagnostic-panel").is_visible(),
                      label+" shows actionable incomplete-scan diagnosis")
                check(page.locator(".signal-detail-card").count()==0,
                      label+" never claims five empty cards are a full report")
                check(page.locator(".signal-score-ring").count()==0,
                      label+" does not invent a score")
                check(page.locator(".signal-download").count()==1 and
                      page.locator(".signal-download").inner_text()=="Try this scan again",
                      label+" replaces misleading full PDF with a retry")
                if situation=="capturefailed":
                    check("7" in page.locator(".signal-diagnostic-stats").inner_text() and
                          "0" in page.locator(".signal-diagnostic-stats").inner_text(),
                          label+" distinguishes pages opened from offer pages analyzed")
                    check("Sales-page HTML contains" in page.locator(".signal-diagnostic-source").inner_text(),
                          label+" shares limited source observations honestly")
                    if width==390:
                        page.screenshot(path=str(CAPTURES/"incomplete-scan-mobile.png"),full_page=True)
                dims=page.evaluate("()=>[innerWidth,document.body.scrollWidth,document.documentElement.scrollWidth]")
                check(max(dims[1:])<=dims[0]+3,label+" avoids overflow")
                check(not errors,label+" has no browser errors: "+str(errors))
                page.close()
                continue
            check(page.locator(".signal-score-ring").count()==1,label+" shows circular score")
            score=page.locator(".signal-score-center strong").inner_text()
            if mode=="product" or situation=="limited":
                check(score=="—",label+" avoids a fake score")
                check(page.locator(".signal-item-value").all_inner_texts()==["—"]*5,
                      label+" avoids unsupported ratings")
                check("signal-tone-unknown" in page.locator(".signal-score-ring").get_attribute("class"),
                      label+" shows neutral unverified ring")
            else:
                check(score.isdigit(),label+" shows an evidence-based score")
                check("signal-tone-" in page.locator(".signal-score-ring").get_attribute("class"),
                      label+" colors the score ring")
            check(page.locator(".signal-item").count()==5,label+" has five clear signals")
            check(page.locator(".signal-item .signal-bar-fill").count()==5,
                  label+" has five meaningful colored bars")
            check(page.locator(".signal-detail-card").count()==5,
                  label+" has exactly five results cards")
            check(page.locator(".signal-detail-card[open]").count()==0,
                  label+" starts with every card closed")
            check(page.locator(".signal-unlock").count()==0,
                  label+" has no paid offer")
            check(page.locator(".signal-download").is_visible(),
                  label+" offers full PDF free")
            check(not page.locator("#rvReport").is_visible() and
                  not page.locator("#fiveReport").is_visible(),
                  label+" hides old duplicate report")
            count=34 if situation=="many" else (0 if situation in ("limited","zero") else 4)
            cards=page.locator(".signal-detail-card")
            cards.nth(0).locator("summary").click()
            check(cards.nth(0).evaluate("(x)=>x.open"),
                  label+" first card expands")
            if count:
                visible=min(count,5)
                check(cards.nth(0).locator(".signal-mini-row:visible").count()==visible,
                      label+" reveals only top concerns initially")
                check("Everything, simplified" in cards.nth(0).inner_text(),
                      label+" gives concrete evidence")
                if count>5:
                    cards.nth(0).locator(".signal-show-more").click()
                    check(cards.nth(0).locator(".signal-mini-row:visible").count()==count,
                          label+" can reveal all findings without extra cards")
            else:
                check(cards.nth(0).locator(".signal-empty").is_visible(),
                      label+" explains missing findings without inventing them")
            cards.nth(1).locator("summary").click()
            check(cards.nth(1).evaluate("(x)=>x.open") and
                  not cards.nth(0).evaluate("(x)=>x.open"),
                  label+" only one card stays expanded")
            cards.nth(2).locator("summary").click()
            check(cards.nth(2).locator(".signal-fix-row").count()==count,
                  label+" preserves every available fix")
            cards.nth(3).locator("summary").click()
            actual_copy=cards.nth(3).locator(".signal-rewrite-row").count()
            check(actual_copy==(2 if situation=="rewrite" else 0),
                  label+" shows real rewrites, never generic repair steps")
            cards.nth(4).locator("summary").click()
            check(cards.nth(4).locator(".signal-step-row").count()==count,
                  label+" maintains an ordered plan")
            cards.nth(4).locator("summary").click()
            check(page.locator(".signal-detail-card[open]").count()==0,
                  label+" supports closing all cards again")
            if mode=="website" and situation=="findings" and width in (390,1280):
                page.screenshot(path=str(CAPTURES/f"signal-cards-{width}.png"),full_page=True)
            if mode=="website" and situation=="findings" and width==390:
                with page.expect_download(timeout=15000) as ev:
                    page.locator(".signal-download").click()
                pdf=Path(ev.value.path()).read_bytes()
                check(pdf.startswith(b"%PDF") and len(pdf)>1800,
                      label+" downloads a valid complete PDF")
                check(b"Unclear headline" in pdf and b"Proof is hard to find" in pdf,
                      label+" PDF preserves actual current buyer findings")
                check(b"Why People May Hesitate" in pdf and b"Better Copy and Rewrites" in pdf,
                      label+" PDF matches the new five-card report content")
                check(b"Reference scan finding" in pdf and b"Sample check" in pdf,
                      label+" PDF appendix keeps the other recorded scanner findings and checks")
            dims=page.evaluate("()=>[innerWidth,document.body.scrollWidth,document.documentElement.scrollWidth]")
            check(max(dims[1:])<=dims[0]+3,label+f" avoids horizontal overflow {dims}")
            check(not errors,label+" has no browser errors: "+str(errors))
            page.close()
    browser.close()
print("PASS: VYLENS circle, signals and five collapsible report cards")
