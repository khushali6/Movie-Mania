import { Trash2 } from 'lucide-react';
import { Badge, Button, Field, Input, Kbd, Segmented, Slider, Toggle } from '@fruitfly/ui';
import type { Settings } from '../../shared/settings';
import { Row, Section, set } from './common';

export function General({ s }: { s: Settings }) {
  const num = (v: string, d: number) => { const n = Number(v.replace(/[^\d]/g, '')); return n > 0 ? n : d; };
  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title="How I run" hint="Demo mode needs no key: a scripted guide shows how I work on sample sites. Live mode uses the models you connect under Models.">
        <Row label="Mode"><Segmented label="Mode" value={s.mode} onChange={(v) => set((x) => ({ ...x, mode: v }))} options={[{ value: 'demo', label: 'Demo' }, { value: 'live', label: 'Live' }]} /></Row>
        <Row label="Steps per task" hint="I stop and tell you if I reach this."><Input style={{ width: 90 }} aria-label="Steps per task" inputMode="numeric" value={s.stepsCap} onChange={(e) => set((x) => ({ ...x, stepsCap: num(e.target.value, 40) }))} /></Row>
      </Section>
      <Section title="Nectar" hint="Nectar is my name for what's left of your token budget. Hard caps stop me; I warn you at 80%.">
        <Row label="Per task (tokens)"><Input style={{ width: 130 }} aria-label="Per task tokens" inputMode="numeric" value={s.budget.perTask} onChange={(e) => set((x) => ({ ...x, budget: { ...x.budget, perTask: num(e.target.value, 250000) } }))} /></Row>
        <Row label="Per day (tokens)"><Input style={{ width: 130 }} aria-label="Per day tokens" inputMode="numeric" value={s.budget.dayHard} onChange={(e) => set((x) => ({ ...x, budget: { ...x.budget, dayHard: num(e.target.value, 1000000) } }))} /></Row>
        <Row label="Per month (tokens)"><Input style={{ width: 130 }} aria-label="Per month tokens" inputMode="numeric" value={s.budget.monthHard} onChange={(e) => set((x) => ({ ...x, budget: { ...x.budget, monthHard: num(e.target.value, 20000000) } }))} /></Row>
      </Section>
      <Section title="The fly" hint="Motion is part of how I tell you what I'm doing. Everything still works with it turned down.">
        <Row label="Theme"><Segmented label="Theme" value={s.ui.theme} onChange={(v) => set((x) => ({ ...x, ui: { ...x.ui, theme: v } }))} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Night orchard' }]} /></Row>
        <Row label="Energy" hint="How lively the fly is."><Segmented label="Energy" value={s.ui.energy} onChange={(v) => set((x) => ({ ...x, ui: { ...x.ui, energy: v } }))} options={[{ value: 'calm', label: 'Calm' }, { value: 'normal', label: 'Normal' }, { value: 'lively', label: 'Lively' }]} /></Row>
        <Row label="Reduced motion" hint="Auto follows your system setting."><Segmented label="Reduced motion" value={s.ui.reducedMotion} onChange={(v) => set((x) => ({ ...x, ui: { ...x.ui, reducedMotion: v } }))} options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} /></Row>
        <Row label={`Falls asleep after ${s.ui.sleepAfter === 0 ? 'never' : `${s.ui.sleepAfter}s`} of quiet`}><div style={{ width: 200 }}><Slider label="Sleep after seconds" min={0} max={300} step={15} value={s.ui.sleepAfter} onChange={(v) => set((x) => ({ ...x, ui: { ...x.ui, sleepAfter: v } }))} /></div></Row>
      </Section>
      <Section title="Saved tasks" hint="Jobs you saved from a result card. They appear as suggestions and in the toolbar popup. Only a short description is ever kept in context; the full task loads when you run it.">
        {s.savedTasks.length === 0 ? <div className="ff-hint">Nothing saved yet.</div> : s.savedTasks.map((t) => <Row key={t.id} label={t.name} hint={t.description || t.goal}><Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Delete ${t.name}`} onClick={() => set((x) => ({ ...x, savedTasks: x.savedTasks.filter((y) => y.id !== t.id) }))} /></Row>)}
      </Section>
      <Section title="Shortcuts">
        <div className="ff-row" style={{ flexWrap: 'wrap', gap: 18, fontSize: 13 }}>{([['Command palette', '⌘/Ctrl K'], ['Send', '⌘/Ctrl Enter'], ['Stop', '⌘/Ctrl .'], ['Pause / resume', '⌘/Ctrl Shift P'], ['Focus the composer', '/'], ['Open FruitFly', 'Alt Shift F']] as const).map(([a, b]) => <span key={a} className="ff-row" style={{ gap: 6 }}>{a} <Kbd>{b}</Kbd></span>)}</div>
      </Section>
      <Section title="Experiments"><Row label="Let helpers work in parallel" hint="Small helper flies read other shops or pages while I carry on."><Toggle label="Helpers" checked={!s.flags.noSubagents} onChange={(v) => set((x) => ({ ...x, flags: { ...x.flags, noSubagents: !v } }))} /></Row><Row label="Double-check answers with a model" hint="A second look at my result before it appears. Costs a little nectar."><Toggle label="Model critic" checked={!!s.flags.llmCritic} onChange={(v) => set((x) => ({ ...x, flags: { ...x.flags, llmCritic: v } }))} /></Row><Row label="Analytics" hint="Off. There are no accounts and nothing is reported."><Badge>Off</Badge></Row></Section>
      <Field>{() => <></>}</Field>
    </div>
  );
}
