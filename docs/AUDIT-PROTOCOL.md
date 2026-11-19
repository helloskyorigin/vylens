# VYLENS — Audit and Result Quality Protocol

Updated: November 19, 2026. Keep this file in the project repository. This is the reference for how an audit is performed, how evidence is evaluated, and how findings are displayed. It must be reviewed before changing the scanner or result.

## Product promise

VYLENS is a buyer-facing offer and sales-readiness review, **not** a technical SEO, accessibility, speed or code-quality product. Technical checks can support evidence where they affect an actual buying route, but they must not dominate the customer's five-section result.

It checks what is observable on public pages and in user-supplied digital product files. It cannot measure real buyer thoughts, actual conversion rates, revenue losses, checkout abandonment, or customer satisfaction without the appropriate direct data.

## Website inspection procedure

1. Validate the user-supplied URL. Reject private, internal, or loopback network addresses and unsafe redirects. Respect crawl boundaries, robots instructions, page limits and scan timeouts.
2. Discover the homepage, relevant publicly available products/offers/pricing pages and available policies. Record all inspected, source-only, skipped and unvisited pages. Never claim full-site coverage when some pages are unvisited.
3. Observe genuine rendered text, offer headings, pricing, actual buying/signup actions and their targets, explanatory content, public trust evidence and nearby purchase conditions.
4. Compare desktop and 390px mobile rendering for purchase actions and prices. A heading such as "Purchase Readiness 64/100" is *not* a purchase button. Validate action labels and destinations, not isolated words.
5. Look for **evidence-backed** issues only: unfinished copy, generic offer language without useful explanation, vague buying controls, confirmed broken purchase destinations, placeholder buying links, large required signup forms, purchase terms difficult to locate near the decision, missing visible price on mobile when desktop shows one, a missing/hidden mobile buying action, or pricing pages without a detectable next step.
6. Score severity from confirmed observations. High is reserved for a strongly observed obstacle (for example an unreachable purchase page). Review-level concerns are presented as possibilities requiring user verification.
7. Deduplicate findings by issue, stage and page. Report every distinct supported buyer issue within the existing bounded report limit. The goal is *maximum relevant detection, not maximum fabricated warnings*.
8. For every finding save: title; stage; priority; source; location; evidence; buyer question; specific suggested change; how to verify; and confidence. Preserve exact quoted page wording when relevant, with cautious explanations.
9. A score is a coarse editorial rating of supported visible signals and not the user's conversion rate. No public evidence => score unavailable, not 100/100. Report the separate number of problems detected. Green means an observed positive, not necessarily a verified successful sale.

## Digital product review

- User files are reviewed locally by the browser. Their bytes are not submitted to the VYLENS server by the product-file audit.
- Check actual delivered assets, detectable missing instructions, blank/duplicate files, placeholder drafts, and broken links. Product delivery flaws are not automatically reasons someone did not purchase.
- Optional sales-page URL provides separate source-only findings. Never imply that initial HTML proves what the rendered checkout shows.
- Do not invent testimonials, earnings outcomes, product positioning or pricing suitability.

## Result UX — five sections only

1. Overall Conversion Score: score ring and adjacent "Problems Found" numeric card. On mobile, these must stay side by side. Keep only genuinely useful status text and a link to observed positive signals.
2. What's Stopping Buyers (or What Needs Fixing for product): short readable issue summaries and severity. Expand for evidence and verification.
3. Why People Hesitate: questions a buyer **might** ask, not imagined quotes attributed to real buyers.
4. Exactly What to Change: a concrete human-readable action; Current/Suggested wording only where the source supports it. Extra details may expand, never repeat the same block in full.
5. Your Priority Action Plan: short ordered steps linking to the exact fix.

Bottom controls, always: Download PDF and New Check. Header download also goes directly to PDF. PDF must be generated on the device with no print popup, contain every issue including collapsed items, and retain the five-section structure.

Use VYLENS white/lime design, red for high severity and yellow for review. Disable blue touch highlight on mobile; keep a visible lime keyboard focus state for accessibility. Never crop evidence mid-word. Short explanations are better than internal scoring formulas and jargon.

## Verification checklist

- Confirm safe, accurate URL normalization and bounded crawl.
- Check real desktop/mobile screenshots and compare against rendered evidence.
- Run the conversion-engine, rendered browser fixture and existing scan tests.
- Run local Playwright results QA at widths 320, 360, 390, 600, 768, 1024, 1280, 1440. No text clipping or horizontal overflow.
- Assert "Purchase Readiness 64/100" is not treated as Buy. Assert actual Buy Now remains a recognized CTA. Test placeholder destination and mobile-only hidden CTA.
- Test the problem count card against *distinct buyer-related findings*, not the number of technical checks.
- Trigger PDF download from both the header and footer; verify a real PDF file signature and EOF, not a print dialog. The exported report includes all findings.
- Test New Check navigation and collapsed/expanded interactions, including keyboard access.
- Spot check real sites manually; never assert a problem that the observation does not support.
- Verify the GitHub commit SHA matches a READY Vercel deployment before claiming the live link was updated. If the build-rate limit blocks a deployment, say so.

## Known limitations

No crawler can reliably judge private checkout, inaccessible logged-in content, payment success, or individual buyers' motivations without access or user data. Some PDF international scripts may be transliterated by the offline, dependency-free PDF exporter; browser HTML still preserves its original text. The system must disclose incomplete coverage.


## Buyer Journey Replay (within "What's Stopping Buyers?")

- Source: lib/buyer-experience.mjs builds the journey from rendered public commerce snapshots, not from a script pretending to be a shopper.
- It displays four observed/unknown steps per viewport: offer heading, visible price, actual CTA label/placement and recorded link destination. Mobile and desktop can be compared with a two-button switch.
- "Link points to X" means an observed anchor target; it does not mean VYLENS visited, completed, or tested checkout. A button with no known destination is unverified. No fictitious visitor sessions or behavioral timelines.
- No rendered page means replay unavailable rather than invented data. A product-file-only report cannot claim pre-purchase visitor navigation.
- QA: run node qa_buyer_experience.mjs and qa_conversion_results.py for viewport controls, keyboard access and PDF content.

## Conversion Fix Kit (within "Exactly What to Change")

- Server engine buildConversionFixKit generates at most one evidence-bound item per identified blocker. The kit can contain directly copyable CTA text grounded in an observed destination, existing supporting copy which can be reviewed for a headline, or an accurate link label to a real observed terms page.
- If the evidence does not support ready-to-paste copy, show a copyable fix checklist instead. No invented testimonials, refunds, product promises, prices or sales outcomes.
- Individual Copy and Copy kit both require a real click. Keep evidence and verification details in the existing issue rows.
- For product-file-only audits, the Result UI supplies source-grounded checklists from actual file findings, not invented purchase behavior.
- Both Journey Replay views and all kit items must be included in direct PDF export. Five report sections remain unchanged.


## Additional evidence-specific quality standards

### Paid CTA vs newsletter controls
- A newsletter email subscription is not proof of a paid subscription. Distinguish newsletter forms from purchase controls using rendered form context.
- Prefer genuine buying actions over unrelated signup buttons when describing a selling path. Contextual labels like Get instant access need a corroborating checkout/signup destination.
- Numerical links like Purchase Readiness 64/100 never count as checkout CTAs.

### Layout, disclosure and content checks
- Compare mobile and desktop actions, prices, and physical DOM bounding boxes. Report measured viewport overflow/obstruction only.
- Overlay detection uses button-center hit testing; it is not proof of a failed real checkout click.
- Distant terms/refund links inside large sections are not buyer-adjacent. Measure physical proximity, not only DOM ancestry.
- Report a mobile/desktop price text difference as Review only when each viewport yields exactly one distinct comparable sample. Do not conflate multiple pricing tiers.
- Bounded text displays ellipses at word or sentence boundaries rather than chopping words without indication.
- Up to 20 distinct supported buying observations can be listed; this bounded report is not exhaustive site coverage.

### Independent local and production gates
- Local quality gate: .github/workflows/local-quality-gate.yml. It tests buyer engine and product/result browser QA independent of production readiness.
- Real browser scenarios: qa_commercial_acceptance.mjs checks clean and vague offers, numeric score links, newsletter vs Buy, mobile-hidden price, mobile buy button overflow, missing CTAs and overlay coverage.
- Production READY GitHub commit equality is still a separate question. Never equate pushed commits or green local tests with a live deployment.
