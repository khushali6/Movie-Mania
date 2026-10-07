/* Injected into pages the user allowed. No imports: this file is bundled as a classic IIFE.
 * It reads the DOM into the same "text with element refs" format the model sees in demo mode, and performs actions. */
interface El { ref: string; role: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'heading' | 'text'; label: string; text?: string; href?: string; value?: string; type?: string; name?: string; placeholder?: string; options?: string[]; disabled?: boolean; formId?: string; covered?: boolean }
interface Snap { url: string; title: string; text: string; elements: El[]; hasForm: boolean; scrollY: number; scrollHeight: number; loading: boolean }
interface Res { ok: boolean; error?: string; note?: string }

(() => {
  const w = window as unknown as { __ffBridge?: unknown };
  if (w.__ffBridge) return;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'HEAD', 'META', 'LINK', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT']);
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'UL', 'OL', 'LI', 'TR', 'TABLE', 'FORM', 'FIELDSET', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'HR', 'BR']);
  const MAX_ELEMENTS = 400; const MAX_CHARS = 140_000;
  const q = (ref: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-ff-ref="${CSS.escape(ref)}"]`);
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el: Element): boolean => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse' || parseFloat(st.opacity) === 0) return false;
    if (el.getAttribute('aria-hidden') === 'true' && !isInteractive(el)) return false;
    const r = (el as HTMLElement).getBoundingClientRect?.();
    return !r || r.width > 0 || r.height > 0 || (el as HTMLElement).offsetParent !== null || st.position === 'fixed';
  };
  const roleOf = (el: Element): El['role'] | null => {
    const tag = el.tagName; const role = el.getAttribute('role');
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (tag === 'BUTTON' || role === 'button' || role === 'menuitem' || role === 'tab' || tag === 'SUMMARY') return 'button';
    if (tag === 'INPUT') { const t = (el as HTMLInputElement).type; if (t === 'hidden') return null; if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button'; if (t === 'checkbox' || t === 'radio') return 'checkbox'; return 'input'; }
    if (tag === 'TEXTAREA') return 'input'; if (tag === 'SELECT') return 'select';
    if ((el as HTMLElement).isContentEditable && el.getAttribute('contenteditable') !== 'inherit') return 'input';
    if (role === 'link') return 'link'; if (role === 'checkbox' || role === 'switch' || role === 'radio') return 'checkbox';
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return 'input';
    if ((el as HTMLElement).onclick || el.hasAttribute('onclick')) return 'button';
    return null;
  };
  const isInteractive = (el: Element): boolean => roleOf(el) !== null;
  const labelOf = (el: Element): string => {
    const h = el as HTMLInputElement;
    const aria = el.getAttribute('aria-label'); if (aria) return clean(aria);
    const lb = el.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' '); if (clean(t)) return clean(t); }
    if (h.labels && h.labels.length) return clean(h.labels[0]!.textContent);
    if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(h.type)) return clean(h.value) || h.type;
    const text = clean(el.textContent); if (text) return text.length > 90 ? `${text.slice(0, 88)}…` : text;
    return clean(el.getAttribute('title') || h.placeholder || (el.querySelector('img') as HTMLImageElement | null)?.alt || el.getAttribute('name') || el.tagName.toLowerCase());
  };

  function snapshot(): Snap {
    document.querySelectorAll('[data-ff-ref]').forEach((n) => n.removeAttribute('data-ff-ref'));
    const elements: El[] = []; const lines: string[] = []; let cur = ''; let chars = 0; let n = 0; let hn = 0;
    const flush = () => { const t = clean(cur); if (t) { lines.push(t); chars += t.length; } cur = ''; };
    const modal = document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [aria-modal="true"]');
    const walk = (node: Node, depth: number): void => {
      if (chars > MAX_CHARS || depth > 60) return;
      if (node.nodeType === Node.TEXT_NODE) { cur += ` ${node.textContent ?? ''}`; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      if (SKIP.has(el.tagName.toUpperCase()) || el.id === 'ff-overlay-host') return;
      if (!visible(el)) return;
      const role = roleOf(el);
      if (role && n < MAX_ELEMENTS) {
        flush();
        const ref = `e${++n}`; el.setAttribute('data-ff-ref', ref);
        const h = el as HTMLInputElement; const label = labelOf(el);
        const e: El = { ref, role, label, disabled: h.disabled || el.getAttribute('aria-disabled') === 'true' || undefined };
        if (role === 'link') { e.href = (el as HTMLAnchorElement).href; const rest = clean(el.textContent); if (rest.length > label.length + 4) e.text = rest.slice(label.length, label.length + 220); }
        if (role === 'input' || role === 'checkbox') { e.type = h.type || 'text'; e.name = h.name || undefined; e.placeholder = h.placeholder || undefined; e.value = h.type === 'password' ? (h.value ? '••••' : '') : role === 'checkbox' ? String(h.checked ?? el.getAttribute('aria-checked')) : clean(h.value ?? el.textContent).slice(0, 80); }
        if (role === 'select') { const s = el as HTMLSelectElement; e.options = [...s.options].slice(0, 30).map((o) => clean(o.text)); e.value = clean(s.selectedOptions[0]?.text); e.name = s.name || undefined; }
        if (h.form) e.formId = h.form.id || h.form.getAttribute('name') || 'form';
        const r = el.getBoundingClientRect();
        if (modal && !modal.contains(el)) e.covered = true;
        else if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
          const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
          if (top && top !== el && !el.contains(top) && !top.contains(el)) e.covered = true;
        }
        elements.push(e);
        const extra = [e.type && e.type !== 'text' ? e.type : '', e.value && role !== 'checkbox' ? `value="${e.value}"` : '', role === 'checkbox' ? (e.value === 'true' ? 'checked' : 'unchecked') : '', e.placeholder ? `placeholder="${e.placeholder}"` : '', e.disabled ? 'disabled' : '', e.covered ? 'covered' : ''].filter(Boolean).join(' ');
        cur += ` [${ref} ${role} "${label.replace(/"/g, "'")}"${extra ? ` ${extra}` : ''}]${role === 'link' && e.text ? ` ${e.text}` : ''}${role === 'select' && e.options ? ` options: ${e.options.join(' | ')}` : ''}`;
        flush(); return;
      }
      const tag = el.tagName.toUpperCase(); const block = BLOCK.has(tag);
      if (block) flush();
      if (/^H[1-6]$/.test(tag)) { flush(); cur = `${'#'.repeat(Number(tag[1]))} `; elements.push({ ref: `h${++hn}`, role: 'heading', label: clean(el.textContent).slice(0, 100) }); }
      else if (tag === 'LI') cur = '- ';
      else if (tag === 'IMG') { const alt = clean((el as HTMLImageElement).alt); if (alt) cur += ` (image: ${alt})`; return; }
      const root = el.shadowRoot; if (root) root.childNodes.forEach((c) => walk(c, depth + 1));
      for (const c of el.childNodes) walk(c, depth + 1);
      if (tag === 'TD' || tag === 'TH') cur += ' |';
      if (block) flush();
    };
    walk(document.body ?? document.documentElement, 0); flush();
    const hasForm = elements.some((e) => e.role === 'input' || e.role === 'select' || e.role === 'checkbox');
    return { url: location.href, title: document.title, text: lines.join('\n'), elements, hasForm, scrollY: Math.round(scrollY), scrollHeight: document.documentElement.scrollHeight, loading: document.readyState !== 'complete' };
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  function fire(el: Element, type: string, init: MouseEventInit = {}) { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...init })); }

  async function click(ref: string): Promise<Res> {
    const el = q(ref); if (!el) return { ok: false, error: `No element ${ref} on the page.` };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior }); await sleep(30);
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) return { ok: false, error: 'Something is covering that element (a dialog or banner).' };
    el.focus?.({ preventScroll: true });
    for (const t of ['pointerover', 'pointerdown', 'mousedown']) fire(el, t, { clientX: x, clientY: y, button: 0 });
    for (const t of ['pointerup', 'mouseup']) fire(el, t, { clientX: x, clientY: y, button: 0 });
    (el as HTMLElement).click();
    return { ok: true };
  }

  function setNative(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; if (setter) setter.call(el, v); else el.value = v;
  }
  async function type(ref: string, text: string, opts: { submit?: boolean; clear?: boolean }): Promise<Res> {
    const el = q(ref); if (!el) return { ok: false, error: `No element ${ref} on the page.` };
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && top !== el && !el.contains(top) && !top.contains(el) && r.width > 0) return { ok: false, error: 'That field is covered by a dialog.' };
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const next = (opts.clear === false ? el.value : '') + text;
      setNative(el, next); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if ((el as HTMLElement).isContentEditable) { if (opts.clear !== false) el.textContent = ''; document.execCommand?.('insertText', false, text); if (!el.textContent) el.textContent = text; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    else return { ok: false, error: `${ref} is not a text field.` };
    if (opts.submit) {
      for (const t of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      const form = (el as HTMLInputElement).form; if (form) { try { form.requestSubmit(); } catch { form.submit(); } }
    }
    return { ok: true };
  }

  function select(ref: string, value: string): Res {
    const el = q(ref) as HTMLSelectElement | null; if (!el || el.tagName !== 'SELECT') return { ok: false, error: `${ref} is not a dropdown.` };
    const o = [...el.options].find((x) => clean(x.text).toLowerCase() === value.toLowerCase() || x.value.toLowerCase() === value.toLowerCase());
    if (!o) return { ok: false, error: `Options are: ${[...el.options].map((x) => clean(x.text)).slice(0, 12).join(', ')}.` };
    el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true };
  }
  function scroll(dir: string, amount?: number): Res {
    const h = amount ?? Math.round(innerHeight * 0.8);
    if (dir === 'top') scrollTo({ top: 0 }); else if (dir === 'bottom') scrollTo({ top: document.documentElement.scrollHeight }); else scrollBy({ top: dir === 'up' ? -h : h });
    return { ok: true };
  }
  async function waitText(text: string | undefined, ms: number): Promise<Res> {
    const end = Date.now() + Math.min(ms, 15000);
    if (!text) { await sleep(Math.min(ms, 15000)); return { ok: true }; }
    while (Date.now() < end) { if ((document.body?.innerText ?? '').includes(text)) return { ok: true }; await sleep(150); }
    return { ok: false, error: `"${text}" has not appeared.` };
  }
  function rectOf(ref: string): { x: number; y: number; w: number; h: number } | null { const el = q(ref); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function addPage(): { title: string; html: string; url: string } {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script,style,noscript,svg,iframe,#ff-overlay-host').forEach((n) => n.remove());
    return { title: document.title, html: clone.outerHTML.slice(0, 2_000_000), url: location.href };
  }
  w.__ffBridge = { snapshot, click, type, select, scroll, waitText, rectOf, addPage };
})();
