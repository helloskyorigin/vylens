/**
 * Central action classifier shared by the conversion engine and buyer journey.
 * Interpret an observed control using its label and a recorded destination.
 * Never classify headings like "Purchase Readiness 64/100" as purchase buttons.
 */
const text=value=>String(value??'').replace(/\s+/g,' ').trim().slice(0,105);
const direct=/^(?:buy(?:\s+(?:now|this|the|my|your|access|for)\b.{0,60})?|purchase(?:\s+(?:now|this|the|my|your|access|for)\b.{0,60})?|checkout|check out|pay now|order now|add to cart|sign ?up(?:\s+now)?|subscribe(?:\s+now)?|start free|start (?:my|your|a )?trial|book (?:a )?demo|request (?:a )?demo|join now|download now|get started(?:\s+(?:now|free))?|enroll(?:\s+now)?|register(?:\s+now)?)\s*[.!?›→]*$/i;
const purchase=/^(?:buy(?:\s+(?:now|this|the|my|your|access|for)\b.{0,60})?|purchase(?:\s+(?:now|this|the|my|your|access|for)\b.{0,60})?|checkout|check out|pay now|order now|add to cart|subscribe(?:\s+now)?)\s*[.!?›→]*$/i;
const contextAction=/^(?:get|start|try|choose|select|unlock|claim|access|see|view|continue to|order)\s+(?:my|your|the|this|our|a|an|instant|full|free|premium|pro|pricing|prices|plans?|access|audit|report|kit|ebook|course|subscription|checkout|payment|offer|account|trial)\b.{0,60}$/i;
const commercialPath=/^\/?(?:.*\/)?(?:pricing|prices|plans?|checkout|cart|purchase|buy|pay|order|signup|sign-up|register|subscription|subscribe|trial|demo)(?:\/|$)/i;
const buyingPath=/^\/?(?:.*\/)?(?:checkout|cart|purchase|buy|pay|order|subscription|subscribe)(?:\/|$)/i;
const labelIsScore=s=>/\b(?:score|readiness|rating)\b/i.test(s)&&/\d+\s*(?:\/\s*\d+|%)/.test(s);
export function classifyAction(a){
  if(!a||typeof a!=='object')return {direct:false,purchase:false,reason:'none'};
  const label=text(a.label);
  const path=text(a.path);
  if(!label||labelIsScore(label)||/\d+\s*\/\s*100\b/.test(label))
    return {direct:false,purchase:false,reason:'informational'};
  const exact=direct.test(label),certainPurchase=purchase.test(label);
  const contextual=contextAction.test(label);
  // Only contextual CTAs require the destination to corroborate intent;
  // strict action labels stand on their own even if JS owns the click handler.
  const destination=path&&commercialPath.test(path);
  const purchaseDestination=path&&buyingPath.test(path);
  const contextualDirect=contextual&&Boolean(destination);
  const contextualPurchase=contextual&&Boolean(purchaseDestination);
  return {
    direct:exact||contextualDirect,
    purchase:certainPurchase||contextualPurchase,
    reason:exact?'clear-action':contextualDirect?'label-and-destination':'unverified'
  };
}
export const isDirectAction=a=>classifyAction(a).direct;
export const isPurchaseAction=a=>classifyAction(a).purchase;
