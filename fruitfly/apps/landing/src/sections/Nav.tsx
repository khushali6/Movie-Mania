import { ProceduralFly } from '@fruitfly/ui';

const LINKS = [['#how', 'How it works'], ['#trust', 'Safety'], ['#pantry', 'Pantry'], ['#gateway', 'Models'], ['#privacy', 'Privacy']] as const;

export function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-in">
        <a className="lp-brand" href="#top" aria-label="FruitFly, home"><span className="lp-brand-fly" aria-hidden><ProceduralFly size={34} seed={3} followCursor={false} /></span><span>FruitFly</span></a>
        <nav aria-label="Sections"><ul>{LINKS.map(([h, l]) => <li key={h}><a href={h}>{l}</a></li>)}</ul></nav>
        <a className="ff-btn ff-btn--primary lp-cta-sm" href="#install">Get it</a>
      </div>
    </header>
  );
}
