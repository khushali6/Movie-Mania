/** Small, boring query expansion so the lexical/hashing path survives common paraphrases. The "Smart" embedders make this redundant. */
const GROUPS: string[][] = [
  ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'animal', 'animals'],
  ['flat', 'apartment', 'house', 'home', 'unit', 'premises'],
  ['landlord', 'lessor', 'owner'], ['tenant', 'lessee', 'renter'],
  ['rent', 'rental', 'lease'], ['deposit', 'advance', 'security'],
  ['cost', 'price', 'fee', 'charge', 'amount', 'paid', 'pay', 'spend', 'spent'],
  ['bill', 'invoice', 'receipt'], ['pending', 'unpaid', 'overdue', 'due', 'outstanding'],
  ['leave', 'vacation', 'holiday', 'pto'], ['wfh', 'remote', 'home'],
  ['insurance', 'insurer', 'policy', 'cover', 'coverage'], ['hospital', 'hospitalisation', 'admission'],
  ['flight', 'plane', 'airline', 'depart', 'departure'], ['hotel', 'stay', 'guesthouse', 'accommodation'],
  ['allergic', 'allergy', 'allergies'], ['visa', 'permit'], ['budget', 'spending', 'allowance'],
  ['notice', 'warning'], ['quit', 'resign', 'leaving', 'exit'], ['laptop', 'computer', 'notebook'],
  ['review', 'appraisal', 'evaluation'], ['course', 'training', 'learning', 'conference', 'books'],
  ['dentist', 'dental', 'tooth', 'teeth'], ['electricity', 'power', 'msedcl'], ['internet', 'broadband', 'wifi'],
];
const INDEX = new Map<string, string[]>();
for (const g of GROUPS) for (const w of g) INDEX.set(w, g.filter((x) => x !== w));

export function expandQuery(q: string, limit = 3): string {
  const extra = new Set<string>();
  for (const w of q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) for (const s of (INDEX.get(w) ?? []).slice(0, limit)) extra.add(s);
  const have = new Set(q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const add = [...extra].filter((x) => !have.has(x));
  return add.length ? `${q} ${add.join(' ')}` : q;
}
