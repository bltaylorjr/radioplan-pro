// Every dropdown starts with "— Choose one —" (Bobby's request). Done once for the whole app:
// a disabled first option is added to each <select> as it appears. React keeps managing its own
// options; the extra first option never becomes a value. Opt out with data-no-choose.
const LABEL = '— Choose one —';
function mark(sel: HTMLSelectElement) {
  if (sel.multiple || sel.hasAttribute('data-no-choose')) return;
  const first = sel.options[0];
  if (first?.dataset.choose) return;
  // An existing "pick ..." placeholder becomes the Choose one entry.
  if (first && first.value === '' && /^(—\s*)?(pick|choose|select)\b/i.test(first.text.trim())) { first.text = LABEL; first.dataset.choose = '1'; return; }
  const o = document.createElement('option'); o.value = '__choose__'; o.disabled = true; o.textContent = LABEL; o.dataset.choose = '1';
  const keep = sel.selectedIndex; sel.insertBefore(o, sel.firstChild);
  if (keep >= 0) sel.selectedIndex = keep + 1; // keep the chosen value showing
}
export function installChooseOne(root: ParentNode = document) {
  const scan = (n: ParentNode) => n.querySelectorAll?.('select').forEach((s) => mark(s as HTMLSelectElement));
  scan(root);
  new MutationObserver((ms) => { for (const m of ms) {
    if (m.target instanceof HTMLSelectElement) mark(m.target);
    m.addedNodes.forEach((a) => { if (a instanceof HTMLSelectElement) mark(a); else if (a instanceof Element) scan(a); });
  } }).observe(document.body, { childList: true, subtree: true });
}
