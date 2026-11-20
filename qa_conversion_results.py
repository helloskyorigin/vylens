"""VYLENS seven-section buyer report browser QA: responsive, data-grounded, accessible."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("VYLENS_BASE", "https://vylens-tan.vercel.app").rstrip("/")
OUT = Path("qa-captures")
OUT.mkdir(exist_ok=True)

def blocker(n, priority="review", stage="clarity"):
    return {
        "id": f"buyer-{n}", "stage": stage, "priority": priority,
        "title": f"Potential buying obstacle {n}: value presentation needs clarity",
        "evidence": f"On inspected public page {n}, the offer description was unclear.",
        "buyerConcern": f"Could visitors understand why option {n} is worth choosing?",
        "buyerQuestion": f"What do I get from option {n}?",
        "fix": f"Explain the concrete buyer benefit for offer point {n} in everyday language.",
        "verify": f"Ask five qualified visitors whether offer point {n} is understandable.",
        "location": f"/offer-{n} · buying section",
        "confidence": "observed" if n == 1 else "hypothesis",
        "source": "Rendered public page",
    }

def fixture(mode="website", num=3, coverage=True):
    items = [blocker(i+1, "high" if i == 0 else "review",
                     ["clarity", "trust", "action"][i % 3]) for i in range(num)]
    return {
        "mode": mode, "url": "https://example.org/", "subject": "example.org",
        "checkedAt": "2026-11-19T08:00:00Z",
        "issues": [{"title": "Old technical finding", "category": "Metadata",
                    "severity": "note", "fix": "Do not show this in the main report."}],
        "checks": [{"name": "Technical check", "status": "passed"}],
        "coverage": {"discovered": 3, "inspected": 2 if coverage else 0,
                     "complete": coverage, "rendered": 2 if coverage else 0},
        "conversion": {
            "version": 1, "kind": mode, "goal": "Purchase or signup",
            "blockers": items,
            "journey": [
                {"id": stage, "label": label, "status": "attention",
                 "detail": "Evidence from the public offer."}
                for stage, label in [
                    ("clarity", "Offer clarity"), ("value", "Value"),
                    ("trust", "Buyer confidence"), ("action", "Next step")]
            ],
            "strengths": [{"stage": "action", "title": "A visible offer action",
                           "evidence": "A button was observed.", "location": "/"}]
                         if coverage else [],
            "unverified": ["Real buyers and checkout completion are not measured."],
            "inspectedOfferPages": 1 if coverage else 0,
            "renderedPages": 2 if coverage else 0,
            "buyerReplay": {
                "version": 1,
                "source": "rendered-dom",
                "desktop": [
                    {"id": "offer", "title": "1. See the offer",
                     "description": "Page headline: Example offer.", "status": "observed", "place": "/"},
                    {"id": "price", "title": "2. Check price",
                     "description": "A price of $19 was observed.", "status": "observed", "place": "/pricing"},
                    {"id": "action", "title": "3. Find the next step",
                     "description": "Buy now appears in the first screen.", "status": "observed", "place": "/"},
                    {"id": "destination", "title": "4. Follow the destination",
                     "description": "Link points to /checkout; payment was not tested.",
                     "status": "unknown", "place": "/checkout"}
                ],
                "mobile": [
                    {"id": "offer", "title": "1. See the offer",
                     "description": "Phone offer was visible.", "status": "observed", "place": "/"},
                    {"id": "price", "title": "2. Check price",
                     "description": "Phone price was visible.", "status": "observed", "place": "/pricing"},
                    {"id": "action", "title": "3. Find the next step",
                     "description": "Buy now was below the first phone screen.",
                     "status": "review", "place": "/"},
                    {"id": "destination", "title": "4. Follow the destination",
                     "description": "Checkout success was not measured.",
                     "status": "unknown", "place": "/checkout"}
                ]
            } if coverage and mode == "website" else None,
            "fixKit": [
                {"id": "kit-1", "blockerId": "buyer-1", "kind": "copy",
                 "label": "CTA label", "title": "A supported CTA wording",
                 "content": "View pricing", "source": "Observed pricing link",
                 "verify": "Confirm it opens the pricing page"},
                {"id": "kit-2", "blockerId": "buyer-2", "kind": "checklist",
                 "label": "Fix checklist", "title": "Offer clarity action",
                 "content": "Clarify the buyer benefit in a single sentence.",
                 "source": "Page heading", "verify": "Ask a visitor"}
            ] if num and coverage else []
        },
    }

def check(result, label):
    assert result, label
    print("PASS:", label, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
    for width in [320,390,768,1280]:
        for kind,sample in [
            ("website",fixture(num=3)),
            ("no-blockers",fixture(num=0)),
            ("product",fixture(mode="product",num=1)),
            ("limited",fixture(num=0,coverage=False))
        ]:
            page=browser.new_page(viewport={"width":width,"height":850},
                                   reduced_motion="reduce",accept_downloads=True)
            errors=[]
            page.on("pageerror",lambda error:errors.append(str(error)))
            page.add_init_script("sessionStorage.setItem('vylens:result',"+
                                 json.dumps(json.dumps(sample))+");")
            response=page.goto(BASE+"/results.html",wait_until="load",timeout=55000)
            check(response.status==200,f"{kind} at {width}px: response 200")
            root=page.locator("#fiveReport.ten-results.seven-results")
            check(root.is_visible(),f"{kind} at {width}px: premium seven-section report")
            for section in ["five-blockers","five-action-plan","seven-strengths","seven-comparison",
                            "seven-journey","seven-limitations","seven-actions"]:
                check(page.locator("#"+section).is_visible(),
                    f"{kind} at {width}px: {section} visible")
            check(page.locator(".ten-section-heading").count()==6,
                  f"{kind} at {width}px: six numbered section headers")
            check(page.locator(".ten-limit-index").count()==1,
                  f"{kind} at {width}px: numbered limitations header")
            check(page.locator(".five-problems-value").inner_text()==str(len(sample["conversion"]["blockers"])),
                  f"{kind} at {width}px: blockers derive from verified findings")
            check(page.locator(".ten-strengths-count").inner_text()==str(len(sample["conversion"]["strengths"])),
                  f"{kind} at {width}px: positive count is grounded")
            check(page.locator(".ten-summary-side>.five-problems-card").count()==1,
                  f"{kind} at {width}px: summary contains compact problems card")
            check(page.locator(".ten-summary-side>.ten-strengths-card").count()==1,
                  f"{kind} at {width}px: summary contains compact strengths card")
            check(page.locator("#five-blockers .five-finding").count()==len(sample["conversion"]["blockers"]),
                  f"{kind} at {width}px: findings count accurate")
            check(page.locator("#five-action-plan .seven-plan-step").count()==min(5,len(sample["conversion"]["blockers"])),
                  f"{kind} at {width}px: top five navigable actions")
            check(page.locator("#seven-strengths .seven-strength").count()==len(sample["conversion"]["strengths"]),
                  f"{kind} at {width}px: evidence-backed strengths")
            check(page.locator("#seven-comparison .seven-compare-stat").count()==3,
                  f"{kind} at {width}px: comparison has 3 states before and after recheck")
            check(page.locator("#seven-journey .seven-stage").count()==4,
                  f"{kind} at {width}px: Clarity / Value / Trust / Action stages")
            check(page.locator("#seven-limitations .ten-limit-preview").count()==1,
                  f"{kind} at {width}px: limitations preview exists before expand")
            check(page.locator("#fiveBottomDownload").is_visible() and
                  page.locator("#fiveBottomNew").is_visible(),
                  f"{kind} at {width}px: primary actions visible")
            check(page.locator("#seven-actions > .seven-quiet-action").is_visible(),
                  f"{kind} at {width}px: secondary Recheck visible")
            check(page.locator("#seven-actions .ten-data-tools").count()==1,
                  f"{kind} at {width}px: data tools behind disclosure")
            check(page.locator(".five-score-number").inner_text()=="—",
                  f"{kind} at {width}px: insufficient evidence does not produce misleading 85/100")
            check(not errors,f"{kind} at {width}px: no uncaught JavaScript errors {errors}")
            bounds=page.evaluate("()=>({w:innerWidth,b:document.body.scrollWidth,d:document.documentElement.scrollWidth})")
            check(max(bounds['b'],bounds['d'])<=bounds['w']+4,
                  f"{kind} at {width}px: no horizontal overflow {bounds}")
            if sample["conversion"]["blockers"]:
                first=page.locator("#five-blockers .five-finding").first
                check(first.evaluate("(node)=>node.open"),
                      f"{kind} at {width}px: first finding expanded")
                for name in ["Evidence","Possible buyer concern","What to change","How to verify"]:
                    check(name in first.inner_text(),f"{kind} at {width}px: {name} inside finding")
                check(first.locator(".ten-evidence-grid>.seven-evidence-line").count()==4,
                      f"{kind} at {width}px: four individually highlighted subcards")
                page.locator("#five-action-plan .seven-plan-step").first.click()
                check(first.evaluate("(node)=>node.open"),
                      f"{kind} at {width}px: improvement tap reaches matching blocker")
                detail=page.locator("#five-action-plan .seven-support-details")
                detail.locator("summary").first.click()
                check(page.locator("#five-changes .five-change").count()==len(sample["conversion"]["blockers"]),
                      f"{kind} at {width}px: detailed fix list preserved")
            else:
                check(page.locator("#five-blockers .ten-empty").count()==1,
                      f"{kind} at {width}px: one compact no-blocker state")
                check(page.locator("#five-action-plan .ten-empty").count()==1,
                      f"{kind} at {width}px: one compact no-plan state")
                check(page.locator("#five-action-plan .five-empty").count()==0,
                      f"{kind} at {width}px: no duplicate no-plan messages")
                check(page.locator("#five-action-plan .seven-support-details").count()==0,
                      f"{kind} at {width}px: empty fix kit not shown")
            if sample["conversion"]["strengths"]:
                check("Homepage" in page.locator("#seven-strengths").inner_text(),
                      f"{kind} at {width}px: root path shown as Homepage, not slash")
            page.close()
    # Same-input recheck diff counts and continuity.
    page=browser.new_page(viewport={"width":390,"height":850},reduced_motion="reduce")
    sample=fixture(num=3)
    old={"mode":"website","sourceKey":"https://example.org","blockers":[
        {"stage":"clarity","title":sample["conversion"]["blockers"][0]["title"],
         "location":sample["conversion"]["blockers"][0]["location"]},
        {"stage":"action","title":"Old detected issue","location":"/old"}]}
    page.add_init_script("sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(sample))+");"+
                         "sessionStorage.setItem('vylens:previous-conversion',"+json.dumps(json.dumps(old))+");")
    page.goto(BASE+"/results.html",wait_until="load",timeout=55000)
    values=page.locator("#seven-comparison .seven-compare-stat strong").all_inner_texts()
    check(values==["2","1","1"],f"actual recheck new/continuing/not-now counts {values}")
    check(page.locator("#seven-blocker-0").evaluate("(el)=>el.open"),"first issue open by default")
    page.close()
    # Full-size positive set remains capped at six, all screenshot cases remain responsive.
    page=browser.new_page(viewport={"width":390,"height":850},reduced_motion="reduce",accept_downloads=True)
    sample=fixture(num=7)
    sample["conversion"]["strengths"]=[
        {"stage":"clarity","title":f"Observed positive {i}","evidence":"Recorded page evidence",
         "location":"/"} for i in range(8)]
    page.add_init_script("sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(sample))+");")
    page.goto(BASE+"/results.html",wait_until="load",timeout=55000)
    check(page.locator("#seven-strengths .seven-strength").count()==6,"strengths capped at six")
    check(page.locator("#five-blockers .five-finding").count()==7,"all seven findings preserved")
    page.locator("#five-action-plan .seven-plan-step").nth(4).click()
    check(page.locator("#seven-blocker-4").evaluate("(el)=>el.open && !el.hidden"),
          "fifth step opens matching fifth evidence card")
    page.locator("#seven-actions .ten-data-tools summary").click()
    check(page.locator("#seven-actions .seven-report-tools button").count()==2,
          "JSON tools accessible after expansion")
    with page.expect_download(timeout=15000) as pending:
        page.locator("#fiveBottomDownload").click()
    result=pending.value
    pdf=Path(result.path()).read_bytes()
    check(result.suggested_filename.endswith(".pdf") and pdf.startswith(b"%PDF-1.4") and
          b"%%EOF" in pdf[-40:] and len(pdf)>2000,"real PDF download works")
    check(b"What Couldn't Be Verified" in pdf and b"Recheck Comparison" in pdf,
          "PDF contains limitations and comparison")
    page.close()
    # Existing technical-only reports must still use their original renderer.
    page=browser.new_page(viewport={"width":390,"height":850},reduced_motion="reduce")
    sample=fixture()
    sample.pop("conversion")
    page.add_init_script("sessionStorage.setItem('vylens:result',"+json.dumps(json.dumps(sample))+");")
    page.goto(BASE+"/results.html",wait_until="load",timeout=55000)
    check(page.locator("#fiveReport").count()==0 and page.locator(".metrics-section").is_visible(),
          "legacy technical reports stay readable")
    page.close()
    browser.close()

# Scan progress copy: no arbitrary page caps or verbal elapsed clutter.
import urllib.request
with urllib.request.urlopen(BASE+"/inspect.html",timeout=20) as response:
    inspect=response.read().decode()
with urllib.request.urlopen(BASE+"/analysis.js",timeout=20) as response:
    analysis=response.read().decode()
check('role="timer"' in inspect and 'analysis-status-row' in inspect,
      "scan clock is an accessible side pill")
check("Inspecting up to 24" not in analysis and "Up to 24 discoverable" not in inspect,
      "scan progress avoids arbitrary page-cap copy")
print("PASS: VYLENS v10 seven-section, mobile, PDF and scanning QA",flush=True)
