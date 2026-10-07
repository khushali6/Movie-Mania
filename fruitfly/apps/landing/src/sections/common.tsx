import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ease } from '@fruitfly/ui';

/** Fade-and-rise on first view. Transform + opacity only; MotionConfig turns it off for reduced motion. */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const M = motion[as];
  return <M className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.6, delay, ease: [...ease.emphasized] }}>{children}</M>;
}

export function Eyebrow({ children }: { children: ReactNode }) { return <p className="lp-eyebrow">{children}</p>; }

export function Section({ id, eyebrow, title, lede, children, tone }: { id: string; eyebrow: string; title: ReactNode; lede?: ReactNode; children?: ReactNode; tone?: 'sunken' }) {
  return (
    <section id={id} className={`lp-section${tone ? ` lp-${tone}` : ''}`} aria-labelledby={`${id}-h`}>
      <div className="lp-wrap">
        <Reveal className="lp-head"><Eyebrow>{eyebrow}</Eyebrow><h2 id={`${id}-h`}>{title}</h2>{lede && <p className="lp-lede">{lede}</p>}</Reveal>
        {children}
      </div>
    </section>
  );
}
