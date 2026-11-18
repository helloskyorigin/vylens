# VYLENS

**VYLENS** is a clean, responsive landing-page frontend for a website and digital-product audit tool.

## Run locally

No build tools or dependencies required. Start any static HTTP server from the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Deploy

Deploy the repository as a **static website** on Vercel (Framework Preset: Other; no build command) or Netlify. `index.html` is the entry point.

## Included

- Approved white + lime visual language and the owner-provided VYLENS icon
- Distinct responsive desktop and mobile hero / audit preview layouts
- Interactive Website / Digital Product modes, URL validation, file selection and optional sales context
- Interactive example report, FAQ, pricing and navigation
- Simple Privacy and Terms pages
- Reduced motion and accessible input / dialog states

## Important — frontend only

The audit engine, file uploads, report generation and payments are **not connected**. Submitting the form clearly explains that no scan or upload happened. Sample findings are labeled examples; no synthetic results are presented as real. Do not market this as a functioning paid audit service until a tested backend, payment provider, privacy/data-retention policy, and report delivery flow are connected.

## Current planned prices

Website Audit: **$19 one-time**. Digital Product Audit: **$9 one-time**. Free preview: **$0**.
