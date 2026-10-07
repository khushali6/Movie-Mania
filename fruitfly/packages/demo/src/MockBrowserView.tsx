import { useSyncExternalStore } from 'react';
import { Lock } from 'lucide-react';
import type { MockBrowser, MockNode } from '@fruitfly/agent';
import { useFlyAnchor } from '@fruitfly/ui';

/** Draws the MockBrowser's current page. Every interactive node carries data-ff-ref so the fly can land beside the real element. */
export function MockBrowserView({ browser, anchorId = 'page-preview', height }: { browser: MockBrowser | null; anchorId?: string; height?: number | string }) {
  const subscribe = (cb: () => void) => browser?.subscribe(cb) ?? (() => {});
  // a cheap version number: the log grows on every action, tabs and highlight change on notify
  const version = useSyncExternalStore(subscribe, () => (browser ? browser.log.length * 1000 + (browser.highlighted ? 1 : 0) + (browser.highlighted?.ref.length ?? 0) : 0), () => 0);
  void version;
  const anchor = useFlyAnchor<HTMLDivElement>(anchorId, { side: 'right', gap: 14 });
  if (!browser) return <div ref={anchor} className="ff-browser" style={{ minHeight: 200, height, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: 24 }}>Pick a job above, or type one in the panel.<br />The tab appears here, and the fly goes to work.</div>;
  const v = browser.view(browser.activeId);
  const hl = browser.highlighted;
  const renderNode = (n: MockNode, i: number, inModal: boolean): React.ReactNode => {
    const ref = v.refs.get(n);
    const covered = v.hasModal && !inModal;
    const cls = (ref && hl?.ref === ref && hl.tabId === v.active ? 'ff-hl' : '') + (covered ? ' ff-covered' : '');
    switch (n.t) {
      case 'h': { const T = (`h${n.level ?? 2}`) as 'h1' | 'h2' | 'h3'; return <T key={i}>{n.text}</T>; }
      case 'p': return <p key={i}>{n.text}</p>;
      case 'link': return <div key={i}><span data-ff-ref={ref} className={`ff-pg-link ${cls}`}>{n.label}</span>{n.text && <p style={{ marginTop: 2 }}>{n.text}</p>}</div>;
      case 'button': return <span key={i} data-ff-ref={ref} className={`ff-pg-btn ${cls}`} style={{ opacity: n.disabled ? 0.5 : 1 }}>{n.label}</span>;
      case 'input': return <div key={i} data-ff-ref={ref} className={`ff-pg-input ${cls}`}><small>{n.label}</small><span style={{ color: n.type === 'password' ? 'var(--muted)' : undefined }}>{n.type === 'password' && browser.view(v.active) ? '' : ''}{formValue(browser, v.active, n) || <span style={{ color: 'var(--muted)', opacity: 0.7 }}>{n.placeholder ?? ''}</span>}</span></div>;
      case 'select': return <div key={i} data-ff-ref={ref} className={`ff-pg-input ${cls}`}><small>{n.label}</small><span>{formValue(browser, v.active, n) || n.options[0]}</span></div>;
      case 'group': return n.modal ? <div key={i} className="ff-pg-modal"><div>{n.children.map((c, j) => renderNode(c, j, true))}</div></div> : n.card ? <div key={i} className="ff-pg-card">{n.children.map((c, j) => renderNode(c, j, inModal))}</div> : <div key={i}>{n.children.map((c, j) => renderNode(c, j, inModal))}</div>;
    }
  };
  return (
    <div className="ff-browser" role="img" aria-label={`A browser showing ${v.page.title}`}>
      <div className="ff-tabsbar">{v.tabs.map((t) => <div key={t.id} className="ff-btab" aria-selected={t.id === v.active}>{t.title}</div>)}</div>
      <div className="ff-browser-bar"><div className="ff-lights" aria-hidden><i /><i /><i /></div><div className="ff-url"><Lock size={11} style={{ marginRight: 6, flex: 'none' }} aria-hidden />{v.page.url.replace(/^https?:\/\//, '')}</div></div>
      <div ref={anchor} className="ff-page" style={{ height: height ?? 340 }} data-fly-avoid-none>{v.page.nodes.map((n, i) => renderNode(n, i, false))}</div>
    </div>
  );
}

function formValue(b: MockBrowser, tab: string, n: Extract<MockNode, { t: 'input' | 'select' }>): string {
  const t = (b as unknown as { tabs: Map<string, { form: Record<string, string> }> }).tabs.get(tab);
  const raw = t?.form[n.name] ?? '';
  return n.t === 'input' && n.type === 'password' && raw ? '••••••••' : raw;
}

/** Screen point beside a ref in the view (for the fly), or null. */
export function elementRect(container: ParentNode, ref: string): DOMRect | null { return container.querySelector(`[data-ff-ref="${ref}"]`)?.getBoundingClientRect() ?? null; }
