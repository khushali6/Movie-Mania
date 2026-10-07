import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Cpu, KeyRound, Shield, Sparkles, X, Hand, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FlyProvider, ResultCard, anchors, Timeline, dur, ease, spring, useFly, usePrefersReducedMotion, useSession } from '@fruitfly/ui';
import { DemoPanelController } from './panel-controller';
import { MockBrowserView } from './MockBrowserView';

export type BrainChoice = 'demo' | 'gateway' | 'key';
export interface OnboardingResult { brain: BrainChoice; pantry: 'skip' | 'documents' | 'about' }

const BEATS = [
  { id: 'open', ms: 3200 }, { id: 'idea', ms: 4200 }, { id: 'demo', ms: 21000 }, { id: 'trust', ms: 8500 }, { id: 'pantry', ms: 8500 }, { id: 'brain', ms: 10500 }, { id: 'finish', ms: 6000 },
] as const;
type Beat = (typeof BEATS)[number]['id'];

function Typewriter({ text, delay = 0, speed = 24 }: { text: string; delay?: number; speed?: number }) {
  const [n, setN] = useState(0); const reduced = usePrefersReducedMotion();
  useEffect(() => { if (reduced) { setN(text.length); return; } let i = 0; const t0 = setTimeout(function tick() { i++; setN(i); if (i < text.length) setTimeout(tick, speed); }, delay); return () => clearTimeout(t0); }, [text, delay, speed, reduced]);
  return <span aria-label={text}>{text.slice(0, n)}<span aria-hidden style={{ opacity: n < text.length ? 1 : 0 }}>▍</span></span>;
}

function Beats({ onFinish, onSkip }: { onFinish: (r: OnboardingResult) => void; onSkip: () => void }) {
  const fly = useFly(); const [i, setI] = useState(0); const reduced = usePrefersReducedMotion();
  const [brain, setBrain] = useState<BrainChoice>('demo'); const [pantry, setPantry] = useState<'skip' | 'documents' | 'about'>('skip');
  const controller = useMemo(() => new DemoPanelController({ thinkMs: 480, seedPantry: false }), []);
  const session = useSession(controller.session); const [, force] = useState(0); const view = useRef<HTMLDivElement>(null);
  const beat: Beat = BEATS[i]!.id; const decided = useRef(false);
  useEffect(() => { controller.attachFly(fly); controller.attachView(view.current); return () => controller.attachFly(null); }, [controller, fly]);
  useEffect(() => controller.onBrowser(() => force((n) => n + 1)), [controller]);
  // auto-advance; beats with a choice wait out their timer, then take the default
  useEffect(() => {
    const t = setTimeout(() => { if (i < BEATS.length - 1) setI((x) => x + 1); else if (!decided.current) { decided.current = true; onFinish({ brain, pantry }); } }, BEATS[i]!.ms);
    return () => clearTimeout(t);
  }, [i, brain, pantry, onFinish]);
  useEffect(() => {
    if (!fly) return;
    const go = (anchor: string, domId: string, cfg: Parameters<typeof anchors.register>[2], mood: Parameters<typeof fly.flyToAnchor>[1] extends infer O ? (O extends { mood?: infer M } ? M : never) : never) =>
      setTimeout(() => { const el = document.getElementById(domId); if (el) anchors.register(anchor, el, cfg); void fly.flyToAnchor(anchor, { mood, style: 'glide' }); }, 160);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (beat === 'open') { fly.engine.teleport({ x: -40, y: 150 }); fly.setMood('greeting', { force: true }); t = go('ob-wordmark', 'ob-wordmark-t', { side: 'top-right', gap: 0, dx: -6 }, 'greeting'); }
    if (beat === 'idea') fly.setMood('greeting', { force: true });
    if (beat === 'demo') { fly.setMood('thinking', { force: true }); t = setTimeout(() => controller.start('Find the cheapest laptop under ₹60,000'), 900); }
    if (beat === 'trust') { fly.setMood('asking', { force: true }); t = go('ob-trust', 'ob-trust', { side: 'top-right', gap: 0 }, 'asking'); }
    if (beat === 'pantry') t = go('ob-shelf', 'ob-shelf', { side: 'top-right', gap: 0 }, 'curious');
    if (beat === 'brain') t = go('ob-brain', 'ob-brain', { side: 'top-right', gap: 0 }, 'waiting');
    if (beat === 'finish') t = go('ob-start', 'ob-start', { side: 'right', gap: 8 }, 'success');
    return () => { if (t) clearTimeout(t); };
  }, [beat, fly, controller]);
  useEffect(() => controller.onEvent((e) => { void fly?.handleEvent(e.type === 'result' ? ({ ...e, type: 'fly_hint', mood: 'success' } as never) : e); }), [controller, fly]);
  useEffect(() => { if (session.result && !session.resultRevealed) { const t = setTimeout(() => controller.revealResult(), reduced ? 0 : 900); return () => clearTimeout(t); } return undefined; }, [session.result, session.resultRevealed, controller, reduced]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onSkip]);

  const fade = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };
  return (
    <div className="ob-root" role="dialog" aria-label="Welcome to FruitFly">
      <button className="ob-skip ff-btn ff-btn--ghost ff-btn--sm" onClick={onSkip}>Skip <X size={14} aria-hidden /></button>
      <div className="ob-stage" aria-live="polite">
        <AnimatePresence mode="wait">
          {beat === 'open' && <motion.div key="open" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}><h1 className="display ob-h1" id="ob-wordmark-t">Meet FruitFly.</h1></motion.div>}
          {beat === 'idea' && <motion.div key="idea" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}><h1 className="display ob-h1">Meet FruitFly.</h1><p className="ob-sub"><Typewriter text="Give it a job. It handles the browsing." delay={250} /></p></motion.div>}
          {beat === 'demo' && (
            <motion.div key="demo" className="ob-demo" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}>
              <div className="ob-bubble">Find the cheapest laptop under ₹60,000</div>
              <div className="ob-demo-grid">
                <div ref={view}><MockBrowserView browser={controller.browser} height={300} /></div>
                <div className="ob-timeline"><Timeline session={session} />{session.result && <div style={{ marginTop: 10 }}><ResultCard result={session.result} revealed={session.resultRevealed} /></div>}</div>
              </div>
            </motion.div>)}
          {beat === 'trust' && (
            <motion.div key="trust" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}>
              <h2 className="display ob-h2" id="ob-trust-h">You stay in charge.</h2>
              <div className="ob-cards" id="ob-trust">
                {[[Shield, 'I only see sites you allow.'], [Hand, 'I ask before anything risky.'], [Sparkles, 'Stop works instantly.']].map(([Icon, text], n) => { const I = Icon as typeof Shield; return <motion.div key={n as number} className="ob-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.panel, delay: 0.15 + (n as number) * 0.14 }}><I aria-hidden /><span>{text as string}</span></motion.div>; })}
              </div>
            </motion.div>)}
          {beat === 'pantry' && (
            <motion.div key="pantry" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}>
              <h2 className="display ob-h2">Want me to know about you?</h2>
              <p className="ob-sub">It all stays on this computer.</p>
              <div className="ob-choices" id="ob-shelf" role="group" aria-label="Pantry">
                <Button icon={<BookOpen />} onClick={() => { setPantry('documents'); setI(5); }}>Add documents</Button>
                <Button icon={<KeyRound />} onClick={() => { setPantry('about'); setI(5); }}>About you</Button>
                <Button variant="primary" size="lg" onClick={() => { setPantry('skip'); setI(5); }} arrow>Skip for now</Button>
              </div>
            </motion.div>)}
          {beat === 'brain' && (
            <motion.div key="brain" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}>
              <h2 className="display ob-h2">No key? No problem.</h2>
              <div className="ob-brains" id="ob-brain" role="radiogroup" aria-label="How should I think?">
                {([['demo', 'Try demo mode', 'Nothing to set up. A scripted guide shows how I work.', Sparkles], ['gateway', 'Connect free gateway', 'Use your free-model gateway on this computer.', Cpu], ['key', 'Add an API key', 'Bring your own Anthropic or Gemini key.', Lock]] as const).map(([id, t, d, Icon], n) => (
                  <motion.button key={id} role="radio" aria-checked={brain === id} className="ob-brain" data-on={brain === id} data-primary={id === 'demo'} onClick={() => { setBrain(id); setI(6); }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.panel, delay: 0.1 + n * 0.1 }}>
                    <Icon aria-hidden /><b>{t}</b><span>{d}</span>
                  </motion.button>))}
              </div>
            </motion.div>)}
          {beat === 'finish' && <motion.div key="finish" className="ob-center" {...fade} transition={{ duration: dur.slow, ease: ease.emphasized }}><h2 className="display ob-h2">Ready to browse?</h2><div id="ob-start" style={{ marginTop: 14 }}><Button variant="primary" size="lg" arrow onClick={() => { decided.current = true; onFinish({ brain, pantry }); }}>Start</Button></div></motion.div>}
        </AnimatePresence>
      </div>
      <div className="ob-dots" role="progressbar" aria-label="Welcome progress" aria-valuemin={1} aria-valuemax={BEATS.length} aria-valuenow={i + 1}>{BEATS.map((b, n) => <motion.i key={b.id} animate={{ width: n === i ? 22 : 7, opacity: n <= i ? 1 : 0.35 }} transition={spring.ui} />)}</div>
    </div>
  );
}

const CSS = `
.ob-root{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(1000px 600px at 50% 0%,color-mix(in srgb,var(--ff-honey) 14%,transparent),transparent),var(--bg);overflow:hidden}
.ob-root::before{content:"";position:absolute;inset:0;opacity:.35;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 .4 0 0 0 0 .3 0 0 0 0 .15 0 0 0 .35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.ob-skip{position:absolute;top:18px;right:18px;z-index:5}
.ob-stage{width:min(980px,calc(100vw - 32px));min-height:520px;display:grid;place-items:center;position:relative}
.ob-center{text-align:center;display:grid;gap:10px;justify-items:center}
.ob-h1{font-size:clamp(44px,8vw,84px);margin:0;font-weight:600;line-height:1}
.ob-h2{font-size:clamp(30px,5vw,48px);margin:0;font-weight:600}
.ob-sub{font-size:clamp(16px,2.4vw,22px);color:var(--muted);margin:0;min-height:1.4em}
.ob-demo{width:100%;display:grid;gap:14px}
.ob-bubble{justify-self:end;background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:18px 18px 4px 18px;font:500 15px var(--font-ui);box-shadow:var(--shadow-2)}
.ob-demo-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:start}
.ob-timeline{max-height:380px;overflow:hidden;padding:4px}
.ob-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px;width:min(820px,100%)}
.ob-card{display:grid;gap:10px;justify-items:center;padding:24px 16px;border-radius:var(--r-4);background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-2);font:500 16px/1.35 var(--font-ui)}
.ob-card svg{width:26px;height:26px;stroke-width:1.5;color:var(--ff-honey)}
.ob-choices{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:14px}
.ob-brains{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px;width:min(860px,100%)}
.ob-brain{all:unset;box-sizing:border-box;cursor:pointer;display:grid;gap:6px;justify-items:start;padding:20px;border-radius:var(--r-4);background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-1);text-align:left;transition:transform .14s,box-shadow .14s,border-color .14s}
.ob-brain:hover{transform:translateY(-2px);box-shadow:var(--shadow-2)} .ob-brain:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.ob-brain[data-primary="true"]{border-color:color-mix(in srgb,var(--ff-honey) 70%,var(--border));background:color-mix(in srgb,var(--ff-honey) 10%,var(--surface))}
.ob-brain svg{width:22px;height:22px;stroke-width:1.5;color:var(--ff-honey)} .ob-brain b{font:600 16px var(--font-ui)} .ob-brain span{color:var(--muted);font-size:13px}
.ob-dots{position:absolute;bottom:26px;display:flex;gap:6px;align-items:center}
.ob-dots i{display:block;height:7px;border-radius:4px;background:var(--ink)}
@media(max-width:760px){.ob-demo-grid,.ob-cards,.ob-brains{grid-template-columns:1fr}.ob-timeline{max-height:220px}}
`;

export function OnboardingFlow({ onFinish, onSkip }: { onFinish: (r: OnboardingResult) => void; onSkip: () => void }) {
  return (
    <div className="ff-root" style={{ background: 'transparent' }}>
      <style>{CSS}</style>
      <FlyProvider size={64} sleepAfter={0} startAnchor="ob-wordmark"><Beats onFinish={onFinish} onSkip={onSkip} /></FlyProvider>
    </div>
  );
}
