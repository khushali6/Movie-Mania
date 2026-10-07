import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Callout, ContextInspector, type InspectorData } from '@fruitfly/ui';
import type { Settings } from '../../shared/settings';
import { Row, Section, download, send } from './common';

export function Advanced({ s }: { s: Settings }) {
  const [inspector, setInspector] = useState<InspectorData | null>(null);
  useEffect(() => { void send<InspectorData | null>({ ff: 'get_inspector' }).then(setInspector).catch(() => undefined); }, []);
  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title="Context" hint="What is in my head right now, as a share of the model's window. Counts are estimates (≈) until a provider reports real usage.">
        {inspector ? <ContextInspector data={inspector} onCompact={() => void send({ ff: 'command', command: { cmd: 'compact' } })} onFresh={() => void send({ ff: 'command', command: { cmd: 'new_task' } })} /> : <div className="ff-hint">No live task right now.</div>}
      </Section>
      <Section title="Diagnostics" hint="A redacted report for bug reports: versions, route health, error codes and the ledger summary. Never page content, documents, prompts or keys.">
        <Row label="Export diagnostics"><Button size="sm" icon={<Download />} onClick={async () => download('fruitfly-diagnostics.json', JSON.stringify(await send({ ff: 'diagnostics' }), null, 2))}>Download</Button></Row>
        <Callout tone="info">Mode: {s.mode}. Pantry: {s.pantry.enabled ? s.pantry.embedder : 'off'}. Ask before sending personal info: {s.askBeforePersonal ? 'on' : 'off'}.</Callout>
      </Section>
    </div>
  );
}
