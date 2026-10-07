import { Check, X } from 'lucide-react';
import { Reveal, Section } from './common';

const STAYS = ['Your documents, their text and their search index', 'Your profile and anything you tell it to remember', 'Passwords, card numbers and vault fields, ever', 'Documents you mark private, even from remote models', 'Your task history, unless you export it'];
const GOES = ['The task you typed and the page text it needs', 'Short passages from documents you allowed, to the route you allowed', 'Nothing else. No analytics, no accounts, no tracking'];

export function Privacy() {
  return (
    <Section id="privacy" eyebrow="Privacy" title={<>Built so you <em>don't have to trust it.</em></>} lede="One checkpoint sees every request that leaves your browser. It removes secrets, refuses private content, and keeps a ledger you can read. The extension can only reach your own computer and the two providers you may choose to connect.">
      <div className="lp-two">
        <Reveal className="lp-ledger lp-ledger-stay"><h3>Stays on your device</h3><ul>{STAYS.map((t) => <li key={t}><Check size={16} aria-hidden /> {t}</li>)}</ul></Reveal>
        <Reveal delay={0.08} className="lp-ledger lp-ledger-go"><h3>What can leave, and only if you allow it</h3><ul>{GOES.map((t) => <li key={t}><X size={16} aria-hidden className="lp-x" /> {t}</li>)}</ul></Reveal>
      </div>
    </Section>
  );
}
