import { detectInjection } from '@fruitfly/egress';
import type { ElementRef } from './browser';

export type ActionLevel = 'none' | 'confirm' | 'sensitive';
export interface ActionVerdict { level: ActionLevel; reason: string; category?: 'purchase' | 'send' | 'delete' | 'auth' | 'personal-data' | 'payment-field' | 'sensitive-site' | 'submit' | 'vault' }

const PURCHASE = /\b(buy now|place (your )?order|pay now|pay\b|complete (purchase|order)|confirm (order|payment|purchase)|checkout|purchase|proceed to payment|subscribe|donate|book now|reserve)\b/i;
const HARD_PURCHASE = /\b(place (your )?order|pay now|pay\b|confirm (order|payment|purchase)|complete (purchase|order)|buy now)\b/i;
const SEND = /\b(send|post|publish|reply|tweet|email|share)\b/i;
const DELETE = /\b(delete|remove account|close account|erase|cancel (subscription|order|booking)|unsubscribe)\b/i;
const AUTH = /\b(sign in|log in|login|sign up|register|create account)\b/i;
const TRANSFER = /\b(transfer|send money|wire|withdraw)\b/i;
const PAYMENT_FIELD = /\b(card|cvv|cvc|expiry|otp|pin|password|passcode|ssn|aadhaar|pan|iban|account number|routing)\b/i;

export const SENSITIVE_SITES = [/(^|\.)(hdfcbank|icicibank|sbi\.co|axisbank|kotak|paytm|phonepe|paypal|stripe|chase|wellsfargo|bankofamerica|hsbc|citi|barclays)\./i, /\.(bank)$/i, /(^|\.)(gov\.in|irs\.gov|incometax|uidai|nhs\.uk)\b/i, /(^|\.)(mychart|patient|health)\./i];

export function isSensitiveSite(url: string): boolean {
  try { const h = new URL(url).hostname; return SENSITIVE_SITES.some((r) => r.test(h)); } catch { return false; }
}

export interface ActionInfo { tool: string; args: Record<string, unknown>; element?: ElementRef; url?: string }

/** Classify an action before it runs. This lives in the tool layer: the model cannot opt out of it. */
export function classifyAction(a: ActionInfo): ActionVerdict {
  const el = a.element; const label = `${el?.label ?? ''} ${el?.text ?? ''}`.trim();
  const url = a.url ?? '';
  switch (a.tool) {
    case 'click': {
      if (!el) return { level: 'none', reason: '' };
      if (TRANSFER.test(label)) return { level: 'sensitive', reason: `This looks like a money transfer: "${el.label}".`, category: 'purchase' };
      if (HARD_PURCHASE.test(label)) return { level: 'sensitive', reason: `This will place an order or take payment: "${el.label}".`, category: 'purchase' };
      if (PURCHASE.test(label)) return { level: 'confirm', reason: `This moves toward buying: "${el.label}".`, category: 'purchase' };
      if (DELETE.test(label)) return { level: 'sensitive', reason: `This deletes or cancels something: "${el.label}".`, category: 'delete' };
      if (AUTH.test(label)) return { level: 'confirm', reason: `This signs in or creates an account: "${el.label}".`, category: 'auth' };
      if (SEND.test(label) && el.role === 'button') return { level: 'confirm', reason: `This sends or posts something: "${el.label}".`, category: 'send' };
      if (/\b(submit|confirm|continue to (payment|review))\b/i.test(label) && el.formId) return { level: 'confirm', reason: `This submits a form: "${el.label}".`, category: 'submit' };
      if (isSensitiveSite(url) && el.role === 'button') return { level: 'confirm', reason: 'This is a sensitive site.', category: 'sensitive-site' };
      return { level: 'none', reason: '' };
    }
    case 'type': case 'select_option': {
      const text = String(a.args.text ?? a.args.value ?? '');
      if (/\{\{\s*vault\./i.test(text)) return { level: 'sensitive', reason: `This fills a private vault field into "${el?.label ?? 'a field'}".`, category: 'vault' };
      if (el && (el.type === 'password' || PAYMENT_FIELD.test(`${el.label} ${el.name ?? ''} ${el.placeholder ?? ''}`))) return { level: 'sensitive', reason: `"${el.label}" asks for a secret or payment detail.`, category: 'payment-field' };
      if (/\{\{\s*profile\./i.test(text)) return { level: 'confirm', reason: `This fills your personal info into "${el?.label ?? 'a field'}".`, category: 'personal-data' };
      if (isSensitiveSite(url)) return { level: 'confirm', reason: 'This is a sensitive site.', category: 'sensitive-site' };
      return { level: 'none', reason: '' };
    }
    case 'navigate': case 'open_tab': {
      const u = String(a.args.url ?? '');
      if (isSensitiveSite(u)) return { level: 'confirm', reason: 'This opens a sensitive site (bank, government or health).', category: 'sensitive-site' };
      return { level: 'none', reason: '' };
    }
    default: return { level: 'none', reason: '' };
  }
}

export interface PageScan { injections: { label: string; excerpt: string }[] }
export function scanPage(text: string): PageScan { return { injections: detectInjection(text) }; }

/** Per-site grants: the agent only acts on sites the user allowed. */
export interface SitePolicy { isAllowed(url: string): boolean | Promise<boolean> }
export const allowAllSites: SitePolicy = { isAllowed: () => true };
export function hostOf(url: string): string { try { return new URL(url).hostname; } catch { return ''; } }
