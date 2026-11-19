"""VYLENS five-section Results browser QA: responsive, data-grounded, accessible."""
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
    for width in [320, 360, 390, 600, 768, 1024, 1280, 1440]:
        for kind, sample in [
            ("website", fixture()),
            ("no-blockers", fixture(num=0)),
            ("product", fixture(mode="product", num=1)),
            ("limited", fixture(num=0, coverage=False))
        ]:
            page = browser.new_page(
                viewport={"width": width, "height": 850},
                device_scale_factor=1,
                reduced_motion="reduce",
            )
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.add_init_script(
                "sessionStorage.setItem('vylens:result',"
                + json.dumps(json.dumps(sample)) + ");"
            )
            response = page.goto(BASE + "/results.html", wait_until="load", timeout=55000)
            check(response.status == 200, f"{kind}: HTTP 200 at {width}")
            check(page.locator("#fiveReport").is_visible(), f"{kind}: focused report visible {width}")
            check(page.locator("body").evaluate("(e) => e.classList.contains('five-report-ui')"),
                  f"{kind}: focused CSS mode active {width}")
            check(page.locator("#fiveReport > .five-score-card").count() == 1,
                  f"{kind}: score summary {width}")
            check(page.locator(".five-score-visual .five-problems-card").is_visible(),
                  f"{kind}: problems card next to score ring at {width}")
            check(page.locator(".five-problems-value").inner_text() ==
                  str(len(sample["conversion"]["blockers"])),
                  f"{kind}: problem count comes from findings at {width}")
            check(page.locator("#fiveBottomDownload").is_visible() and
                  page.locator("#fiveBottomNew").is_visible(),
                  f"{kind}: final download/new-check actions at {width}")
            for section in ["five-blockers", "five-hesitations", "five-changes", "five-action-plan"]:
                check(page.locator("#" + section).is_visible(), f"{kind}: {section} visible {width}")
            check(page.locator("#fiveReport .five-panel").count() == 4,
                  f"{kind}: exactly five sections, including score {width}")
            check(not page.locator("#conversionReport").is_visible(),
                  f"{kind}: old dashboard hidden {width}")
            check(not page.locator("#technicalAppendix").is_visible(),
                  f"{kind}: no technical appendix in buyer-facing results {width}")
            check(not page.locator(".metrics-section").is_visible(),
                  f"{kind}: technical counters hidden {width}")
            check(page.locator("#navDownload").is_visible(),
                  f"{kind}: download stays accessible {width}")
            check(not page.locator("#navRecheck").is_visible(),
                  f"{kind}: no extra recheck action {width}")
            check(page.locator("#five-blockers .five-finding").count() == len(sample["conversion"]["blockers"]),
                  f"{kind}: blocker count grounded {width}")
            check(page.locator("#five-hesitations .five-concern").count() == min(4, len(sample["conversion"]["blockers"])),
                  f"{kind}: buyer concerns grounded {width}")
            if sample["conversion"]["blockers"]:
                check(page.locator("#five-hesitations .five-concern").first.inner_text().strip().endswith("?"),
                      f"{kind}: buyer hesitation is a natural question {width}")
                check(page.locator("#five-changes .five-action-note").first.is_visible(),
                      f"{kind}: first recommendation visible without expansion {width}")
            if sample["conversion"]["strengths"]:
                positives=page.locator(".five-positive-details")
                check(positives.count()==1 and not positives.evaluate("(e)=>e.open"),
                      f"{kind}: real strengths available on demand {width}")
                positives.locator("summary").click()
                check("A button was observed." in positives.inner_text(),
                      f"{kind}: positive observation explains its evidence {width}")
            check(page.locator("#five-changes .five-change").count() == min(5, len(sample["conversion"]["blockers"])),
                  f"{kind}: action count grounded {width}")
            if kind == "website":
                check(page.locator("#fiveBuyerReplay").is_visible(),
                      f"{kind}: observed buyer replay visible inside section 2 at {width}")
                check(page.locator("#fiveBuyerReplay .five-replay-step").count() == 4,
                      f"{kind}: exactly four public journey steps at {width}")
                check("below the first phone screen" in page.locator("#fiveBuyerReplay").inner_text(),
                      f"{kind}: mobile observations selected by default at {width}")
                page.locator("#fiveBuyerReplay button").filter(has_text="Desktop").click()
                check("Buy now appears in the first screen" in page.locator("#fiveBuyerReplay").inner_text(),
                      f"{kind}: switching to desktop updates the real journey at {width}")
                check(page.locator("#fiveBuyerReplay button").filter(has_text="Desktop")
                      .get_attribute("aria-pressed") == "true",
                      f"{kind}: replay switch exposes its pressed state at {width}")
            if sample["conversion"]["fixKit"]:
                check(page.locator("#fiveConversionFixKit").is_visible(),
                      f"{kind}: copyable fix kit present inside section 4 at {width}")
                check(page.locator("#fiveConversionFixKit .five-kit-item").count() == 1,
                      f"{kind}: copy-ready kit avoids duplicating checklist cards at {width}")
                check("View pricing" in page.locator("#fiveConversionFixKit").inner_text(),
                      f"{kind}: supported CTA wording preserved at {width}")
            ring = page.locator(".five-score-number").inner_text()
            check(ring.isdigit() if kind == "website" else ring == "—",
                  f"{kind}: score withheld unless multiple rendered stages are assessed {width}")
            check(page.locator(".five-problems-card").inner_text().find(
                "1 High" if kind in ("website", "product") else
                "No reported issues") >= 0,
                  f"{kind}: severity correctly displayed at {width}")
            check(not errors, f"{kind}: browser console without JS errors at {width}: {errors}")
            bounds = page.evaluate(
                "() => ({viewport: innerWidth, body: document.body.scrollWidth,"
                " doc: document.documentElement.scrollWidth})"
            )
            check(max(bounds["body"], bounds["doc"]) <= bounds["viewport"] + 3,
                  f"{kind}: no horizontal overflow at {width}: {bounds}")
            if kind in ("website", "product"):
                first = page.locator("#five-blockers .five-finding").first
                first.locator("summary").click()
                check(first.evaluate("(el) => el.open"),
                      f"{kind}: expandable evidence works at {width}")
                page.locator("#five-action-plan .five-plan-row").first.click()
                check(page.locator("#five-change-0").evaluate("(el) => el.open"),
                      f"{kind}: plan navigates to proposed fix at {width}")
                check("Explain the concrete buyer benefit" in
                      page.locator("#five-change-0").inner_text(),
                      f"{kind}: real suggestion shown at {width}")
                detail_count=page.locator("#five-change-0 .five-change-details .five-detail-line").count()
                check(2 <= detail_count <= 3,
                      f"{kind}: expanded fix has evidence, optional location and verification only {width}")
                check("On inspected public page" in
                      page.locator("#five-change-0 .five-change-details").inner_text(),
                      f"{kind}: full evidence available on request {width}")
            if kind == "website" and width in (390, 1280):
                page.screenshot(path=str(OUT / f"five-report-{width}.png"), full_page=True)
                with page.expect_download(timeout=15000) as started:
                    page.locator("#fiveBottomDownload").click()
                download=started.value
                pdf_bytes=Path(download.path()).read_bytes()
                check(download.suggested_filename.endswith(".pdf") and
                      pdf_bytes.startswith(b"%PDF-1.4") and b"%%EOF" in pdf_bytes[-40:]
                      and len(pdf_bytes)>2200 and b"/Type /Page" in pdf_bytes,
                      f"{kind}: real PDF file downloaded, not print dialog at {width}")
                check(b"Buyer Journey Replay" in pdf_bytes and
                      b"Conversion Fix Kit" in pdf_bytes and
                      b"View pricing" in pdf_bytes and
                      b"Clarify the buyer benefit" in pdf_bytes,
                      f"{kind}: both new features exported in PDF at {width}")
                with page.expect_download(timeout=15000) as top_started:
                    page.locator("#navDownload").click()
                check(top_started.value.suggested_filename.endswith(".pdf"),
                      f"{kind}: top download also saves PDF at {width}")
                page.emulate_media(media="print")
                check(page.locator("#fiveReport").is_visible(),
                      f"{kind}: same five sections visible in PDF {width}")
                check(not page.locator("#printAppendix").is_visible(),
                      f"{kind}: technical print appendix hidden in PDF {width}")
            page.close()
    # Even when most findings are collapsed visually, PDF must include them all.
    page = browser.new_page(viewport={"width": 390, "height": 850})
    sample = fixture(num=7)
    page.add_init_script(
        "sessionStorage.setItem('vylens:result'," + json.dumps(json.dumps(sample)) + ");"
    )
    page.goto(BASE + "/results.html", wait_until="load", timeout=55000)
    check(page.locator(".five-finding[hidden]").count() == 4,
          "extra findings are collapsed by default")
    page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
    check(page.locator(".five-finding:not([hidden])").count() == 7,
          "all seven findings included when printing")
    check(all(page.locator(".five-finding").nth(i).evaluate("(e) => e.open")
              for i in range(7)), "print includes every finding's details")
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    check(page.locator(".five-finding[hidden]").count() == 4,
          "after-print restores collapsed extras")
    page.locator("#five-blockers .five-more").click()
    check(page.locator(".five-finding:not([hidden])").count() == 7,
          "show all expands additional findings")
    page.close()
    # Product files: issue count and visible details must match.
    page=browser.new_page(viewport={"width":390,"height":850})
    sample=fixture(mode="product",num=0)
    sample["conversion"]["blockers"]=[
        {"id":"file-1","stage":"value","priority":"high",
         "title":"The delivered bundle contains no product files",
         "evidence":"Archive contained no deliverables.",
         "fix":"Add the promised files.","verify":"Extract the ZIP.",
         "source":"Locally inspected product file","location":"Uploaded ZIP"},
        {"id":"file-2","stage":"action","priority":"review",
         "title":"Getting-started instructions are not obvious",
         "evidence":"No recognizable start guide was found.",
         "fix":"Add a start guide.","verify":"Ask a first-time user.",
         "source":"Locally inspected product file","location":"Uploaded ZIP"}
    ]
    page.add_init_script(
        "sessionStorage.setItem('vylens:result'," + json.dumps(json.dumps(sample)) + ");"
    )
    page.goto(BASE + "/results.html",wait_until="load",timeout=55000)
    check(page.locator(".five-problems-value").inner_text()=="2",
          "product reported count is 2")
    check(page.locator("#five-blockers .five-finding").count()==2,
          "product file findings are visible in What Needs Fixing")
    check(page.locator("#five-hesitations .five-concern").count()==2,
          "product questions are supported by file defects")
    check(page.locator("#five-changes .five-change").count()==2,
          "product fix instructions match reported problems")
    page.close()
    # New Check navigates to a fresh audit rather than repeating the current URL.
    page=browser.new_page(viewport={"width":390,"height":850})
    sample=fixture()
    page.add_init_script(
        "sessionStorage.setItem('vylens:result'," + json.dumps(json.dumps(sample)) + ");"
    )
    page.goto(BASE + "/results.html", wait_until="load", timeout=55000)
    page.locator("#fiveBottomNew").click()
    page.wait_for_url("**/index.html#audit-tool", timeout=15000)
    check("#audit-tool" in page.url, "New Check opens fresh audit")
    page.close()
    # Legacy / imported technical-only reports are still readable.
    page = browser.new_page(viewport={"width": 390, "height": 850})
    legacy = fixture()
    legacy.pop("conversion")
    page.add_init_script(
        "sessionStorage.setItem('vylens:result'," + json.dumps(json.dumps(legacy)) + ");"
    )
    page.goto(BASE + "/results.html", wait_until="load", timeout=55000)
    check(page.locator("#fiveReport").count() == 0,
          "legacy report bypasses focused renderer")
    check(page.locator(".metrics-section").is_visible(),
          "legacy report keeps original technical results")
    page.close()
    browser.close()
print("Five-section conversion report QA passed.", flush=True)
