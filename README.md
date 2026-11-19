# VYLENS — Evidence-led Conversion & Buyer-Experience Diagnosis

A free beta with a three-screen workflow:

1. `index.html` — select a public website URL or a supported digital-product file.
2. `inspect.html` / `analysis.js` — run the requested audit and show real states, errors and progress messages.
3. `results.html` / `conversion-results.js` — buyer-journey review, evidence-backed potential sales blockers, possible buyer concern, prioritized fixes, strengths, limitations, print/export and cautious repeat-scan comparison. `results.js` keeps technical checks in a collapsible appendix and supports saved JSON report import.

## Website scan — what runs

The main website workflow calls `POST /api/inspect-site` (`api/inspect-site.mjs`).

- Discovers a bounded set of public same-site links and sitemap URLs while respecting supported robots.txt rules. It attempts up to **24 pages per scan** (not necessarily every page on a site).
- Uses a guarded Playwright crawl where available. Captures bounded, visible public offer evidence (headline, introductory text, pricing references, CTA labels and their first-screen position, purchase-term links near a buying action, selected proof sections and signup form structure) and passes it to `lib/conversion-engine.mjs` for deterministic buyer-journey hypotheses. Existing mobile, accessibility, link, policy and metadata checks stay in a **technical appendix**.
- Falls back to source-only checks when browser rendering is not available. The report labels source-only or skipped pages; lack of verification is **not** treated as a confirmed defect.
- Limits requests, redirects, response sizes, runtime and targets. Browser network requests go through URL/DNS/IP safeguards; this service does not submit forms or inspect authenticated areas.
- The separate `POST /api/inspect` (`api/inspect.mjs`) performs **source-level HTML checks only** and is used for an optional digital-product sales-page URL. Source-only findings never imply that a dynamic rendered CTA or checkout is missing.

Neither endpoint measures actual conversion, reliably verifies a checkout transaction, audits arbitrary private pages, certifies accessibility/security/legal compliance or provides full human-equivalent visual review. Browser rendering and site access are best-effort; sites can block inspection.

## Digital product scan — what runs

`audit-core.js` checks a selected local file in the visitor's browser, up to **15 MB**. The original file is **not uploaded** to VYLENS.

- PDF: selectable text extraction from up to 120 pages, or the first 110 and final 10 pages for longer files; navigation/bookmark checks where available. Scanned/visual-only content is not semantically interpreted.
- TXT and Markdown: supported readable-text, heading, draft-marker and link-target checks.
- ZIP: bounded central-directory listing, file sizes, suspicious paths (including directory entries and Windows-style names), duplicate paths and recognizable local instruction files. It does not fully validate or extract every archived file.
- PNG, JPG, WebP: whether the browser can decode the image, dimensions and file size. It does **not** interpret or grade visual design.
- The local buyer-delivery diagnostic maps verifiable findings such as empty ZIP files, incomplete instructions or unfinished drafts to possible post-purchase friction. **A file cannot explain why visitors didn't buy.** An optional public sales-page URL adds initial-HTML offer evidence; the supplied price is only contextual, not a price-quality rating or conversion score.

The conversion report distinguishes recorded facts from possible buyer objections: every blocker has evidence, location, hypothesis, action and verification instructions. It also shows an optional comparison with a **previous scan of the same input in the same tab**, listing newly detected, continuing and no-longer-detected findings; these are *not* verified fixes or conversion improvements. Technical checks distinguish **Passed**, **Flagged**, **Observed**, **Not verified** and **Not applicable**. A low/zero blocker count is not proof of conversion success. Real customer drop-off, sales losses and checkout completion are never inferred from a public URL or local file.

## Privacy and report delivery

A selected product file is passed between pages in temporary IndexedDB storage, removed on retrieval, and rejected if its transfer is over 15 minutes old. The audit report itself remains in sessionStorage. A repeat scan retains only a small previous blocker fingerprint list (not original product bytes) in sessionStorage for the optional comparison, which never asserts that a missing finding was fixed. A completed audit clears the pending request; reports are not permanent account records. `Print / Save PDF` opens the browser print dialog; the print appendix includes **every recorded check**. Users can download a JSON report and later reopen it locally from the Results empty state; imported reports are labeled and **are not new live scans**. There is no active checkout, subscription or paid unlock in the beta.

## Run and test

Deploy the repository root as a Vercel project with its existing `vercel.json` configuration, Node 22+ and the dependencies in `package.json`. A plain static server will not provide the website-scan API.

Relevant tests (some require Chromium/Playwright and network access to the deployed site):

```sh
python qa_tests.py
python qa_product_browser.py
python qa_launch_browser.py
python qa_focus_results.py
python qa_results_states.py
python qa_conversion_results.py
node qa_conversion_engine.mjs
node qa_problem_engine.mjs
node qa_rendered_fixture.mjs
node qa_multisite_accuracy.mjs
```

Vercel production updates are built from the connected GitHub `main` branch. If a previous build was rate-limited, a new authorized commit can request a fresh build after the quota allows it; the deploy status must still be checked before treating that commit as live.

The GitHub workflows also run targeted browser and scanner checks. After any release, verify current GitHub checks and Vercel deployment status, then manually inspect the UX at phone/tablet/desktop widths, including errors, retries, large reports and print output. Local and CI tests do not replace real-site validation.

## Results UI release

The Results interface uses the dedicated `results-lime.js` and `results-lime.css` layers. The design has a screenshot-matched desktop hierarchy and separate narrow-phone, tablet, and print layouts. Live release still requires a successful Vercel build and confirmation that the production deployment serves the current commit.

## Production limitations

The current per-IP throttle is **in-memory, best-effort only** in a serverless environment. A shared durable rate limiter, abuse monitoring, clear operating limits and additional real-site regression samples are important before sending heavy traffic. Do not treat the scan as a full performance, security or conversion audit.

Business contact: **hello.skyorigin@gmail.com**.
