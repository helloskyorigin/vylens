/**
 * VYLENS Problem Engine v2
 * Evidence-first diagnostics. A successful check is not a discovered issue.
 * No sales-loss guesses, security certification, form submission, or invented severity.
 */
const text=value=>String(value??'').replace(/\s+/g,' ').trim();
const sample=(items,limit=5)=>items.slice(0,limit).map(text).filter(Boolean);
const issue=(category,severity,title,evidence,fix,location,verify)=>({
  category,severity,title,evidence:text(evidence).slice(0,850),
  fix,location,verify
});
const check=(path,name,status,detail)=>({
  name:path+' · '+name,status,detail:text(detail).slice(0,500)
});

export function analyzeDeepSignals(signals,path='/'){
  const issues=[],checks=[];
  if(!signals)return {issues,checks};
  const context=path||'/';
  if(signals.quirksMode===true){
    checks.push(check(context,'Browser layout mode','attention','The document rendered in Quirks Mode.'));
    issues.push(issue('Page structure','note','Document uses browser Quirks Mode',
      'The rendered document reports compatMode=BackCompat, which may produce inconsistent CSS layout.',
      'Add a valid <!doctype html> before the document root, then inspect the page visually.',
      context+' · document doctype','Reload and confirm document.compatMode is CSS1Compat.'));
  }else{
    checks.push(check(context,'Browser layout mode',signals.quirksMode===false?'passed':'unverified',
      signals.quirksMode===false?'Standards Mode detected.':'Browser layout mode was not measured.'));
  }

  const textLength=Number(signals.textSize)||0;
  const visuallyRich=!!signals.hasVisualApp;
  const almostBlank=signals.mainTextMeasured===true&&textLength<55&&!visuallyRich;
  checks.push(check(context,'Readable rendered content',signals.mainTextMeasured!==true?'unverified':almostBlank?'attention':'passed',
    signals.mainTextMeasured===true?
      'Primary content exposes approximately '+textLength+' readable characters.':
      'Visible text length was not measured.'));
  if(almostBlank)issues.push(issue('Content clarity','note','Rendered page has very little readable content',
    'Only '+textLength+' readable characters were observed after the page settled.',
    'Check whether the page relies on content that did not load, and ensure useful information is visible.',
    context+' · primary content','Load the public page in a browser and verify readable text appears.'));

  const placeholders=sample(signals.placeholderLinks||[],5);
  checks.push(check(context,'Placeholder navigation',signals.placeholderLinks===undefined?'unverified':
    placeholders.length?'attention':'passed',
    placeholders.length?'Visible links with href="#" or empty href: '+placeholders.join('; '):
    'No placeholder navigation targets observed.'));
  if(placeholders.length>=2)issues.push(issue('Navigation','note','Several visible links use placeholder destinations',
    placeholders.join('; '),
    'Replace placeholder URLs with real destinations, or confirm intended click handlers work. This observation does not prove a link is broken.',
    context+' · visible links','Click the affected links and confirm they perform the intended action.'));

  const clipped=sample((signals.mobileClipped||[]).map(v=>v.target+' ('+v.width+'px box, '+v.scroll+'px content)'),5);
  checks.push(check(context,'Mobile text clipping',signals.mobileClipped===undefined?'unverified':
    clipped.length?'attention':'passed',
    clipped.length?clipped.join('; '):'No measured important heading/button text clipping.'));
  if(clipped.length)issues.push(issue('Mobile experience','note','Important text may be clipped on mobile',
    clipped.join('; '),
    'Allow text to wrap, increase control width or adjust the responsive typography; verify any intentional truncation.',
    context+' · mobile layout','Review the affected heading or button at the recorded mobile width.'));

  const requiresPolicy=signals.collectsEmail===true;
  const hasPolicy=signals.hasPrivacyLink===true;
  checks.push(check(context,'Privacy link near data collection',signals.collectsEmail===undefined?'unverified':
    !requiresPolicy?'unverified':hasPolicy?'passed':'attention',
    !requiresPolicy?'No email-collection form observed.':
      hasPolicy?'A visible privacy-policy link was found.':
      'A visible email-collection form is present, but no privacy-policy link was detected on the page.'));
  if(requiresPolicy&&!hasPolicy)issues.push(issue('Trust & clarity','note','Email-collection page has no visible privacy-policy link',
    'A visible form includes an email input, but no link to a privacy/policy page was detected in the rendered page.',
    'Add a clearly discoverable link to your actual privacy policy near the form or in site navigation.',
    context+' · email form','Open the form page and confirm visitors can find the privacy policy.'));

  return {issues,checks};
}

/** Only publish broken-media claims after two public GETs returned identical 404/410 statuses. */
export function analyzeVerifiedMedia(observations,path='/'){
  const issues=[],checks=[];
  for(const item of (observations||[]).slice(0,8)){
    const valid=[404,410].includes(item.firstStatus)&&item.secondStatus===item.firstStatus;
    const name=text(item.locator||'Visible image');
    checks.push(check(path,'Visible image URL '+name,valid?'attention':'unverified',
      valid?'Image URL returned HTTP '+item.firstStatus+' twice.':
      'The image could not be confirmed broken by two public GET requests.'));
    if(valid)issues.push(issue('Media','high','Visible website image has a confirmed broken URL',
      name+' → '+text(item.pathname||item.url)+' returned HTTP '+item.firstStatus+' on two safe GET requests.',
      'Restore the image file or update its src URL to a working public image.',
      path+' · '+name,'Open the affected image URL and verify the image loads.'));
  }
  return {issues,checks};
}

/** Failed linked pages can be 404 or persistent server errors, but only with confirmation. */
export function analyzeVerifiedLinks(observations){
  const issues=[],checks=[];
  for(const item of (observations||[]).slice(0,24)){
    const bad=[404,410,500,502,503].includes(item.firstStatus)&&item.secondStatus===item.firstStatus;
    const healthy=item.firstStatus>=200&&item.firstStatus<300;
    const page=text(item.pathname||'/');
    checks.push({name:page+' · Internal destination',status:bad?'attention':healthy?'passed':'unverified',
      detail:bad?'HTTP '+item.firstStatus+' observed on two safe GET requests.':
        healthy?'Internal destination responded HTTP '+item.firstStatus+'.':
        'Link status could not be confirmed; no broken-link claim made.'});
    if(bad)issues.push(issue('Navigation','high',
      [404,410].includes(item.firstStatus)?'Public internal link is broken':'Public internal link has a confirmed server error',
      'Destination '+page+' returned HTTP '+item.firstStatus+' on two public GET requests.',
      'Restore the target page or update links that point to it.',
      'Link → '+page,'Open the destination from the public site and confirm it works.'));
  }
  return {issues,checks};
}
