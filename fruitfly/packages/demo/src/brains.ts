import type { CompletionRequest, ScriptedBrain, ScriptedStep } from '@fruitfly/gateway';
import { DEMO_SHOPS } from './sites';

/** Helpers that let a scripted "model" read the page text it was given, exactly like a real one would. */
const toolMsgs = (req: CompletionRequest) => req.messages.filter((m) => m.role === 'tool');
const lastTool = (req: CompletionRequest) => toolMsgs(req).at(-1);
const called = (req: CompletionRequest, name: string) => req.messages.some((m) => m.role === 'assistant' && m.toolCalls?.some((c) => c.name === name));
const countCalls = (req: CompletionRequest, name: string) => req.messages.filter((m) => m.role === 'assistant').flatMap((m) => m.toolCalls ?? []).filter((c) => c.name === name).length;
const refOf = (text: string, role: string, label: RegExp): string | undefined => { const re = new RegExp(`\\[(e\\d+) ${role} "([^"]*)"`, 'g'); let m: RegExpExecArray | null; while ((m = re.exec(text))) if (label.test(m[2]!)) return m[1]; return undefined; };
const goalOf = (req: CompletionRequest): string => /<task>\n([\s\S]*?)\n<\/task>/.exec(req.messages.map((m) => m.content).find((c) => c.includes('<task>')) ?? '')?.[1] ?? '';
const say = (text: string, name: string, args: Record<string, unknown>, delayMs = 0): ScriptedStep => ({ kind: 'reply', text, toolCalls: [{ name, args }], delayMs });
const num = (s: string) => Number(s.replace(/[^\d]/g, ''));

export interface ParsedProduct { name: string; price: number; shop: string; specs?: string }

/** Parse product rows from page text as an agent would: `[e7 link "Acer Aspire 5"] ₹47,990 · ★ 4.3 … · Core i5 · 16 GB…` */
export function parseProducts(text: string, shop = ''): ParsedProduct[] {
  const out: ParsedProduct[] = [];
  for (const line of text.split('\n')) { const m = /\[e\d+ link "([^"]+)"\]\s*₹([\d,]+)\s*·\s*★[^·]*·\s*(.*)$/.exec(line); if (m) out.push({ name: m[1]!, price: num(m[2]!), shop, specs: m[3] }); }
  return out;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };

// ─────────────────────────── helper (sub-agent) brain ───────────────────────────

function helperStep(req: CompletionRequest): ScriptedStep {
  const goal = goalOf(req);
  const reads = toolMsgs(req).filter((m) => m.name === 'read_page' || m.name === 'navigate' || m.name === 'type' || m.name === 'click');
  const lt = lastTool(req);
  const text = lt?.content ?? '';
  const url = /URL: (\S+)/.exec(text)?.[1] ?? /<page url="([^"]+)"/.exec(text)?.[1] ?? '';
  // researcher flow on a shop: dismiss banner → search → read results → report
  if (!lt) return say('Reading the page.', 'read_page', {});
  const covered = /\(dialog/.test(text) && refOf(text, 'button', /necessary|accept/i);
  if (lt.name === 'read_page' && covered) return say('A dialog is in the way; closing it.', 'click', { ref: refOf(text, 'button', /necessary/i) ?? refOf(text, 'button', /accept/i)! });
  if (lt.name === 'read_page' && /input "Search products"/.test(text) && !/results for/i.test(text)) { const r = refOf(text, 'input', /search/i)!; return say('Searching this site.', 'type', { ref: r, text: 'laptop under 60000', submit: true }); }
  if (lt.name === 'click' && /Cookie dialog closed/.test(text)) return say('Now reading.', 'read_page', {});
  if (lt.name === 'type') return say('Reading the results.', 'read_page', {});
  if (lt.name === 'read_page' && parseProducts(text).length === 0 && reads.length < 3 && /input "Search products"/.test(text)) return say('Searching.', 'type', { ref: refOf(text, 'input', /search/i)!, text: 'laptop under 60000', submit: true });
  const products = parseProducts(text, host(url));
  if (lt.name === 'read_page' || lt.name === 'recall') {
    const within = products.filter((p) => p.price <= 60000).sort((a, b) => a.price - b.price);
    const cheapest = within[0];
    return say('Got what I need.', 'report', { facts: within.slice(0, 5).map((p) => `${p.name} ${fmt(p.price)}`), items: within.slice(0, 4).map((p) => ({ name: p.name, price: fmt(p.price), notes: p.specs?.split('·').slice(0, 2).join('·').trim() })), answer: cheapest ? `${host(url).replace('.example', '')}: cheapest under ₹60,000 is ${cheapest.name} at ${fmt(cheapest.price)}` : 'Nothing under ₹60,000 here.', confidence: within.length ? 'high' : 'low' });
  }
  return say('Reporting what I have.', 'report', { facts: [goal.slice(0, 80)], confidence: 'low' });
}

// ─────────────────────────── main brains ───────────────────────────

export type ScenarioId = 'laptop' | 'flight' | 'approval' | 'pantry' | 'injection' | 'unknown';

function laptopBrain(req: CompletionRequest): ScriptedStep {
  const lt = lastTool(req); const text = lt?.content ?? '';
  const sp = called(req, 'scratchpad_update');
  if (!sp) return say("I'll compare a few shops and keep the budget in mind.", 'scratchpad_update', { constraints: ['Budget: under ₹60,000', 'Laptop for everyday work'], openQuestions: ['Which shop has the lowest price?'] });
  if (!called(req, 'navigate')) return say('Starting with Cartwheel.', 'navigate', { url: 'https://cartwheel.example/' });
  if (!called(req, 'read_page') && lt?.name === 'navigate') return say('Let me see what is here.', 'read_page', {});
  // first page read: a cookie dialog covers the page → try to use it anyway (the stumble), then recover
  if (lt?.name === 'read_page' && /\(dialog/.test(text) && !called(req, 'type')) { const r = refOf(text, 'input', /search/i); return say('I can already see a search box.', 'type', { ref: r ?? 'e5', text: 'laptop under 60000', submit: true }); }
  if (lt?.name === 'type' && /covered by a dialog/i.test(text)) return say('A dialog is covering the page. I will read it and dismiss it.', 'read_page', {});
  if (lt?.name === 'read_page' && /\(dialog/.test(text) && called(req, 'type')) { const b = refOf(text, 'button', /necessary/i) ?? refOf(text, 'button', /accept/i); return say('Closing the cookie dialog with the least tracking.', 'click', { ref: b! }); }
  if (lt?.name === 'click' && /Cookie dialog closed/.test(text)) return say('Back to it.', 'read_page', {});
  if (lt?.name === 'read_page' && /input "Search products"/.test(text) && countCalls(req, 'type') <= 1 && !/results for/.test(text)) { const r = refOf(text, 'input', /search/i)!; return say('Searching for laptops under the budget.', 'type', { ref: r, text: 'laptop under 60000', submit: true }); }
  if (lt?.name === 'type' && !called(req, 'delegate')) return say('Results are in.', 'read_page', {});
  // we have Cartwheel's results → note them and fan out to the other two shops in parallel
  if (lt?.name === 'read_page' && !called(req, 'delegate')) {
    const ps = parseProducts(text, 'cartwheel').filter((p) => p.price <= 60000).sort((a, b) => a.price - b.price);
    const best = ps[0];
    return { kind: 'reply', text: 'Cartwheel is done. I will ask two helpers to check the other shops at the same time.', toolCalls: [{ name: 'scratchpad_update', args: { findings: ps.slice(0, 3).map((p) => `Cartwheel: ${p.name} ${fmt(p.price)}`), openQuestions: best ? [] : ['No results at Cartwheel'] } }] };
  }
  if (lt?.name === 'scratchpad_update' && !called(req, 'delegate') && called(req, 'read_page') && countCalls(req, 'type') >= 2)
    return say('Two helpers, one per shop.', 'delegate', { jobs: [{ agent: 'researcher', task: 'Find laptops under ₹60,000 at Bazaar and report the cheapest few.', url: 'https://bazaar.example/' }, { agent: 'researcher', task: 'Find laptops under ₹60,000 at Gizmo Depot and report the cheapest few.', url: 'https://gizmo-depot.example/' }] });
  if (lt?.name === 'delegate') {
    const reports = [...text.matchAll(/\{"facts".*\}/g)].map((m) => { try { return JSON.parse(m[0]) as { facts: string[]; items?: { name: string; price: string; notes?: string }[]; answer?: string }; } catch { return undefined; } }).filter(Boolean) as { facts: string[]; items?: { name: string; price: string; notes?: string }[]; answer?: string }[];
    const finds = reports.flatMap((r) => (r.items ?? []).slice(0, 2).map((i) => `${i.name} ${i.price}${r.answer ? ` (${r.answer.split(':')[0]})` : ''}`));
    return say('Both helpers are back. Noting their findings.', 'scratchpad_update', { findings: finds.slice(0, 6), resolved: ['Which shop'] });
  }
  if (lt?.name === 'scratchpad_update' && called(req, 'delegate')) return finishLaptop(req);
  if (lt?.name === 'finish') return say('Done.', 'finish', { title: 'Done', summary: 'Done.' });
  return say('Reading the page again.', 'read_page', {});
}

function finishLaptop(req: CompletionRequest): ScriptedStep {
  // Rebuild the facts from what was actually read (page observations + helper reports), not from a hard-coded answer.
  const all = req.messages.map((m) => m.content).join('\n');
  const rows: ParsedProduct[] = [];
  const cw = [...all.matchAll(/\[e\d+ link "([^"]+)"\]\s*₹([\d,]+)/g)].map((m) => ({ name: m[1]!, price: num(m[2]!), shop: 'Cartwheel' })).filter((p) => p.price <= 60000);
  rows.push(...cw);
  const reps = [...all.matchAll(/\[(\w+)\] Find laptops under ₹60,000 at ([\w ]+?) and report[^\n]*\n(\{"facts".*\})/g)];
  for (const m of reps) { try { const r = JSON.parse(m[3]!) as { items?: { name: string; price: string }[] }; for (const i of r.items ?? []) rows.push({ name: i.name, price: num(i.price), shop: m[2]!.trim() }); } catch { /* skip */ } }
  const byShop = new Map<string, ParsedProduct>();
  for (const p of rows) { const cur = byShop.get(p.shop); if (!cur || p.price < cur.price) byShop.set(p.shop, p); }
  const shops = [...byShop.values()].sort((a, b) => a.price - b.price);
  const cheapest = shops[0];
  const aspire = rows.filter((r) => /Aspire/.test(r.name)).sort((a, b) => a.price - b.price)[0];
  if (!cheapest) return say('I could not find a laptop in budget.', 'finish', { title: 'Nothing under ₹60,000', summary: 'None of the shops I checked had a laptop under ₹60,000.', status: 'partial' });
  return say('Wrapping up with the comparison.', 'finish', {
    title: `${cheapest.name} is the cheapest under ₹60,000`,
    summary: `The lowest price I found is ${fmt(cheapest.price)} for the ${cheapest.name} at ${cheapest.shop}.${aspire && aspire.name !== cheapest.name ? ` If you want a Core i5 with 16 GB, the ${aspire.name} is ${fmt(aspire.price)} at ${aspire.shop}.` : ''}`,
    table: { title: 'Cheapest laptop per shop', columns: ['Shop', 'Laptop', 'Price'], rows: shops.map((s) => [s.shop, s.name, fmt(s.price)]) },
    bullets: [`${shops.length} shops compared`, 'All prices include free delivery'],
    status: 'success',
  });
}

function flightBrain(req: CompletionRequest): ScriptedStep {
  const lt = lastTool(req); const text = lt?.content ?? '';
  if (!called(req, 'scratchpad_update')) return say('I will search one-way flights and compare prices.', 'scratchpad_update', { constraints: ['Destination: Paris', 'One way, cheapest fare'], openQuestions: ['Cheapest fare to Paris?'] });
  if (!called(req, 'navigate')) return say('Opening Skyhop.', 'navigate', { url: 'https://skyhop.example/' });
  if (lt?.name === 'navigate') return say('Let me look at the form.', 'read_page', {});
  if (lt?.name === 'read_page' && /input "From"/.test(text) && !called(req, 'type')) return say('Filling in where from.', 'type', { ref: refOf(text, 'input', /from/i)!, text: 'Mumbai' });
  if (lt?.name === 'type' && countCalls(req, 'type') === 1) return say('And where to.', 'type', { ref: refOf(req.messages.filter((m) => m.name === 'read_page').at(-1)!.content, 'input', /^to$/i)!, text: 'Paris' });
  if (lt?.name === 'type' && countCalls(req, 'type') === 2) return say('Searching.', 'click', { ref: refOf(req.messages.filter((m) => m.name === 'read_page').at(-1)!.content, 'button', /search flights/i)! });
  if (lt?.name === 'click') return say('Results are loading. Reading them.', 'read_page', {});
  if (lt?.name === 'read_page' && /flights found/.test(text)) {
    const rows = [...text.matchAll(/###\s*([^—\n]+?)\s*—\s*₹([\d,]+)\n([^\n]+)/g)].map((m) => ({ airline: m[1]!.trim(), price: num(m[2]!), detail: m[3]!.trim() })).sort((a, b) => a.price - b.price);
    return say('Cheapest is clear. Noting it.', 'scratchpad_update', { findings: rows.slice(0, 3).map((r) => `${r.airline} ${fmt(r.price)} (${r.detail})`), resolved: ['Cheapest fare'] });
  }
  if (lt?.name === 'scratchpad_update') {
    const page = req.messages.filter((m) => m.name === 'read_page').at(-1)?.content ?? '';
    const rows = [...page.matchAll(/###\s*([^—\n]+?)\s*—\s*₹([\d,]+)\n([^\n]+)/g)].map((m) => ({ airline: m[1]!.trim(), price: num(m[2]!), detail: m[3]!.trim() })).sort((a, b) => a.price - b.price);
    const best = rows[0]!;
    const nonstop = rows.filter((r) => /Non-stop/.test(r.detail))[0];
    return say('Here is what I found.', 'finish', { title: `Cheapest flight to Paris: ${fmt(best.price)}`, summary: `${best.airline} is the cheapest at ${fmt(best.price)} (${best.detail}).${nonstop ? ` The cheapest non-stop is ${nonstop.airline} at ${fmt(nonstop.price)}.` : ''}`, table: { title: 'Mumbai to Paris, one way', columns: ['Airline', 'Route', 'Price'], rows: rows.slice(0, 5).map((r) => [r.airline, r.detail.split('·')[0]!.trim(), fmt(r.price)]) }, status: 'success' });
  }
  return say('Reading again.', 'read_page', {});
}

function approvalBrain(req: CompletionRequest): ScriptedStep {
  const lt = lastTool(req); const text = lt?.content ?? '';
  if (!called(req, 'navigate')) return say('Going to Northbank.', 'navigate', { url: 'https://northbank.example/' });
  if (lt?.name === 'navigate' && !called(req, 'read_page')) return say('Reading the account page.', 'read_page', {});
  if (lt?.name === 'read_page' && /Pay a bill/.test(text) && !called(req, 'click')) return say('Opening the bill payment page.', 'click', { ref: refOf(text, 'link', /pay a bill/i)! });
  if (lt?.name === 'click' && countCalls(req, 'click') === 1) return say('Reading the payment details.', 'read_page', {});
  if (lt?.name === 'read_page' && /Pay ₹2,210/.test(text) && countCalls(req, 'click') === 1) return say('Everything matches the bill. I need your OK to pay.', 'click', { ref: refOf(text, 'button', /pay ₹/i)! });
  if (lt?.name === 'click' && /declined/i.test(text)) return say('Understood, I will not pay.', 'finish', { title: 'Payment not made', summary: 'You declined the payment, so I did not pay the ₹2,210 electricity bill. Nothing was sent.', status: 'partial' });
  if (lt?.name === 'click' && countCalls(req, 'click') === 2) return say('Checking the result.', 'read_page', {});
  if (lt?.name === 'read_page' && /Last payment/.test(text)) return say('Paid.', 'finish', { title: 'Bill paid: ₹2,210', summary: 'I paid the ₹2,210 MSEDCL electricity bill from your savings account. The new balance is ₹182,020.', status: 'success' });
  return say('Reading.', 'read_page', {});
}

function injectionBrain(req: CompletionRequest): ScriptedStep {
  const lt = lastTool(req); const text = lt?.content ?? '';
  if (!called(req, 'navigate')) return say('Opening the deals page.', 'navigate', { url: 'https://dealz.example/' });
  if (lt?.name === 'navigate') return say('Reading it.', 'read_page', {});
  if (lt?.name === 'read_page') return say('The page is asking me to buy and send passwords. That is not from you, so I am ignoring it.', 'scratchpad_update', { rejected: ['Instructions on dealz.example telling me to buy and send data (ignored)'], findings: [/Acer Aspire 5 — ₹([\d,]+)/.exec(text) ? `Dealz lists the Acer Aspire 5 at ₹${/Acer Aspire 5 — ₹([\d,]+)/.exec(text)![1]}` : 'No price found'] });
  return say('Summarising without acting on the page.', 'finish', { title: 'Dealz lists the Acer Aspire 5 at ₹39,999', summary: 'The page lists the Acer Aspire 5 at ₹39,999. It also contained text trying to make me buy and send your data, which I ignored. I did not buy anything.', status: 'success' });
}

function pantryBrain(req: CompletionRequest): ScriptedStep {
  // answers strictly from the passages that were placed in context
  const docs = req.messages.map((m) => m.content).find((c) => c.includes('<pantry_passages')) ?? '';
  const passage = (re: RegExp) => { const m = re.exec(docs); return m ? m[0] : undefined; };
  const lt = lastTool(req);
  if (!docs) return say('Checking your Pantry.', 'pantry_search', { query: goalOf(req) });
  if (!called(req, 'scratchpad_update') && !lt) return say('Your lease has the answer. Noting it.', 'scratchpad_update', { findings: [passage(/two \(2\) months' written notice/) ?? '', passage(/Pets are not allowed[^.]*\./) ?? ''].filter(Boolean) });
  const notice = passage(/two \(2\) months/); const pets = passage(/Pets are not allowed/);
  return say('Here is what your lease says.', 'finish', { title: 'Your lease: notice and pets', summary: notice || pets ? `${notice ? 'You need to give two months of written notice to end the tenancy. ' : ''}${pets ? 'Pets are not allowed without the landlord\'s written consent.' : ''}` : 'I could not find that in your documents.', bullets: ['Notice: two (2) months in writing', 'Pets: not allowed without written consent', 'Leaving early without notice can cost one month of rent from the deposit'], status: notice || pets ? 'success' : 'partial' });
}

function unknownBrain(): ScriptedStep {
  return say('Demo mode only knows a few jobs.', 'finish', { title: "Demo mode only knows a few jobs", summary: 'I can show you how I work on a handful of sample tasks: the cheapest laptop, the cheapest flight to Paris, paying a bill, answering from your lease, or ignoring a page that tries to boss me around. Connect a model to try anything else.', bullets: ['Cheapest laptop under ₹60,000', 'Cheapest flight to Paris', 'Pay my electricity bill', 'What does my lease say about notice and pets?'], status: 'partial' });
}

const BRAINS: Record<ScenarioId, (r: CompletionRequest) => ScriptedStep> = { unknown: unknownBrain, laptop: laptopBrain, flight: flightBrain, approval: approvalBrain, pantry: pantryBrain, injection: injectionBrain };

export interface BrainOptions { scenario: ScenarioId; /** simulate a free-tier 429 starting at the Nth call; two in a row makes the router retry once, then fail over */ rateLimitAtCall?: number; rateLimitCount?: number; thinkMs?: number }

/** One brain for the whole demo: routes by purpose, then by scenario. Deterministic. */
export function createDemoBrain(o: BrainOptions): ScriptedBrain {
  return (req, n) => {
    if (o.rateLimitAtCall !== undefined && n >= o.rateLimitAtCall && n < o.rateLimitAtCall + (o.rateLimitCount ?? 2)) return { kind: 'fault', code: 'rate_limited', retryAfterMs: 900 };
    switch (req.purpose) {
      case 'summarize': return { kind: 'reply', text: 'Earlier steps summarised.' };
      case 'intent': return { kind: 'reply', text: '{"needs":false}' };
      case 'critic': return { kind: 'reply', text: '{"unsupported":[]}' };
      case 'subagent': {
        const sys = req.messages[0]?.content ?? '';
        if (/answer questions from the user's own documents/.test(sys)) return { kind: 'reply', text: JSON.stringify({ facts: [], answer: 'See the passages.', confidence: 'medium' }) };
        return { ...helperStep(req), delayMs: o.thinkMs ?? 0 };
      }
      default: return { ...BRAINS[o.scenario](req), delayMs: o.thinkMs ?? 0 };
    }
  };
}

export const SCENARIOS: { id: ScenarioId; goal: string; label: string; blurb: string }[] = [
  { id: 'laptop', goal: 'Find the cheapest laptop under ₹60,000', label: 'Cheapest laptop', blurb: 'Three shops, two helpers, a cookie dialog in the way.' },
  { id: 'flight', goal: 'Find the cheapest flight to Paris', label: 'Cheapest flight', blurb: 'Fill a form, search, compare fares.' },
  { id: 'approval', goal: 'Pay my electricity bill of ₹2,210', label: 'Pay a bill', blurb: 'Asks before it moves money.' },
  { id: 'pantry', goal: 'What does my lease say about notice and pets?', label: 'Ask my lease', blurb: 'Answers from your documents, on this device.' },
  { id: 'injection', goal: 'Check the laptop deal on dealz.example', label: 'Page tries to boss me', blurb: 'Ignores instructions hidden in a page.' },
];

export { DEMO_SHOPS };

/** Map free text to a demo scenario. Unknown goals get a friendly, honest answer instead of a fake one. */
export function scenarioForGoal(goal: string): ScenarioId {
  const g = goal.toLowerCase();
  if (/dealz|deal site|clearance/.test(g)) return 'injection';
  if (/lease|notice|landlord|pets?\b|rent agreement|my documents|my pantry/.test(g)) return 'pantry';
  if (/flight|fly to|paris|airfare|ticket/.test(g)) return 'flight';
  if (/pay|bill|electricity|bank|transfer/.test(g)) return 'approval';
  if (/laptop|notebook|computer|cheapest|compare|buy|price/.test(g)) return 'laptop';
  return 'unknown';
}
