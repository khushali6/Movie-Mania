import { Pantry, GOLDEN_DOCS } from '@fruitfly/pantry';

/** Seeded fake profile + 3 fake documents so Pantry works in demo mode with no files. Nothing here is real. */
export async function seedDemoPantry(p: Pantry): Promise<void> {
  const profile: [string, string][] = [['full_name', 'Asha Rao'], ['city', 'Pune'], ['currency', 'INR'], ['budget_habits', 'Looks for the best value, not the lowest price. Avoids EMI.'], ['travel_prefs', 'Aisle seat, vegetarian meals, prefers non-stop flights when the fare gap is under ₹5,000.'], ['email', 'asha.rao@example.com']];
  for (const [k, v] of profile) await p.profile.update(k, { value: v });
  await p.profile.update('standing_instructions', { value: 'Prefer free delivery.\nAsk before spending more than ₹10,000.\nShow prices in INR.' });
  const wanted = ['Lease-2025', 'Invoices-Q3', 'Japan-Trip-Notes'];
  for (const d of GOLDEN_DOCS.filter((x) => wanted.includes(x.title))) await p.addText(d.title, d.text, { sensitivity: d.title === 'Lease-2025' ? 'local-only' : 'personal', kind: d.kind });
}
