(() => {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const auditData = {
    website: {
      title: 'Looks great.<br>But is it <span class="swoosh-underline" id="heroEmphasis">converting?</span>',
      description: "See what's stopping visitors from becoming customers. Get a sharper first look at your website.",
      cta: 'Find My Conversion Leaks',
      mobileTitle: 'Example CTA blends in',
      mobileDescription: 'The sample button needs more contrast.',
      mobileSample: '<span class="sample-kicker">northstar.tools</span><strong>Everything your team needs to do more.</strong><span class="sample-button">Get started</span>',
      findings: [
        {title:'CTA blends into the page',description:"The primary action doesn't stand out, making the next step easy to miss.",observation:'The primary action in this fictional example has low contrast compared with the surrounding content, so it may be missed while scanning.',fix:'Use a distinct, high-contrast primary button and a direct action label. Keep the secondary actions visually quieter.',severity:'high'},
        {title:'The offer feels too vague',description:"Visitors can't quickly understand the benefit or who the product is for.",observation:'The example headline says “Everything your team needs to do more” without explaining the specific problem being solved or the intended audience.',fix:'Replace broad language with one specific audience, a concrete outcome and the clearest proof of that outcome.',severity:'medium'},
        {title:'Trust signals are missing',description:'Without credible evidence, buyers have fewer reasons to feel confident.',observation:'The example includes a general “built for ambitious teams” line but no verifiable testimonials, case studies or product evidence.',fix:'Include authentic reviews, demos, use cases or numbers you can substantiate; never invent testimonials or usage claims.',severity:'medium'}
      ]
    },
    product: {
      title: 'Looks good.<br>But not <span class="swoosh-underline" id="heroEmphasis">selling?</span>',
      description: "Your product might be better than its presentation. Discover the gaps in value, clarity and buyer confidence.",
      cta: 'Find My Sales Blockers',
      mobileTitle: 'The buyer outcome is unclear',
      mobileDescription: 'The benefit is too broad to feel convincing.',
      mobileSample: '<span class="sample-kicker">DIGITAL GUIDE · SAMPLE</span><strong>The Creator Reset.</strong><span class="sample-button">A digital field guide</span>',
      findings: [
        {title:'The benefit is unclear',description:"The product promises a broad outcome without showing what the buyer will actually achieve.",observation:'The fictional ebook cover says “Work smarter” but does not identify the particular problem it helps solve or the reader it is for.',fix:'State the specific reader, their problem, and the useful outcome. Keep the language grounded in what the product truly delivers.',severity:'high'},
        {title:'Value is hard to see',description:'The buyer cannot quickly tell what is included or why it is useful.',observation:'The fictional product presents a broad title without showing a table of contents, example pages, deliverables or practical exercises.',fix:'Show a clear contents preview, representative pages, and concrete deliverables so buyers know exactly what they are paying for.',severity:'medium'},
        {title:'The offer lacks proof',description:'The sales presentation gives buyers few reasons to believe the claims.',observation:'The hypothetical offer does not show an authentic example, credible proof or a realistic explanation of how it helps.',fix:'Include a useful real preview, transparent limitations and only evidence you can verify. If you have no reviews yet, show the actual product.',severity:'medium'}
      ]
    }
  };

  let mode = 'website';
  let selectedFile = null;
  const reportDialog = $('#reportDialog');
  const noticeDialog = $('#noticeDialog');

  function updateMode(nextMode, options = {}) {
    if (!auditData[nextMode]) return;
    mode = nextMode;
    const d = auditData[mode];
    $('#hero-title').innerHTML = d.title;
    $('#heroDescription').textContent = d.description;
    $('#ctaLabel').textContent = d.cta;
    $('#websiteFields').hidden = mode !== 'website';
    $('#productFields').hidden = mode !== 'product';
    $('#websiteInspection').hidden = mode !== 'website';
    $('#productInspection').hidden = mode !== 'product';
    $('#websiteTab').classList.toggle('is-active', mode === 'website');
    $('#productTab').classList.toggle('is-active', mode === 'product');
    $('#websiteTab').setAttribute('aria-pressed', String(mode === 'website'));
    $('#productTab').setAttribute('aria-pressed', String(mode === 'product'));
    $('#inspectionSwitchText').textContent = mode === 'website'
      ? 'Have a digital product? Inspect that instead.'
      : 'Have a website? Check its blind spots instead.';
    $('#inspectionSwitch').querySelector('use').setAttribute('href', mode === 'website' ? '#i-stack' : '#i-monitor');
    $('#mobileSampleType').textContent = mode === 'website' ? 'WEBSITE PREVIEW' : 'PRODUCT PREVIEW';
    $('#mobileSampleText').innerHTML = d.mobileSample;
    $('#mobileIssueTitle').textContent = d.mobileTitle;
    $('#mobileIssueText').textContent = d.mobileDescription;
    $('#mobileDockLabel').textContent = mode === 'website' ? 'Inspect my website' : 'Inspect my product';
    $('#websiteError').hidden = true;
    $('#productError').hidden = true;

    $$('#findingGrid .finding-card').forEach((card, idx) => {
      card.querySelector('.finding-title').textContent = d.findings[idx].title;
      card.querySelector('.finding-desc').textContent = d.findings[idx].description;
      const severity = card.querySelector('.severity');
      severity.className = 'severity ' + d.findings[idx].severity;
      severity.innerHTML = '<svg class="icon"><use href="#i-alert"></use></svg> ' + (d.findings[idx].severity === 'high' ? 'High priority' : 'Medium priority');
    });
    if (options.scroll) {
      $('#audit-tool').scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'center'});
    }
    if (options.focus) {
      setTimeout(() => mode === 'website' ? $('#websiteUrl').focus({preventScroll:true}) : $('#uploadZone').focus({preventScroll:true}), 300);
    }
  }

  function openReport(index = 0) {
    const safe = Number.isInteger(index) && index >= 0 && index <= 2 ? index : 0;
    $('#reportAuditType').textContent = mode === 'website' ? 'WEBSITE AUDIT / SAMPLE 01' : 'DIGITAL PRODUCT / SAMPLE 01';
    $$('.issue-pick').forEach((button, i) => {
      button.querySelector('strong').textContent = auditData[mode].findings[i].title;
    });
    setReportIssue(safe);
    if (noticeDialog.open) noticeDialog.close();
    if (!reportDialog.open) reportDialog.showModal();
    syncDock();
  }
  function setReportIssue(index) {
    const d = auditData[mode].findings[index];
    $('#reportIssueNumber').textContent = `FINDING / 0${index + 1}`;
    $('#reportIssueTitle').textContent = d.title;
    $('#reportObservation').textContent = d.observation;
    $('#reportFix').textContent = d.fix;
    const severity = $('#reportSeverity');
    severity.textContent = d.severity === 'high' ? 'High priority' : 'Medium priority';
    severity.className = 'severity ' + d.severity;
    $$('.issue-pick').forEach((button, i) => {button.classList.toggle('active', i === index);button.setAttribute('aria-pressed', String(i === index));});
  }
  function openNotice() {
    const website = mode === 'website';
    const rawUrl = $('#websiteUrl').value.trim();
    const price = $('#productPrice').value.trim();
    const salesPage = $('#salesPageUrl').value.trim();
    $('#noticeTitle').textContent = website ? 'Request your website audit.' : 'Request your product audit.';
    $('#noticeText').textContent = website
      ? 'Automated auditing is being connected. You can send an email asking VYLENS to review your website; no scan has been run and your URL stays in the browser unless you choose to email it.'
      : 'Automated file auditing is being connected. Your selected file has not been uploaded. To request a review, open an email and attach the file yourself if you choose.';
    const details = website
      ? `Website URL: ${rawUrl}\nWhat I want feedback on: `
      : `Product type: ${selectedFile?.name || 'Digital product'}\n${price ? `Product price: ${price}\n` : ''}${salesPage ? `Sales page: ${salesPage}\n` : ''}I'll attach the product file myself if needed.\nWhat I want feedback on: `;
    const subject = `VYLENS ${website ? 'Website' : 'Digital Product'} Audit Request`;
    const emailBody = `Hi VYLENS,\n\nI'd like to request an audit.\n\n${details}\n\nThanks!`;
    $('#emailAuditRequest').href = `mailto:hello.skyorigin@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    noticeDialog.showModal();
    syncDock();
  }

  // Audit mode selection
  $$('.audit-switch-option').forEach(button => button.addEventListener('click', () => updateMode(button.dataset.mode)));
  $('#inspectionSwitch').addEventListener('click', () => updateMode(mode === 'website' ? 'product' : 'website', {scroll:true,focus:true}));
  $$('[data-select-mode]').forEach(button => button.addEventListener('click', () => updateMode(button.dataset.selectMode, {scroll:true,focus:true})));
  $$('[data-price-mode]').forEach(button => button.addEventListener('click', () => updateMode(button.dataset.priceMode, {scroll:true,focus:true})));

  // Optional context for uploaded product
  $('#optionalToggle').addEventListener('click', () => {
    const willOpen = $('#optionalFields').hidden;
    $('#optionalFields').hidden = !willOpen;
    $('#optionalToggle').setAttribute('aria-expanded', String(willOpen));
    $('#optionalToggle').firstChild.textContent = willOpen ? '− Hide sales page and price ' : '+ Add sales page and price ';
  });
  const uploadZone = $('#uploadZone');
  const fileInput = $('#productFile');
  function selectFile(file) {
    if (!file) return;
    const supported = /\.(pdf|png|jpe?g|webp|txt|md|zip)$/i.test(file.name);
    const tooBig = file.size > 15 * 1024 * 1024;
    const empty = file.size === 0;
    if (!supported || tooBig || empty) {
      $('#productError').textContent = !supported ? 'Choose a PDF, image, TXT, MD or ZIP file.' : tooBig ? 'File size must be 15 MB or less.' : 'This file is empty. Choose a file with content.';
      $('#productError').hidden = false;
      selectedFile = null;
      $('#uploadTitle').textContent = 'Drop your product here, or browse';
      $('#fileHint').textContent = 'PDF, images, TXT, MD or ZIP · up to 15 MB';
      uploadZone.setAttribute('aria-invalid', 'true');
      return;
    }
    selectedFile = file;
    $('#productError').hidden = true;
    uploadZone.removeAttribute('aria-invalid');
    $('#uploadTitle').textContent = file.name;
    $('#fileHint').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · selected locally (not uploaded)`;
  }
  uploadZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => selectFile(fileInput.files?.[0]));
  ['dragenter','dragover'].forEach(type => uploadZone.addEventListener(type, event => {event.preventDefault(); uploadZone.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(type => uploadZone.addEventListener(type, event => {event.preventDefault(); uploadZone.classList.remove('drag-over');}));
  uploadZone.addEventListener('drop', event => selectFile(event.dataTransfer?.files?.[0]));

  // Move to the actual inspection workspace, not an illustrative sample report.
  // Files are temporarily kept in browser storage solely to cross the page boundary,
  // then removed by the inspection page. File bytes are never uploaded here.
  async function stageLocalFile(file) {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Your browser does not support temporary local file transfer.')); return; }
      const request = indexedDB.open('vylens-transient', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('transfer')) request.result.createObjectStore('transfer'); };
      request.onerror = () => reject(new Error('Could not save the selected file on this device.'));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('transfer', 'readwrite');
        tx.objectStore('transfer').put({file, addedAt:Date.now()}, 'product');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('File handoff failed. Try selecting a smaller file.')); };
      };
    });
  }
  let transitioning = false;
  async function beginInspection() {
    if (transitioning) return;
    transitioning = true;
    const action = $('#submitAudit');
    const previous = $('#ctaLabel').textContent;
    action.disabled = true;
    $('#ctaLabel').textContent = 'Opening inspection…';
    try {
      const pending = mode === 'website'
        ? {mode: 'website', url: $('#websiteUrl').value.trim()}
        : {mode: 'product', price: $('#productPrice').value.trim(), salesPage: $('#salesPageUrl').value.trim()};
      if (mode === 'product') await stageLocalFile(selectedFile);
      sessionStorage.removeItem('vylens:result');
      sessionStorage.setItem('vylens:pending', JSON.stringify(pending));
      window.location.assign('./inspect.html');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open the inspection.';
      const errorEl = mode === 'website' ? $('#websiteError') : $('#productError');
      errorEl.textContent = message;errorEl.hidden = false;
      transitioning = false;action.disabled = false;$('#ctaLabel').textContent = previous;
    }
  }

  $('#audit-tool').addEventListener('submit', event => {
    event.preventDefault();
    if (mode === 'website') {
      const input = $('#websiteUrl');
      const raw = input.value.trim();
      let valid = false;
      if (raw) {
        try {
          const normalized = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
          const url = new URL(normalized);
          valid = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
            !/\s/.test(raw) && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(url.hostname) &&
            !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local');
          if (valid) input.value = normalized;
        } catch { valid = false; }
      }
      if (!valid) {
        $('#websiteError').textContent = raw ? 'Enter a public website URL, like https://example.com.' : 'Please enter a website URL first.';
        $('#websiteError').hidden = false;
        input.setAttribute('aria-invalid','true');
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      $('#websiteError').hidden = true;
    } else if (!selectedFile) {
      uploadZone.setAttribute('aria-invalid','true');
      $('#productError').textContent = 'Choose a supported product file to continue.';
      $('#productError').hidden = false;
      uploadZone.focus();
      return;
    }
    beginInspection();
  });
  $('#websiteUrl').addEventListener('input', () => {$('#websiteError').hidden = true;$('#websiteUrl').removeAttribute('aria-invalid');});

  // Sample report interactions
  $$('.mini-finding, .finding-card').forEach(button => button.addEventListener('click', () => openReport(Number(button.dataset.issueIndex))));
  $('#mobilePreviewIssue').addEventListener('click', () => openReport(0));
  $('#openSample').addEventListener('click', () => openReport(0));
  $$('.issue-pick').forEach(button => button.addEventListener('click', () => setReportIssue(Number(button.dataset.pickIssue))));
  $$('.close-dialog').forEach(button => button.addEventListener('click', () => reportDialog.close()));
  $$('.close-notice').forEach(button => button.addEventListener('click', () => noticeDialog.close()));
  [reportDialog, noticeDialog].forEach(dialog => {
    dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});
  });

  // Accessible responsive navigation
  const menuButton = $('#menuButton');
  const menu = $('#mobileMenu');
  function setMenu(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuButton.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    if (typeof syncDock === 'function') syncDock();
  }
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  $$('#mobileMenu a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {if (event.key === 'Escape' && !menu.hidden) setMenu(false);});
  document.addEventListener('click', event => {if (!menu.hidden && !event.target.closest('.nav-wrap')) setMenu(false);});
  window.matchMedia('(min-width:801px)').addEventListener('change', event => {if (event.matches) setMenu(false);});

  // Show the mobile action only after the *entire* illustrated preview has left view.
  // Hide it again around the closing CTA, for modal dialogs and when navigation opens.
  const dock = $('#mobileDock');
  let passedPreview = false;
  let closingVisible = false;
  function syncDock() {
    const visible = window.matchMedia('(max-width:620px)').matches && passedPreview &&
      !closingVisible && menu.hidden && !reportDialog.open && !noticeDialog.open;
    dock.classList.toggle('is-visible', visible);
    dock.setAttribute('aria-hidden', String(!visible));
    dock.toggleAttribute('inert', !visible);
  }
  const watch = new IntersectionObserver(entries => {
    const entry = entries[0];
    passedPreview = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    syncDock();
  }, {rootMargin:'0px 0px -8% 0px'});
  watch.observe($('.mobile-inspection'));
  const closeWatch = new IntersectionObserver(entries => {
    closingVisible = entries[0].isIntersecting;
    syncDock();
  }, {threshold:0.05});
  closeWatch.observe($('.closing-section'));
  window.addEventListener('resize', syncDock, {passive:true});
  [reportDialog, noticeDialog].forEach(dialog => dialog.addEventListener('close', syncDock));
  $('#mobileDockButton').addEventListener('click', () => {
    $('#audit-tool').scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth',block:'center'});
  });

  // One-time entrance animation only. Never re-play animations when scrolling up or down.
  // Native, visible content is the fallback for users without JS/IntersectionObserver.
  function initScrollReveal() {
    if (reduceMotion.matches || !('IntersectionObserver' in window)) return;
    const targets = $$('.section-head, .step, .check-card, .finding-card, .price-card, .faq-heading, .faq-list details, .closing-card, .footer');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('reveal-once');
        observer.unobserve(entry.target);
      });
    }, {threshold:0.06, rootMargin:'0px 0px -25px 0px'});
    // Set pending after native layout so crawlers / no-JS see all content.
    targets.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || (rect.top < window.innerHeight && rect.bottom > 0)) return;
      el.classList.add('reveal-pending');
      if (el.matches('.step, .check-card, .finding-card, .price-card')) {
        const siblings = Array.from(el.parentElement.children).filter(x => x.matches(el.tagName.toLowerCase()+'.'+el.classList[0]));
        const ordinal = Math.max(0, siblings.indexOf(el));
        el.style.setProperty('--reveal-delay', `${Math.min(ordinal,2)*65}ms`);
      }
      observer.observe(el);
    });
  }
  initScrollReveal();

  $('#year').textContent = String(new Date().getFullYear());
  updateMode('website');
})();
