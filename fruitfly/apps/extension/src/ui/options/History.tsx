import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { TaskState } from '@fruitfly/core';
import { Badge, Button, EmptyState, ProceduralFly, Replay, type ReplayData } from '@fruitfly/ui';
import { IdbTaskStore, type ReplayRecord } from '../../shared/stores';
import { Section } from './common';

const store = new IdbTaskStore();
export function History({ selected }: { selected?: string }) {
  const [tasks, setTasks] = useState<TaskState[]>([]); const [open, setOpen] = useState<string | undefined>(selected); const [rec, setRec] = useState<ReplayRecord | undefined>();
  const load = () => void store.list(100).then(setTasks);
  useEffect(load, []);
  useEffect(() => { if (open) void store.loadReplay(open).then(setRec); else setRec(undefined); }, [open]);
  const data: ReplayData | null = rec ? { goal: rec.goal, events: rec.events, path: rec.path, sites: rec.sites, tokens: rec.tokens } : null;
  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      {open && <Section title="Replay" hint="Steps, what I saw (summarised), and where the fly went. No vault values, keys or raw documents are kept."><div><Button size="sm" variant="ghost" onClick={() => setOpen(undefined)}>Back to history</Button></div>{data ? <Replay data={data} /> : <div className="ff-hint">No replay was kept for this task.</div>}</Section>}
      {!open && <Section title="History" hint="Everything stays on this computer.">
        {tasks.length === 0 ? <EmptyState art={<ProceduralFly size={56} mood="sleeping" label="" followCursor={false} />} title="No tasks yet." body="Finished tasks show up here, with sites visited and what each used." /> : tasks.map((t) => (
          <div key={t.id} className="ff-doc" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <div style={{ minWidth: 0 }}><div className="ff-doc-title">{t.goal}</div><div className="ff-doc-meta"><Badge tone={t.status === 'done' ? 'lime' : t.status === 'failed' ? 'danger' : undefined}>{t.status}</Badge><span>{new Date(t.updatedAt).toLocaleString()}</span><span>·</span><span>{[...new Set(t.sources.filter((x) => x.url).map((x) => { try { return new URL(x.url!).hostname; } catch { return ''; } }))].slice(0, 3).join(', ') || 'no sites'}</span><span>·</span><span className="tnum">≈{t.budgets.tokensUsed.toLocaleString('en-IN')} tokens · {t.steps.length} steps</span></div></div>
            <Button size="sm" onClick={() => setOpen(t.id)}>Replay</Button>
            <button className="ff-iconbtn" aria-label="Delete task" onClick={async () => { await store.delete(t.id); load(); }}><Trash2 /></button>
          </div>))}
      </Section>}
    </div>
  );
}
