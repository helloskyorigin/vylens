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
            "renderedPages": 2 if coverage else 0
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
            check(page.locator("#five-changes .five-change").count() == min(5, len(sample["conversion"]["blockers"])),
                  f"{kind}: action count grounded {width}")
            ring = page.locator(".five-score-number").inner_text()
            check(ring.isdigit() if kind == "website" else ring == "—",
                  f"{kind}: score withheld unless multiple rendered stages are assessed {width}")
            check(page.locator(".five-counter.high").inner_text().strip().endswith(
                "1 High" if kind in ("website", "product") else "0 High"),
                  f"{kind}: real high-priority count {width}")
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
            if kind == "website" and width in (390, 1280):
                page.screenshot(path=str(OUT / f"five-report-{width}.png"), full_page=True)
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
