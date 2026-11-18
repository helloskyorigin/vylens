# VYLENS — Website & Digital Product Audits

VYLENS currently offers a **free beta** for source-level website checks and supported local digital-product file checks. It has three separate screens:

1. `index.html` — choose a website URL or a supported product file.
2. `inspect.html` — simple branded analysis animation with real processing states.
3. `results.html` — complete available findings, verified evidence, prioritized fixes, manual action plan, passed/attempted checks and printable report.

## What the audit can and cannot assess

- Website inspections are handled by `api/inspect.mjs` through a server-side fetch of public HTML, with URL, DNS and IP safeguards. They check source-level metadata, headings, image alt-attribute presence, document language, mobile viewport and basic CTA labels. They do **not** render JS, verify that checkout works, run visual contrast tests, measure actual conversion, or certify accessibility.
- Digital-product inspections use `audit-core.js` in the browser for selected PDF, TXT, Markdown, ZIP and image files (maximum 15 MB). The selected file is not uploaded to a VYLENS server. PDF text extraction currently samples the first 12 pages.
- Critical is reserved for confirmed severe problems (for example an archive with no regular files), High for material verifiable issues, and non-urgent findings appear without severity inflation as additional observations.
- The **Checks Run** count is based on actual attempted checks. Passes are counted separately only where a narrow requirement was verified; no AI score is fabricated.
- The full available result is free. No checkout, payment, blur or locked audit sections exist in this version. Planned prices are not active.

## Usage

Deploy the repository root to Vercel (Framework Preset: Other). Vercel serves static pages and `/api/inspect.mjs` as a serverless function. Open `index.html` and run an audit. The file workflow transfers selected data locally in browser storage between landing and analysis pages, then removes the temporary transfer record after retrieval. The report is held in `sessionStorage`; it is not a permanent account record. `Save full report as PDF` opens the browser's print dialog so the user can choose **Save as PDF**.

## QA

Run `python qa_tests.py` for source syntax, links, CSS parsing and SSRF safety fixtures. Live rendering should be checked at multiple mobile and desktop widths before production release. This repository does not guarantee that any arbitrary site will accept the source fetch.

Business contact: **hello.skyorigin@gmail.com**.
