import { ProceduralFly } from '@fruitfly/ui';
import { Reveal } from './common';

export function Install() {
  return (
    <section id="install" className="lp-install" aria-labelledby="install-h">
      <div className="lp-wrap">
        <Reveal className="lp-install-card">
          <div className="lp-install-fly" aria-hidden><ProceduralFly mood="greeting" size={96} seed={5} /></div>
          <h2 id="install-h">Give it a job.</h2>
          <p>Works with no account and no key: the first run uses a scripted guide on sample sites, so you can see how it behaves before you connect anything.</p>
          <ol className="lp-steps">
            <li><b>1</b> Download the extension and unzip it.</li>
            <li><b>2</b> Open <code>chrome://extensions</code>, turn on Developer mode, choose Load unpacked.</li>
            <li><b>3</b> Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> to open the side panel.</li>
          </ol>
          <a className="ff-btn ff-btn--primary lp-cta" href="https://github.com/khushali6/Movie-Mania/tree/claude/busy-brown-92dquf/fruitfly">Get the source</a>
        </Reveal>
      </div>
    </section>
  );
}
