import { Eye, HandHeart, BookOpen, RotateCcw } from 'lucide-react';
import { ProceduralFly } from '@fruitfly/ui';
import type { FlyMood } from '@fruitfly/core';
import { Reveal, Section } from './common';

const STEPS: { icon: typeof Eye; mood: FlyMood; title: string; body: string }[] = [
  { icon: Eye, mood: 'reading', title: 'It reads the page like you do', body: 'FruitFly sees headings, buttons, prices and forms, not pixels. It lands next to the thing it is about to touch, so you always know where it is.' },
  { icon: HandHeart, mood: 'asking', title: 'It asks before it matters', body: 'Paying, sending, deleting, signing in: it stops, shows exactly what will happen, and waits for you. Sensitive steps need a second press.' },
  { icon: BookOpen, mood: 'thinking', title: 'It knows you, quietly', body: 'Your documents and details live in your browser. It looks things up in your lease or your invoices, and fills forms with what you told it, at the last moment.' },
  { icon: RotateCcw, mood: 'success', title: 'It survives the real world', body: 'Cookie walls, rate limits, a tab that dies mid-task. It notices, recovers, and tells you what happened in plain words.' },
];

export function How() {
  return (
    <Section id="how" eyebrow="How it works" title={<>Quiet, careful, <em>visible.</em></>} lede="An agent you can watch is an agent you can trust. Everything it does happens in your tab, at a pace you can follow, and you can take over at any moment.">
      <ul className="lp-grid4">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.06} className="lp-card">
            <div className="lp-card-fly" aria-hidden><ProceduralFly mood={s.mood} size={64} seed={i + 11} followCursor={false} /></div>
            <h3><s.icon size={16} aria-hidden /> {s.title}</h3>
            <p>{s.body}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
