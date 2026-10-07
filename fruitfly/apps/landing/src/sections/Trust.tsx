import { ShieldCheck, Hand, Eraser, ScrollText } from 'lucide-react';
import { SCENARIOS } from '@fruitfly/demo';
import { Reveal, Section } from './common';

const bill = SCENARIOS.find((s) => s.id === 'approval') ?? SCENARIOS[2]!;
const run = (goal: string) => { window.dispatchEvent(new CustomEvent('ff:run', { detail: goal })); document.getElementById('demo')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); };

const ROWS = [
  [ShieldCheck, 'Pages are data, never orders', 'Text on a website cannot give FruitFly instructions. Hidden "ignore your rules" lines are flagged and shown to you.'],
  [Hand, 'You can take over any time', 'A small pill on the page hands the tab back to you instantly. Stop is always one press away.'],
  [Eraser, 'Secrets never travel', 'Passwords and card numbers are typed into the page at the last moment and never enter a prompt, a log or a replay.'],
  [ScrollText, 'A replay you can read', 'Every task leaves a plain-language timeline with what it looked at and what it changed.'],
] as const;

export function Trust() {
  return (
    <Section id="trust" eyebrow="Safety" title={<>It asks first. <em>Then it asks again</em> for the big ones.</>} lede="Try the electricity bill. The fly finds the right page, fills in the amount, then stops at Pay and waits for you." tone="sunken">
      <Reveal className="lp-actions"><button type="button" className="ff-btn ff-btn--primary lp-cta" onClick={() => run(bill.goal)}>Run the bill job</button></Reveal>
      <ul className="lp-grid4 lp-mt">
        {ROWS.map(([Icon, t, b], i) => (
          <Reveal as="li" key={t} delay={i * 0.05} className="lp-card lp-card-quiet"><h3><Icon size={16} aria-hidden /> {t}</h3><p>{b}</p></Reveal>
        ))}
      </ul>
    </Section>
  );
}
