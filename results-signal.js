/* VYLENS / Signal results — short free preview with a clear full-report offer.
 * This is a presentation layer, not a payment entitlement system.
 * Never invent scores or claim to know why real visitors left. */
(() => {
  'use strict';
  const main = document.getElementById('main');
  if (!main || main.hidden || document.getElementById('signalReport')) return;
  let report;
  try { report = JSON.parse(sessionStorage.getItem('vylens:result') || 'null'); }
  catch { return; }
  const data = report && report.conversion;
  if (!data || data.version !== 1 || !Array.isArray(data.blockers) ||
      !['website','product'].includes(report.mode)) return;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const add = (parent, ...nodes) => {
    nodes.filter(Boolean).forEach(node => parent.append(node));
    return parent;
  };
  const tidy = (text, max = 220) => String(text ?? '').replace(/\s+/g,' ').trim().slice(0,max);
  const riskRank = issue => issue.priority === 'high' ? 0 : issue.priority === 'low' ? 2 : 1;
  const issues = data.blockers.filter(x => x && typeof x === 'object' && tidy(x.title))
    .slice(0, 120).sort((a,b) => riskRank(a) - riskRank(b));
  const uniqueIssues = [];
  const used = new Set();
  for (const issue of issues) {
    const id = tidy(issue.findingId || issue.id || issue.fingerprint ||
      [issue.stage,issue.title].join('|'),320).toLowerCase();
    if (used.has(id)) continue;
    used.add(id);
    uniqueIssues.push(issue);
  }
  const strengths = Array.isArray(data.strengths) ?
    data.strengths.filter(x => x && typeof x === 'object' && tidy(x.title)) : [];

  const stage = item => {
    const title = tidy([item.title,item.heading].join(' '),270).toLowerCase();
    if (/refund|return policy|cancel|purchase terms|billing|delivery|fulfil|fulfill|what happens after|privacy|payment terms|download access|buying conditions/i.test(title))
      return 'purchase';
    if (['clarity','value','trust','action'].includes(item.stage)) return item.stage;
    if (/price|value|benefit|offer worth|cost|expensive/.test(title)) return 'value';
    if (/trust|proof|review|testimonial|credib|guarantee|policy/.test(title)) return 'trust';
    if (/button|checkout|purchase link|buying action|next step|sign.?up|action label|tap/.test(title)) return 'action';
    if (/headlin|descrip|messag|unclear|audience/.test(title)) return 'clarity';
    return null;
  };
  const rendered = report.mode === 'website' && Number(data.renderedPages) > 0;
  // Preserve the conservative existing four-stage assessment; 20/55/85 are
  // editorial indicators from the same report, not recorded conversion rates.
  const originalStages = ['clarity','value','trust','action'].map(key => {
    const found = issues.filter(item => item.stage === key);
    const good = strengths.some(item => item.stage === key);
    if (!rendered || (!found.length && !good)) return null;
    return found.some(item => item.priority === 'high') ? 20 : found.length ? 55 : 85;
  });
  const overall = originalStages.every(v => v !== null) ?
    Math.round(originalStages.reduce((sum,n) => sum+n,0) / 4 / 5) * 5 : null;

  const modes = {
    clarity: {title:'Offer Clarity',
      warning:'New buyers may not quickly understand what this offer does for them.',
      good:'The page gives buyers a clearer idea of what is being offered.'},
    value: {title:'Value for Money',
      warning:'The benefits may not be clear enough to justify the asking price.',
      good:'Helpful details about the offer or its price were visible.'},
    trust: {title:'Buyer Trust',
      warning:'Buyers may need more proof or reassurance before they feel confident.',
      good:'Some helpful proof or trust information was visible.'},
    action: {title:'Buying Process',
      warning:'The next step to buy or sign up may be harder to find or use.',
      good:'The main next step looks easier to spot on the pages checked.'},
    purchase: {title:'Purchase Confidence',
      warning:'Buyers may have questions about terms, access or what happens after paying.',
      good:'Some purchase details were available to review.'}
  };
  const freeNotes = [];
  const root = el('section','signal-report');
  root.id = 'signalReport';
  root.setAttribute('aria-label','Your VYLENS results');

  const strap = el('div','signal-topline');
  add(strap,el('span','signal-eyebrow','YOUR FREE PREVIEW'),
    el('span','signal-top-mark',report.mode === 'website' ? 'Website Audit' : 'Digital Product Audit'));
  root.append(strap);
  const heading = el('h1','signal-title',"Your buyers' first impression.");
  root.append(heading);
  const subject = tidy(report.subject || report.url || 'Your offer',110);
  root.append(el('p','signal-subject',subject));

  const scoreBox = el('section','signal-score');
  const scoreTitle = el('div','signal-score-heading');
  add(scoreTitle,el('span','','OVERALL CONVERSION SCORE'),
    el('span','signal-score-type','Offer assessment'));
  scoreBox.append(scoreTitle);
  const scoreBody = el('div','signal-score-body');
  const scoreFigure = el('div','signal-score-number');
  add(scoreFigure,el('strong','',overall === null ? '—' : String(overall)),
    el('span','','/100'));
  const scoreText = el('div','signal-score-copy');
  const verdict = overall === null ? 'Not enough to score' :
    overall < 50 ? 'Your offer needs attention' :
    overall < 75 ? 'Some buying doubts need a closer look' : 'Promising signals found';
  add(scoreText,el('strong','',verdict),
    el('p','',overall === null ?
      (report.mode === 'product' ?
        'We checked your file, but a public sales page is needed to assess buying decisions.' :
        'We could not check enough of the offer to give a fair score.') :
      'A quick review of what buyers can see, not a measure of actual sales.'));
  add(scoreBody,scoreFigure,scoreText);
  scoreBox.append(scoreBody);
  root.append(scoreBox);

  const signals = el('section','signal-signals');
  add(signals,el('h2','','Your Buyer Signals'),
    el('p','signal-section-note','The strongest and weakest parts of your buying experience.'));
  const items = el('div','signal-items');
  const keys = ['clarity','value','trust','action','purchase'];
  for (const key of keys) {
    const matches = uniqueIssues.filter(x => stage(x) === key);
    const positive = strengths.some(x => stage(x) === key);
    const value = !rendered || (!matches.length && !positive) ? null :
      matches.some(x => x.priority === 'high') ? 20 : matches.length ? 55 : 85;
    const label = value === null ? 'Not checked' :
      value < 50 ? 'Weak' : value < 75 ? 'Needs work' : 'Looking good';
    const tone = value === null ? 'unknown' :
      value < 50 ? 'weak' : value < 75 ? 'review' : 'good';
    const description = value === null ?
      'We could not check this part properly, so no judgment was made.' :
      matches.length ? modes[key].warning : modes[key].good;
    const item = el('article','signal-item signal-'+tone);
    const top = el('div','signal-item-top');
    add(top,el('h3','',modes[key].title),
      add(el('div','signal-item-right'),
        el('span','signal-item-value',value === null ? '—' : String(value)),
        el('span','signal-status',label)));
    const bar = el('div','signal-bar');
    bar.setAttribute('role','img');
    bar.setAttribute('aria-label',modes[key].title + ': ' +
      (value === null ? 'Not checked' : 'Assessment '+value+' out of 100, '+label));
    const fill = el('span','signal-bar-fill');
    fill.style.width = (value === null ? 0 : value) + '%';
    bar.append(fill);
    add(item,top,bar,el('p','signal-item-note',description));
    items.append(item);
    freeNotes.push({key,value,label,matches:matches.length});
  }
  signals.append(items);
  root.append(signals);

  const reminder = el('p','signal-disclaimer',
    'These are possible buying concerns from what we could check, not recorded customer behavior.');
  root.append(reminder);

  const paid = el('section','signal-unlock');
  paid.id = 'fullReport';
  paid.setAttribute('aria-label','Unlock full VYLENS report');
  const paidHead = el('div','signal-paid-heading');
  add(paidHead,el('span','signal-premium-label','THE FULL REPORT'),
    el('span','signal-one-time','ONE-TIME PURCHASE'));
  paid.append(paidHead);
  paid.append(el('h2','',"See what's holding buyers back. Know exactly what to fix."));
  paid.append(el('p','signal-paid-intro',
    'The free preview shows the signals. Your full report goes into the real problems behind them, with changes you can make.'));
  const perks = [
    ['Every Buying Blocker','See all the problems found in your offer, with the page details behind each one.'],
    ['Why Buyers May Hesitate','Understand the questions your price, value or trust may leave unanswered.'],
    ['Exactly What to Change','Get clear changes for your headline, offer, buttons and buying experience.'],
    ['Ready-to-Use Better Copy','Get suggested wording you can adapt instead of starting from scratch.'],
    ['Your Priority Action Plan','Know what to fix first, what comes next and how to check each change.']
  ];
  const list = el('ol','signal-perks');
  for (let i=0;i<perks.length;i++) {
    const li = el('li','signal-perk');
    add(li,el('span','signal-perk-num',String(i+1).padStart(2,'0')),
      add(el('div','signal-perk-copy'),
        el('strong','',perks[i][0]),
        el('p','',perks[i][1])));
    list.append(li);
  }
  paid.append(list);
  const price = report.mode === 'website' ? '$19' : '$9';
  const checkoutMeta = document.querySelector('meta[name="vylens-checkout-'+report.mode+'"]');
  let checkout = '';
  try {
    const parsed = new URL(checkoutMeta?.content || '');
    if (parsed.protocol === 'https:') checkout = parsed.href;
  } catch { /* No authorized checkout is configured. */ }
  const cta = el('a','signal-unlock-cta',
    checkout ? 'Unlock My Full Report — '+price : 'Full Report — '+price);
  cta.href = checkout || '#fullReport';
  if (!checkout) {
    cta.setAttribute('aria-describedby','signalCheckoutState');
  } else {
    cta.rel = 'noopener noreferrer';
  }
  const status = el('p','signal-checkout-state',checkout ?
    'One-time purchase. No subscription.' :
    'Payment setup is in progress. The full report is not available for purchase yet.');
  status.id = 'signalCheckoutState';
  status.setAttribute('aria-live','polite');
  if (!checkout) cta.addEventListener('click',event => {
    event.preventDefault();
    status.textContent = 'Checkout is not connected yet. Nothing has been charged.';
    status.focus?.();
  });
  paid.append(cta,status);
  root.append(paid);

  const bottom = el('div','signal-bottom-actions');
  const again = el('a','','Scan another website or product');
  again.href = './index.html#audit-tool';
  bottom.append(again);
  root.append(bottom);
  main.prepend(root);
  document.body.classList.add('signal-ui');
  // Keep existing detailed content intact for future authorized report delivery.
  // The free screen does not offer its export or complete finding list.
})();