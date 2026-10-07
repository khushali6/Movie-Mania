// Offscreen host for background work that needs a DOM-capable page (reason: WORKERS). Currently: saving a page to Pantry
// without the side panel open. Heavy parsing stays in the ingest Worker; the service worker never parses.
import { IdbPantryStore, Pantry } from '@fruitfly/pantry';
import { loadSettings } from '../shared/settings';
import { makeEmbedder, makeGuard } from '../shared/guard';

chrome.runtime.onMessage.addListener((m: { ff?: string; title?: string; html?: string; sensitivity?: 'public' | 'personal' | 'local-only' }, _s, reply) => {
  if (m.ff !== 'offscreen_ingest_html') return false;
  void (async () => {
    const s = await loadSettings(); const guard = makeGuard({ settings: () => s });
    const p = new Pantry({ store: await IdbPantryStore.open(), embedder: makeEmbedder(s, guard) });
    const d = await p.addText(m.title ?? 'Saved page', m.html ?? '', { kind: 'html', sensitivity: m.sensitivity ?? 'personal', source: { kind: 'page' } });
    new BroadcastChannel('ff-pantry').postMessage('changed'); reply({ ok: true, id: d.id });
  })().catch((e: Error) => reply({ ok: false, error: e.message }));
  return true;
});
