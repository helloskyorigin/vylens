# VYLENS — Website & Digital Product Audits

VYLENS currently offers a **free beta** for source-level website checks and supported local digital-product file checks. It has three separate screens:

1. `index.html` — choose a website URL or a supported product file.
2. `inspect.html` — simple branded analysis animation with real processing states.
3. `results.html` — complete available findings, verified evidence, prioritized fixes, manual action plan, passed/attempted checks and printable report.

## What the audit can and cannot assess

- Website inspections are handled by `api/inspect.mjs` through a server-side fetch of public HTML with URL/DNS/IP safeguards. They verify HTTP/HTTPS, titles/descriptions, headings, mobile viewport, label/accessible-name presence, duplicate IDs, same-page anchors, meta/header indexability, social metadata, insecure form actions, and up to three same-origin links (HEAD with GET confirmation for broken responses or servers rejecting HEAD). They do **not** render JS, verify that checkout works, run visual contrast tests, measure actual conversion, or certify accessibility.
- Digital-product inspections use `audit-core.js` in the browser for selected PDF, TXT, Markdown, ZIP and image files (maximum 15 MB). The selected file is not uploaded to a VYLENS server; an optional public sales-page URL is sent separately for source-level checks. PDF text extraction covers all pages up to 120; longer documents sample the first 110 and final 10 and explicitly report that limit. ZIP inspection includes file sizes, names, cross-platform path traversal checks and available local instructions. Archived file contents are not comprehensively checked.
- Critical is reserved for confirmed severe problems (for example an archive with no regular files), High for material verifiable issues, and non-urgent findings appear without severity inflation as additional observations.
- The **Checks Run** count is based on actual attempted checks. Passes are counted separately only where a narrow requirement was verified; no AI score is fabricated.
- The full available result is free. No checkout, payment, blur or locked audit sections exist in this version. Planned prices are not active.

## Usage

Deploy the repository root to Vercel (Framework Preset: Other). Vercel serves static pages and the `/api/inspect` endpoint from `api/inspect.mjs` as a serverless function. Open `index.html` and run an audit. The file workflow transfers selected data locally in browser storage between landing and analysis pages, then commits deletion of the temporary transfer record before proceeding; a transfer older than 15 minutes is discarded. The report is held in `sessionStorage`; it is not a permanent account record. `Save full report as PDF` opens the browser's print dialog so the user can choose **Save as PDF**.

## QA

Run `python qa_tests.py` for source syntax, links, CSS parsing and SSRF safety fixtures. Run `python qa_product_browser.py` and `python qa_results_browser.py` for supported file and report rendering checks. GitHub and live Vercel availability should still be verified separately. Live rendering should be checked at multiple mobile and desktop widths before production release. This repository does not guarantee that any arbitrary site will accept the source fetch.

Business contact: **hello.skyorigin@gmail.com**.

## Scanner v3 accuracy improvements

- Failed HEAD probes (403/404/405/410/501) are verified with a bounded GET; only GET-confirmed 404/410 responses generate a broken-link finding. Probes now run concurrently with a fixed three-link ceiling and examine final response status without downloading whole response bodies.
- JavaScript app shells are treated as **unverified** for rendered headings/anchors rather than being falsely called broken. `X-Robots-Tag` is checked alongside HTML robots metadata; deliberate `noindex` is a note, not an unconditional High problem.
- An HTTP form destination is described as an observed source risk, not as a confirmed checkout failure. No critical checkout claim is made from passive HTML.
- ZIP path traversal checks handle Windows-style separators and drive/UNC paths; filenames normalize separators for duplicate detection. A found but unreadable guide is not marked passed.
- Temporary file handoff waits for IndexedDB deletion to commit and rejects expired transfers. The API caps JSON request bytes while streaming, rejects cross-origin browser requests, and expects application/json.
- The in-memory per-IP request limit is **best-effort only in serverless**; it is not a global distributed quota. Production abuse protection needs a shared rate-limit store or platform-level rules.

Neither pass status nor an empty issue list certifies a website, full product quality, accessibility, security or conversion outcomes: the tool evaluates a bounded set of observable source/file signals only.
