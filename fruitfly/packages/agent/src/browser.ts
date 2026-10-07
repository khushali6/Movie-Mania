export interface TabInfo { id: string; url: string; title: string }
export interface Rect { x: number; y: number; w: number; h: number }

export type ElementRole = 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'heading' | 'text';

export interface ElementRef {
  ref: string;
  role: ElementRole;
  label: string;
  text?: string;
  href?: string;
  value?: string;
  /** input type: text, password, email, tel, number, search… */
  type?: string;
  name?: string;
  placeholder?: string;
  options?: string[];
  disabled?: boolean;
  formId?: string;
  /** covered by a modal/overlay and not actually clickable */
  covered?: boolean;
}

export interface PageSnapshot {
  tabId: string;
  url: string;
  title: string;
  /** reading-order text with element refs inline: [e12 button "Add to cart"] */
  text: string;
  elements: ElementRef[];
  hasForm: boolean;
  scrollY: number;
  scrollHeight: number;
  loading: boolean;
}

export interface ActionResult { ok: boolean; navigated?: boolean; url?: string; note?: string; error?: string }

/** Everything the agent can do to a browser. Chrome implements it with scripting + tabs; demo mode with MockBrowser. */
export interface BrowserAdapter {
  listTabs(): Promise<TabInfo[]>;
  activeTab(): Promise<TabInfo>;
  openTab(url: string, opts?: { background?: boolean }): Promise<TabInfo>;
  closeTab(tabId: string): Promise<void>;
  focusTab(tabId: string): Promise<void>;
  navigate(tabId: string, url: string): Promise<ActionResult>;
  back(tabId: string): Promise<ActionResult>;
  snapshot(tabId: string): Promise<PageSnapshot>;
  click(tabId: string, ref: string): Promise<ActionResult>;
  type(tabId: string, ref: string, text: string, opts?: { submit?: boolean; clear?: boolean }): Promise<ActionResult>;
  select(tabId: string, ref: string, value: string): Promise<ActionResult>;
  scroll(tabId: string, dir: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<ActionResult>;
  waitFor(tabId: string, o: { ms?: number; text?: string }): Promise<ActionResult>;
  /** subtle target highlight for the fly; null clears */
  highlight(tabId: string, ref: string | null, label?: string): Promise<void>;
  rectOf?(tabId: string, ref: string): Promise<Rect | null>;
}

/** Render a snapshot's text body for the model with a header; pure, so it can be paged. */
export function formatPage(s: PageSnapshot): string {
  const pos = s.scrollHeight > 0 ? ` · scroll ${Math.round((s.scrollY / Math.max(1, s.scrollHeight)) * 100)}%` : '';
  return `Page: ${s.title}\nURL: ${s.url}${pos}${s.loading ? ' · still loading' : ''}\n\n${s.text}`;
}

export function elementLine(e: ElementRef): string {
  const extra = [e.type && e.type !== 'text' ? e.type : '', e.value ? `value="${e.value}"` : '', e.placeholder ? `placeholder="${e.placeholder}"` : '', e.disabled ? 'disabled' : '', e.covered ? 'covered' : ''].filter(Boolean).join(' ');
  return `[${e.ref} ${e.role} "${e.label}"${extra ? ` ${extra}` : ''}]`;
}

const STOP = new Set('the a an and or of to in on for with button link click find get show me my page element field input'.split(' '));
/** Rank elements for `find_element(query)`. */
export function findElements(elements: ElementRef[], query: string): ElementRef[] {
  const q = (query.toLowerCase().match(/[\p{L}\p{N}₹]+/gu) ?? []).filter((t) => !STOP.has(t));
  if (!q.length) return elements.slice(0, 30);
  const scored = elements.map((e) => {
    const hay = `${e.label} ${e.text ?? ''} ${e.name ?? ''} ${e.placeholder ?? ''} ${e.role} ${e.href ?? ''}`.toLowerCase();
    let s = 0; for (const t of q) { if (hay.includes(t)) s += e.label.toLowerCase().includes(t) ? 2 : 1; }
    if (e.role === 'heading' || e.role === 'text') s *= 0.5;
    return { e, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.map((x) => x.e);
}
