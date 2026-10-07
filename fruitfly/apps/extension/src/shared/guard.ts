import { EgressGuard, type GuardOptions } from '@fruitfly/egress';
import { FunctionEmbedder, HashingEmbedder, type Embedder } from '@fruitfly/pantry';
import { ChromeLedger } from './stores';
import { loadKeys, type Settings } from './settings';

/** The one place extension code builds an EgressGuard (the lint rule forbids provider fetches anywhere else). */
export function makeGuard(o: { settings: () => Settings; confirm?: GuardOptions['confirm']; ledger?: ChromeLedger }): EgressGuard {
  let secrets: string[] = [];
  const refresh = () => void loadKeys().then((k) => { secrets = Object.values(k).filter(Boolean) as string[]; });
  refresh(); chrome.storage.onChanged.addListener(refresh);
  return new EgressGuard({ fetchImpl: (...a) => fetch(...a), ledger: o.ledger ?? new ChromeLedger(), askBeforePersonal: () => o.settings().askBeforePersonal, confirm: o.confirm, secrets: () => secrets });
}

/** "Basic" on-device search needs no download. "Smart" uses a local Ollama embedding model through the same Embedder interface. */
export function makeEmbedder(s: Settings, guard: EgressGuard): Embedder {
  if (s.pantry.embedder === 'ollama' && s.ollama.enabled) {
    const url = s.ollama.url.replace(/\/$/, ''); const model = s.ollama.embedModel; let dim = 768;
    return new FunctionEmbedder(`ollama:${model}`, dim, 'local-server', async (texts, signal) => {
      const res = await guard.fetch({ id: `ollama:${model}`, kind: 'local', allowsPersonal: true }, `${url}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: texts }), signal }, { category: 'model-local' });
      if (!res.ok) throw new Error(`Ollama embeddings failed (${res.status})`);
      const j = (await res.json()) as { embeddings: number[][] }; if (j.embeddings[0]) dim = j.embeddings[0].length; return j.embeddings;
    }, 8);
  }
  return new HashingEmbedder();
}
