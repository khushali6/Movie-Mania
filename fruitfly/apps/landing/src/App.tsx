import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { How } from './sections/How';
import { Trust } from './sections/Trust';
import { PantryDemo } from './sections/PantryDemo';
import { Failover } from './sections/Failover';
import { Privacy } from './sections/Privacy';
import { Install } from './sections/Install';
import { Footer } from './sections/Footer';

export function App() {
  return (
    <div className="lp ff-root">
      <a className="lp-skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <How />
        <Trust />
        <PantryDemo />
        <Failover />
        <Privacy />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
