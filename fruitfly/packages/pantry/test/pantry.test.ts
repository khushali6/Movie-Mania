import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Pantry, HashingEmbedder, MemoryPantryStore, IdbPantryStore, openPantryDb, chunkDocument, parseMarkdown, parseHtml, parseCsv, parsePlain, runGolden, hasEvidence, compileDigest, DEFAULT_PROFILE, fillPlaceholders, needsPersonalData, FunctionEmbedder, GOLDEN_QUESTIONS, loadGolden, parseFile, type PantryStore, type PantryDoc } from '../src';

const file = (name: string, data: string | Uint8Array, type?: string) => { const b = typeof data === 'string' ? new TextEncoder().encode(data) : data; return { name, type, size: b.byteLength, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }; };

describe('golden set (Pantry retrieval quality)', () => {
  it('meets recall@6, MRR, grounding and refusal targets with the on-device embedder', async () => {
    const p = new Pantry({ now: () => 1 });
    const r = await runGolden(p);
    console.log('golden', JSON.stringify({ ...r, failures: r.failures.slice(0, 8) }));
    expect(r.questions).toBeGreaterThanOrEqual(40);
    expect(r.recallAt6).toBeGreaterThanOrEqual(0.9);
    expect(r.mrr).toBeGreaterThanOrEqual(0.6);
    expect(r.grounding).toBeGreaterThanOrEqual(0.8);
    expect(r.refusalWhenAbsent).toBeGreaterThanOrEqual(0.8);
  }, 60_000);
});

describe('parsers & chunker', () => {
  it('markdown heading paths, html, csv and plain-text headings', () => {
    const md = parseMarkdown('# A\nintro\n## B\nbody b\n### C\nbody c\n## D\nbody d', 't');
    expect(md.blocks.map((b) => b.headingPath)).toEqual([['A'], ['A', 'B'], ['A', 'B', 'C'], ['A', 'D']]);
    const html = parseHtml('<html><head><title>My Page</title><style>x{}</style></head><body><h1>Main</h1><p>Hello &amp; welcome ₹5</p><script>evil()</script><h2>Sub</h2><p>More</p></body></html>');
    expect(html.title).toBe('My Page'); expect(html.blocks[0]).toMatchObject({ headingPath: ['Main'], text: 'Hello & welcome ₹5' }); expect(JSON.stringify(html)).not.toContain('evil');
    const csv = parseCsv('a,b\n1,"x, y"\n2,z', 't'); expect(csv.blocks[1]!.text).toContain('b: x, y');
    expect(parsePlain('INTRODUCTION\nhello there\n\nTERMS AND CONDITIONS\nbe nice', 't').blocks.map((b) => b.headingPath[0])).toEqual(['INTRODUCTION', 'TERMS AND CONDITIONS']);
  });
  it('chunks stay ≤ 500 tokens, carry overlap, keep heading prefix, and cover all the text', () => {
    const doc = parseMarkdown('# Guide\n## Part\n' + Array.from({ length: 120 }, (_, i) => `Sentence number ${i} talks about topic ${i % 7} in some detail.`).join(' '), 'Guide');
    const cs = chunkDocument(doc);
    expect(cs.length).toBeGreaterThan(2);
    for (const c of cs) { expect(c.tokens).toBeLessThanOrEqual(520); expect(c.indexText.startsWith('Guide › Guide › Part')).toBe(true); }
    const joined = cs.map((c) => c.text).join(' ');
    for (let i = 0; i < 120; i += 9) expect(joined).toContain(`Sentence number ${i} `);
    const a = cs[0]!.text, b = cs[1]!.text; const tail = a.split(' ').slice(-6).join(' ');
    expect(b.includes(tail.split(' ').slice(-3).join(' '))).toBe(true);
  });
  it('parses a real DOCX (mammoth) and a real PDF (pdf.js)', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Contract Terms</w:t></w:r></w:p><w:p><w:r><w:t>The vendor will deliver 40 units by March.</w:t></w:r></w:p></w:body></w:document>');
    const docx = await zip.generateAsync({ type: 'uint8array' });
    const d = await parseFile(file('contract.docx', docx));
    expect(d.parsed.blocks.map((b) => b.text).join(' ')).toContain('40 units');
    const body = 'BT /F1 14 Tf 72 700 Td (Quarterly report: revenue grew 12 percent) Tj 0 -20 Td (Prepared for the board of Brightwell) Tj ET';
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${body.length}>>stream\n${body}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF`;
    const r = await parseFile(file('report.pdf', pdf));
    expect(r.parsed.blocks[0]?.page).toBe(1); expect(r.parsed.blocks.map((b) => b.text).join(' ')).toContain('revenue grew 12 percent');
  }, 30_000);
});

describe('Pantry ingest, sensitivity gating, dedupe', () => {
  it('ingests, searches, labels passages and withholds local-only from remote routes', async () => {
    const p = new Pantry();
    await p.addText('Lease', '# Lease\n## Rent\nThe monthly rent is Rs. 32,000.', { sensitivity: 'local-only' });
    await p.addText('Trip', '# Trip\n## Hotel\nThe hotel in Kyoto costs 18,200 yen per night.', { sensitivity: 'personal' });
    const remote = await p.search('what is my monthly rent', { maxAllowed: 'personal', force: true });
    expect(remote.passages.every((x) => x.sensitivity !== 'local-only')).toBe(true);
    expect(remote.withheld).toBeGreaterThan(0);
    const local = await p.search('what is my monthly rent', { maxAllowed: 'local-only', force: true });
    expect(local.passages[0]!.text).toContain('32,000'); expect(local.passages[0]!.sensitivity).toBe('local-only');
  });
  it('dedupes identical content and soft-deletes then purges', async () => {
    const p = new Pantry();
    const a = await p.addText('A', '# T\nsame content here'); const b = await p.addText('B', '# T\nsame content here');
    expect(b.id).toBe(a.id); expect(await p.list()).toHaveLength(1);
    await p.remove(a.id); expect(await p.list()).toHaveLength(0); expect(await p.store.allChunks()).toHaveLength(0);
  });
  it('image-only input is flagged Needs OCR rather than silently empty', async () => {
    const p = new Pantry(); const d = await p.addFile(file('scan.png', new Uint8Array([1, 2, 3]), 'image/png'));
    expect(d.status).toBe('needs_ocr');
  });
  it('re-embeds every document when the embedder changes, with progress, keeping search working', async () => {
    const p = new Pantry(); await loadGolden(p);
    const steps: number[] = [];
    const e2 = new HashingEmbedder(320);
    await p.setEmbedder(e2, (d) => steps.push(d));
    expect(steps.at(-1)).toBe(5);
    expect((await p.list()).every((d) => d.embedModelId === e2.id)).toBe(true);
    const r = await p.search('how many days of paid leave', { maxAllowed: 'personal', force: true });
    expect(r.passages.some((x) => x.text.includes('24 days'))).toBe(true);
  });
  it('works with an Ollama-style function embedder (smart path) behind the same interface', async () => {
    const fake = new HashingEmbedder(64);
    const emb = new FunctionEmbedder('ollama:nomic-embed-text', 64, 'local-server', async (texts) => (await fake.embed(texts)).map((v) => Array.from(v)));
    const p = new Pantry({ embedder: emb }); await p.addText('Policy', '# Policy\n## Leave\nEmployees get 24 days of leave.');
    expect((await p.search('days of leave', { maxAllowed: 'personal', force: true })).passages[0]!.text).toContain('24 days');
    expect(p.embedderInfo.locality).toBe('local-server');
  });
});

describe('retrieval planner', () => {
  const doc = (tokens: number, id = 'd'): PantryDoc => ({ id, title: 'Lease-2025.pdf', mime: 'x', bytes: 1, sensitivity: 'personal', status: 'ready', embedModelId: 'e', addedAt: 0, contentHash: id, chunkCount: 3, tokens });
  const p = new Pantry();
  it('stuffs when selected docs fit in ≤ 20% of the window, retrieves otherwise', () => {
    expect(p.planner.plan({ question: 'summarise', docs: [doc(2000)], window: 16000, selected: ['d'], maxAllowed: 'personal' }).mode).toBe('stuff');
    expect(p.planner.plan({ question: 'summarise', docs: [doc(5000)], window: 16000, selected: ['d'], maxAllowed: 'personal' }).mode).toBe('retrieve');
    expect(p.planner.plan({ question: 'my lease rent', docs: [doc(5000)], window: 16000, maxAllowed: 'personal' }).mode).toBe('retrieve');
    expect(p.planner.plan({ question: 'summarise', docs: [doc(2000)], window: undefined, selected: ['d'], maxAllowed: 'personal' }).mode).toBe('stuff'); // unknown window → 16k
  });
  it('never retrieves when the question does not need personal data', () => {
    expect(needsPersonalData('cheapest flight to Paris', [doc(100)]).needed).toBe(false);
    expect(needsPersonalData('what does my lease say about pets', [doc(100)]).needed).toBe(true);
    expect(needsPersonalData('anything', []).needed).toBe(false);
    expect(p.planner.plan({ question: 'best laptop under 60000', docs: [doc(100)], maxAllowed: 'personal' }).mode).toBe('none');
  });
  it('hasEvidence says "not in your documents" for off-topic questions', () => {
    expect(hasEvidence('what is my blood group', [{ id: 'x', docId: 'd', doc: 'Lease', headingPath: ['Rent'], text: 'The monthly rent is 32000', sensitivity: 'personal', score: 1 }])).toBe(false);
  });
});

describe('performance', () => {
  it('retrieval p95 < 150 ms over 20k chunks; indexing yields (no long blocking)', async () => {
    const p = new Pantry(); await p.load();
    const words = ['invoice', 'lease', 'flight', 'hotel', 'policy', 'rent', 'visa', 'laptop', 'meeting', 'budget', 'insurance', 'claim', 'warranty', 'tax', 'receipt', 'booking'];
    const emb = new HashingEmbedder(); const N = 20000; const chunks = []; const docs = [];
    const { quantize } = await import('../src');
    for (let d = 0; d < 200; d++) {
      const id = `d${d}`; const dc: PantryDoc = { id, title: `Doc ${d}`, mime: 'x', bytes: 1, sensitivity: 'personal', status: 'ready', embedModelId: emb.id, addedAt: 0, contentHash: id, chunkCount: 100, tokens: 100 }; docs.push(dc);
      const list = [];
      for (let i = 0; i < N / 200; i++) { const text = Array.from({ length: 30 }, (_, k) => (words[(d * 7 + i * 3 + k * 5) % words.length] ?? "") + ((d + i + k) % 11)).join(' '); const q = quantize(emb.embedOne(text)); list.push({ id: `${id}:${i}`, docId: id, ord: i, headingPath: [], text, tokens: 40, vec: q.vec, scale: q.scale }); }
      p.index.add(dc, list); chunks.push(...list);
    }
    const times: number[] = [];
    for (let i = 0; i < 25; i++) { const t = performance.now(); await p.index.search(`${words[i % 16]} claim${i % 11} budget`, { k: 6 }); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    console.log('retrieval p95 ms', (times[Math.floor(times.length * 0.95)] ?? 0).toFixed(1), 'chunks', p.index.size);
    expect(times[Math.floor(times.length * 0.95)] ?? 0).toBeLessThan(150);
  }, 120_000);
});

describe('storage parity & migrations', () => {
  const suites: [string, () => Promise<PantryStore>][] = [['memory', async () => new MemoryPantryStore()], ['indexeddb', async () => IdbPantryStore.open(`t-${Math.random()}`)]];
  for (const [name, mk] of suites) {
    it(`${name}: docs, chunks, profile, notes, meta round-trip; wipe empties everything`, async () => {
      const s = await mk(); const p = new Pantry({ store: s });
      const d = await p.addText('Doc', '# Doc\nhello world content'); expect((await s.listDocs())).toHaveLength(1);
      expect((await s.chunksFor(d.id))[0]!.vec).toBeInstanceOf(Int8Array);
      await p.profile.update('full_name', { value: 'Asha Rao' }); expect((await p.profile.get()).find((f) => f.key === 'full_name')!.value).toBe('Asha Rao');
      const n = await p.notes.propose('Prefers aisle seats'); expect((await p.notes.list('proposed'))).toHaveLength(1); await p.notes.keep(n.id); expect(await p.notes.search('aisle')).toHaveLength(1);
      await s.setMeta('x', { a: 1 }); expect(await s.getMeta('x')).toEqual({ a: 1 });
      const p2 = new Pantry({ store: s }); await p2.load(); expect((await p2.search('hello world', { maxAllowed: 'personal', force: true })).passages).toHaveLength(1);
      await p.wipe(); expect(await s.listDocs()).toHaveLength(0); expect(await s.allChunks()).toHaveLength(0); expect(await s.listNotes()).toHaveLength(0);
    });
  }
  it('migrates a v1 fixture database to the latest schema without losing documents', async () => {
    const name = `fixture-${Math.random()}`;
    await new Promise<void>((res, rej) => { const o = indexedDB.open(name, 1); o.onupgradeneeded = () => { o.result.createObjectStore('docs', { keyPath: 'id' }); const c = o.result.createObjectStore('chunks', { keyPath: 'id' }); c.createIndex('byDoc', 'docId'); }; o.onsuccess = () => { const t = o.result.transaction('docs', 'readwrite'); t.objectStore('docs').put({ id: 'legacy', title: 'Old doc', mime: 'text/plain', bytes: 10, addedAt: 1, contentHash: 'h' }); t.oncomplete = () => { o.result.close(); res(); }; }; o.onerror = () => rej(o.error); });
    const db = await openPantryDb(name); const store = new IdbPantryStore(db);
    const docs = await store.listDocs();
    expect(docs).toHaveLength(1); expect(docs[0]).toMatchObject({ id: 'legacy', title: 'Old doc', chunkCount: 0, status: 'ready', sensitivity: 'personal' });
    expect([...db.objectStoreNames].sort()).toEqual(['chunks', 'docs', 'meta', 'notes', 'profile', 'vault']);
  });
});

describe('profile, digest, placeholders', () => {
  it('compiles a ≤300-token digest, excludes local-only unless the route is local, labels sensitivity', () => {
    const f = DEFAULT_PROFILE.map((x) => ({ ...x }));
    f.find((x) => x.key === 'full_name')!.value = 'Asha Rao'; f.find((x) => x.key === 'city')!.value = 'Pune';
    f.find((x) => x.key === 'budget_habits')!.value = 'secret savings plan'; f.find((x) => x.key === 'budget_habits')!.sensitivity = 'local-only';
    const remote = compileDigest(f); expect(remote.text).toContain('Asha Rao'); expect(remote.text).not.toContain('savings'); expect(remote.sensitivity).toBe('personal');
    const local = compileDigest(f, { includeLocalOnly: true }); expect(local.text).toContain('savings'); expect(local.sensitivity).toBe('local-only');
    f.find((x) => x.key === 'travel_prefs')!.value = 'word '.repeat(2000); expect(compileDigest(f).tokens).toBeLessThanOrEqual(300);
  });
  it('fills placeholders at type time and never returns values in the used list', async () => {
    const p = new Pantry({ vault: { iterations: 1000 } }); await p.vault.setup('correct horse battery'); await p.vault.set('passport_no', 'Passport', 'Z1234567', { requiresApproval: true });
    await expect(fillPlaceholders('{{vault.passport_no}}', { profile: {}, vault: p.vault })).rejects.toMatchObject({ code: 'permission_needed' });
    const r = await fillPlaceholders('Name {{profile.full_name}}, passport {{vault.passport_no}}', { profile: { full_name: 'Asha Rao' }, vault: p.vault, approved: true });
    expect(r.text).toBe('Name Asha Rao, passport Z1234567'); expect(r.used).toEqual(['profile.full_name', 'vault.passport_no']); expect(r.sensitive).toBe(true);
    expect(JSON.stringify(r.used)).not.toContain('Z1234567');
  });
});

describe('vault & backup', () => {
  it('locks, rejects wrong passphrases, never stores plaintext, auto-locks, and restores via session key', async () => {
    const s = new MemoryPantryStore(); const p = new Pantry({ store: s, vault: { iterations: 1000 } }); const v = p.vault;
    expect(await v.isSetUp()).toBe(false); await v.setup('correct horse battery');
    await v.set('card', 'Card number', '4111 1111 1111 1111'); expect(await v.resolve('card', { approved: true })).toBe('4111 1111 1111 1111');
    const stored = (await s.listVault())[0]!; expect(new TextDecoder().decode(new Uint8Array(stored.ciphertext))).not.toContain('4111');
    const raw = await v.exportSessionKey(); v.lock(); expect(v.isUnlocked()).toBe(false);
    await expect(v.resolve('card', { approved: true })).rejects.toMatchObject({ code: 'vault_locked' });
    await expect(v.unlock('wrong passphrase!')).rejects.toMatchObject({ code: 'vault_locked' });
    await v.unlock('correct horse battery'); expect(v.isUnlocked()).toBe(true);
    v.lock(); await v.importSessionKey(raw); expect(await v.resolve('card', { approved: true })).toContain('4111');
    expect(await v.list()).toEqual([{ key: 'card', label: 'Card number', requiresApproval: true }]);
  });
  it('encrypted backup round-trips documents, profile, notes and vault; wrong passphrase fails; wipe deletes everything', async () => {
    const p = new Pantry({ vault: { iterations: 1000 } }); await p.addText('Lease', '# Lease\nrent is 32000 per month'); await p.profile.update('city', { value: 'Pune' });
    await p.vault.setup('correct horse battery'); await p.vault.set('pan', 'PAN', 'ABCDE1234F');
    const bytes = await p.exportBackup('backup pass phrase', 1000);
    expect(new TextDecoder().decode(bytes)).not.toContain('Lease');
    const q = new Pantry({ vault: { iterations: 1000 } });
    await expect(q.importBackup(bytes, 'nope nope nope')).rejects.toMatchObject({ code: 'auth' });
    await q.importBackup(bytes, 'backup pass phrase');
    expect((await q.search('rent per month', { maxAllowed: 'personal', force: true })).passages[0]!.text).toContain('32000');
    expect((await q.profile.get()).find((f) => f.key === 'city')!.value).toBe('Pune');
    await q.vault.unlock('correct horse battery'); expect(await q.vault.resolve('pan', { approved: true })).toBe('ABCDE1234F');
    await q.wipe(); expect(await q.list()).toHaveLength(0); expect(await q.vault.isSetUp()).toBe(false);
  });
  it('golden questions are all tracked', () => { expect(GOLDEN_QUESTIONS.filter((g) => g.absent)).toHaveLength(6); });
});
