// pnpm eval:pantry — golden-set retrieval quality with the on-device embedder (or EMBED=ollama later)
import { Pantry, runGolden } from '../packages/pantry/src';

const p = new Pantry({ now: () => 1 });
const r = await runGolden(p);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Pantry golden set (${r.questions} questions, embedder ${p.embedderId})`);
console.log(`  recall@6            ${pct(r.recallAt6)}`);
console.log(`  MRR                 ${r.mrr.toFixed(3)}`);
console.log(`  grounding rate      ${pct(r.grounding)}`);
console.log(`  refusal when absent ${pct(r.refusalWhenAbsent)}`);
console.log(`  retrieval p95       ${r.p95Ms.toFixed(1)} ms`);
if (r.failures.length) { console.log('  misses:'); for (const f of r.failures) console.log(`   - ${f.q} (${f.why})`); }
process.exit(r.recallAt6 >= 0.9 ? 0 : 1);
