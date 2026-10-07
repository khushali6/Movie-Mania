import { Section } from './common';

const LICENSES: [string, string, string][] = [['React and React DOM', 'MIT', 'Meta'], ['Motion', 'MIT', 'Framer'], ['Lucide icons', 'ISC', 'Lucide contributors'], ['pdf.js', 'Apache-2.0', 'Mozilla'], ['mammoth', 'BSD-2-Clause', 'Michael Williamson'], ['MiniSearch', 'MIT', 'Luca Ongaro'], ['zod', 'MIT', 'Colin McDonnell'], ['Geist, Geist Mono', 'SIL OFL 1.1', 'Vercel'], ['Fraunces', 'SIL OFL 1.1', 'Undercase Type']];
export function About() {
  const m = chrome.runtime.getManifest();
  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title={`FruitFly ${m.version}`} hint="A tiny browser agent that lives in your browser, keeps your things on your device, and asks before it does anything risky.">
        <div className="ff-hint">Free-tier models and gateways change without notice. For critical work, add a paid provider to the chain.</div>
      </Section>
      <Section title="Privacy policy" hint="Written to match the network ledger line for line.">
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13.5 }}>
          <li>Your documents, profile, notes, history, replays, keys and settings are stored on this computer only.</li>
          <li>There are no FruitFly servers, no accounts and no telemetry.</li>
          <li>When you choose a cloud or free-pool model, only the text needed for that request is sent. Items marked local-only are never sent, and personal items are sent only to routes you allowed.</li>
          <li>I visit only sites you allow, and only to do what you asked.</li>
          <li>Every request is listed under Privacy → Network ledger, by destination, with counts and sizes.</li>
        </ul>
      </Section>
      <Section title="Open source licenses"><table className="ff-table" aria-label="Licenses"><thead><tr><th scope="col" style={{ textAlign: 'left' }}>Library</th><th scope="col" style={{ textAlign: 'left' }}>License</th><th scope="col">Author</th></tr></thead><tbody>{LICENSES.map(([a, b, c]) => <tr key={a}><td style={{ textAlign: 'left' }}>{a}</td><td style={{ textAlign: 'left' }}>{b}</td><td>{c}</td></tr>)}</tbody></table></Section>
    </div>
  );
}
