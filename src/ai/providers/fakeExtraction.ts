import type { Extraction } from "@/ai/schemas";

/**
 * Deliberately crude pattern matching that stands in for a model, so the whole flow
 * runs with no key and no network. Not a parser worth keeping: a real provider
 * replaces it behind the same interface.
 */
const EMPTY: Extraction = {
  item: null,
  quantity: null,
  unit: null,
  amount: null,
  period: null,
  currency: null,
  team: null,
  urgency: null,
  reason: null,
  rationale: null,
  confidence: 0,
};

const UNITS = /\b(\d+)\s*(seats?|licen[cs]es?|users?|units?|copies|laptops?|monitors?|subscriptions?)\b/i;

function readQuantity(text: string): { quantity: number | null; unit: string | null } {
  const match = text.match(UNITS);
  if (!match) return { quantity: null, unit: null };
  const unit = match[2].toLowerCase();
  return { quantity: Number(match[1]), unit: unit.endsWith("s") ? unit : `${unit}s` };
}

const MONEY = /(?:(\$|€|£|usd|eur|gbp)\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(usd|eur|gbp|dollars|euros|pounds)?(?=\s*(?:\/|per|a\b|an?\s|one|,|\.|$|\s))/i;
const SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", dollars: "USD", euros: "EUR", pounds: "GBP" };

function readMoney(text: string): { amount: number | null; currency: string | null } {
  // Strip quantities first so "5 seats" is never read as five dollars.
  const stripped = text.replace(UNITS, " ");
  const match = stripped.match(MONEY);
  if (!match) return { amount: null, currency: null };
  const [, before, digits, thousands, after] = match;
  const marker = (before ?? after ?? "").toLowerCase();
  const currency = marker ? (SYMBOLS[marker] ?? marker.toUpperCase()) : null;
  if (!currency) return { amount: null, currency: null };
  const amount = Number(digits.replace(/,/g, "")) * (thousands ? 1_000 : 1);
  return { amount, currency };
}

function readPeriod(text: string): Extraction["period"] {
  const lower = text.toLowerCase();
  if (/\/\s*(?:year|yr|annum)|per year|a year|annual|yearly/.test(lower)) return "annual";
  if (/\/\s*(?:month|mo)\b|per month|a month|monthly/.test(lower)) return "monthly";
  if (/one[- ]off|one[- ]time|once\b/.test(lower)) return "one_off";
  return null;
}

function readTeam(text: string): string | null {
  const match = text.match(/\b(?:for|the)\s+(?:the\s+)?([A-Za-z]+)\s+team\b/i);
  if (!match) return null;
  const team = match[1];
  return team[0].toUpperCase() + team.slice(1).toLowerCase();
}

function readUrgency(text: string): Extraction["urgency"] {
  const lower = text.toLowerCase();
  if (/this week|asap|urgent|today|tomorrow/.test(lower)) return "this_week";
  if (/this month/.test(lower)) return "this_month";
  if (/this quarter|\bq[1-4]\b/.test(lower)) return "this_quarter";
  if (/no rush|whenever|flexible|not urgent/.test(lower)) return "flexible";
  return null;
}

function readItem(text: string): string | null {
  const match = text.match(
    /\b(?:(?:need|needs|want|wants)(?:\s+to\s+(?:buy|get|purchase|order|renew))?|buy|get|purchase|order|renew|subscribe to|licen[cs]es? for|subscription (?:to|for))\s+(?:a|an|some|the|more)?\s*([A-Za-z][A-Za-z0-9 .'&-]*?)(?=\s+(?:for|to|so|because|since)\b|\s*[,?]|\s+\d|\s*$)/i,
  );
  if (!match) return null;
  const item = match[1].trim().replace(/^(?:a few more|a few|few more)\s+/i, "");
  return item.length > 0 ? item : null;
}

function readReason(text: string): string | null {
  const match = text.match(/\b(?:because|since|so that|so we can)\s+(.+)$/i);
  return match ? match[1].trim().replace(/[.!]$/, "") : null;
}

export function extract(text: string): Extraction {
  const item = readItem(text);
  const { amount, currency } = readMoney(text);
  if (item === null && amount === null) return EMPTY;

  const found = [item !== null ? "an item" : null, amount !== null ? "a cost" : null].filter(Boolean);
  return {
    item,
    ...readQuantity(text),
    amount,
    period: readPeriod(text),
    currency,
    team: readTeam(text),
    urgency: readUrgency(text),
    reason: readReason(text),
    rationale: `Matched ${found.join(" and ")} in the message by pattern, without a model.`,
    // Both halves read as confident. One alone is still plainly a purchase request,
    // just an incomplete one, so it clears the floor and gets a question rather than a shrug.
    confidence: found.length === 2 ? 0.9 : 0.7,
  };
}
