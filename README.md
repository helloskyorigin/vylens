# VYLENS — Website & Digital Product Inspection

White + lime, responsive landing page and a dedicated Inspection Workspace, built as a static frontend with one Vercel Function for initial public HTML checks.

## Pages

- `index.html` — landing page and URL/file submission.
- `inspect.html` — real first-look workspace: receive → inspect → review → results.
- `privacy.html`, `terms.html`, `refunds.html`, `cookies.html`, `disclaimer.html`, `contact.html` — customer-facing policy/contact pages.
- `api/inspect.mjs` — first-look **source-level** website inspection endpoint, deployed automatically under `/api/inspect` when hosted by Vercel.

## What works now

**Website:** submit a publicly accessible HTTP(S) URL; the Vercel Function safely retrieves a bounded HTML response and checks title, description, H1 headings, mobile viewport, basic CTA labels, image alt attributes and document language. First three identified findings, their concrete HTML evidence and suggested next steps appear in the workspace. Redirects are bounded, private IPs and local domains are blocked, request size/time are capped. Some public sites block bots or render meaningful content only through JavaScript; this may cause partial/failed audits. **This is NOT a screenshot, performance, visual UX, analytics, or AI semantic analysis.**

**Digital products:** submit PDF, TXT, MD, ZIP or PNG/JPG/WebP (15 MB limit). The file is transferred from landing to inspection through temporary browser IndexedDB and removed from the transfer store when retrieved. It is not uploaded to VYLENS. Text files get basic content/structure checks; ZIPs get file-list checks; images get pixel/size checks. PDF documents use the Mozilla PDF.js browser reader from cdnjs (`4.10.38`) for text extraction of up to 12 initial pages; if the CDN is blocked or a PDF is protected/unreadable, a clear error appears rather than invented findings. **No visual/AI interpretation of documents or images occurs.**

**UX:** responsive desktop and genuinely rearranged mobile workspace, accessible progress steps driven by actual analysis events, retries/errors, selectable finding cards, print-to-PDF of a free first look, and a contact request for deeper audits. The deeper review is $19 for a website or $9 for a digital product, one time. **There is no checkout, automatic paid report unlock or claim of a completed full AI audit.**

## Local usage

Run a static file server from the repository root for the frontend. The `api/inspect.mjs` endpoint requires a Vercel (or equivalent) serverless environment; a static-only server cannot inspect public websites. All local product-file checks work in the browser without the API, except for PDF.js which must download its open-source browser library.

To run syntax, HTML/CSS path, and URL safety tests locally:

```sh
python qa_tests.py
```

## Security and privacy notes

- Public URL inspection server requests do not intentionally persist page content or results; hosting/CDN/server logs may persist technical request metadata.
- The serverless IP guard avoids local/private addresses, pins DNS resolution for outbound requests, limits redirects and response size, and applies a best-effort in-memory request throttle. Add shared durable rate limiting and monitoring before significant traffic.
- Files are never automatically sent to an audit API or email recipient. An abandoned browser transfer may remain until replaced or cleared in website storage; completed transfers are removed from IndexedDB after retrieval.
- Never treat heuristic checks as claims about actual conversions or profitability.

Business contact: **hello.skyorigin@gmail.com**.
