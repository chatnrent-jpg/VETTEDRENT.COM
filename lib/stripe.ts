import assert from "node:assert/strict";
import Stripe from "stripe";

/** Host base rent: 75.5% of the captured weekly total. */
export const HOST_BPS = 7550;
/** Forced savings vault: 14.3% of the captured weekly total. */
export const VAULT_BPS = 1430;
/** VettedRent platform fee: 10.2%. Remainder cents land here so the parts sum to the charge. */
export const PLATFORM_BPS = 1020;

assert.equal(HOST_BPS + VAULT_BPS + PLATFORM_BPS, 10000);

export type WeeklySplitCents = {
  totalCents: number;
  hostCents: number;
  vaultCents: number;
  platformCents: number;
  applicationFeeCents: number;
};

const MAX_TOTAL_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 10000);

/**
 * Split a captured weekly total in integer cents.
 * Host and vault use floor(totalCents * bps / 10000).
 * Platform cents are the remainder, so host + vault + platform === totalCents.
 * applicationFeeCents stays on the platform (vault + platform). The connected account receives hostCents.
 */
export function splitWeeklyCapture(totalCents: number): WeeklySplitCents {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_TOTAL_CENTS) {
    throw new Error("totalCents must be a non-negative integer");
  }
  const totalBig = BigInt(totalCents);
  const bpsDenom = BigInt(10000);
  const hostCents = Number((totalBig * BigInt(HOST_BPS)) / bpsDenom);
  const vaultCents = Number((totalBig * BigInt(VAULT_BPS)) / bpsDenom);
  const platformCents = totalCents - hostCents - vaultCents;
  const split: WeeklySplitCents = {
    totalCents,
    hostCents,
    vaultCents,
    platformCents,
    applicationFeeCents: vaultCents + platformCents,
  };
  assert.equal(split.hostCents + split.vaultCents + split.platformCents, totalCents);
  assert.equal(split.applicationFeeCents + split.hostCents, totalCents);
  return split;
}

export type CentsParse =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Convert a dollar total_amount to integer cents once.
 * Decimal strings are parsed with integer digits. Numbers are rounded half-up a single time.
 */
export function totalAmountToCents(totalAmount: unknown): CentsParse {
  if (typeof totalAmount === "string") {
    return decimalDollarsToCents(totalAmount);
  }
  if (typeof totalAmount === "number") {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return { ok: false, error: "total_amount must be a non-negative amount" };
    }
    const cents = Math.round(totalAmount * 100);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_TOTAL_CENTS) {
      return { ok: false, error: "total_amount is out of range" };
    }
    return { ok: true, cents };
  }
  return { ok: false, error: "total_amount must be a decimal string or a number" };
}

export function weeklySplitMetadata(
  hostAccountId: string,
  split: WeeklySplitCents,
): Record<string, string> {
  return {
    host_account_id: hostAccountId,
    host_rent_cents: String(split.hostCents),
    vault_contribution_cents: String(split.vaultCents),
    platform_fee_cents: String(split.platformCents),
    host_bps: String(HOST_BPS),
    vault_bps: String(VAULT_BPS),
    platform_bps: String(PLATFORM_BPS),
  };
}

/**
 * Server-only Stripe client. Throws when STRIPE_SECRET_KEY is missing. Never logs the key.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey);
}

export const WEEKLY_CURRENCY = "usd";
export const WEEKLY_INTERVAL = "week" as const;

const WEEKLY_PRODUCT_METADATA_KEY = "vettedrent_key";
const WEEKLY_PRODUCT_METADATA_VALUE = "weekly_stay";
const WEEKLY_PRODUCT_SEARCH = `active:"true" AND metadata["${WEEKLY_PRODUCT_METADATA_KEY}"]:"${WEEKLY_PRODUCT_METADATA_VALUE}"`;

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

export type WeeklyStayPrice = {
  productId: string;
  priceId: string;
};

/**
 * One VettedRent product, one weekly price per amount.
 * STRIPE_WEEKLY_PRODUCT_ID pins the product when set. Otherwise the active product
 * tagged vettedrent_key=weekly_stay is reused, or created once.
 * A price is reused when its lookup key, amount, currency, and week interval match.
 */
export async function resolveWeeklyStayPrice(
  stripe: Stripe,
  totalCents: number,
): Promise<WeeklyStayPrice> {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > MAX_TOTAL_CENTS) {
    throw new BillingConfigError("Missing or invalid totalCents amount");
  }
  const productId = await resolveWeeklyProductId(stripe);
  const existing = await findWeeklyPrice(stripe, productId, totalCents);
  if (existing) {
    return { productId, priceId: existing.id };
  }
  try {
    const created = await stripe.prices.create({
      product: productId,
      currency: WEEKLY_CURRENCY,
      unit_amount: totalCents,
      recurring: { interval: WEEKLY_INTERVAL },
      lookup_key: weeklyPriceLookupKey(totalCents),
      nickname: `VettedRent weekly ${totalCents}`,
      metadata: {
        [WEEKLY_PRODUCT_METADATA_KEY]: WEEKLY_PRODUCT_METADATA_VALUE,
        total_cents: String(totalCents),
      },
    });
    return { productId, priceId: created.id };
  } catch (error) {
    if (!isLookupKeyConflict(error)) {
      throw error;
    }
    const raced = await findWeeklyPrice(stripe, productId, totalCents);
    if (!raced) {
      throw new BillingConfigError("Weekly price lookup key is already used");
    }
    return { productId, priceId: raced.id };
  }
}

export function weeklyPriceLookupKey(totalCents: number): string {
  return `vettedrent_weekly_${totalCents}`;
}

async function resolveWeeklyProductId(stripe: Stripe): Promise<string> {
  const configured = process.env.STRIPE_WEEKLY_PRODUCT_ID?.trim();
  if (configured) {
    try {
      const product = await stripe.products.retrieve(configured);
      if (!isUsableProduct(product)) {
        throw new BillingConfigError("STRIPE_WEEKLY_PRODUCT_ID is not a usable product");
      }
      return product.id;
    } catch (error) {
      if (error instanceof BillingConfigError) {
        throw error;
      }
      throw new BillingConfigError("STRIPE_WEEKLY_PRODUCT_ID is not a usable product");
    }
  }

  let found: Stripe.Product | null = null;
  try {
    found = await searchMasterProduct(stripe);
  } catch {
    console.error("weekly product search failed");
    found = await listMasterProduct(stripe);
  }
  if (found) {
    return found.id;
  }

  const created = await stripe.products.create(
    {
      name: "VettedRent weekly stay",
      metadata: {
        [WEEKLY_PRODUCT_METADATA_KEY]: WEEKLY_PRODUCT_METADATA_VALUE,
      },
    },
    { idempotencyKey: "vettedrent-weekly-stay-product" },
  );
  return created.id;
}

async function searchMasterProduct(stripe: Stripe): Promise<Stripe.Product | null> {
  const matches: Stripe.Product[] = [];
  let page: string | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await stripe.products.search({
      query: WEEKLY_PRODUCT_SEARCH,
      limit: 100,
      ...(page ? { page } : {}),
    });
    matches.push(...result.data.filter(isUsableProduct));
    if (!result.has_more || !result.next_page) {
      break;
    }
    page = result.next_page;
  }
  return earliestProduct(matches);
}

async function listMasterProduct(stripe: Stripe): Promise<Stripe.Product | null> {
  const matches: Stripe.Product[] = [];
  let startingAfter: string | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    matches.push(
      ...page.data.filter(
        (product) => product.metadata?.[WEEKLY_PRODUCT_METADATA_KEY] === WEEKLY_PRODUCT_METADATA_VALUE,
      ),
    );
    const last = page.data[page.data.length - 1];
    if (!page.has_more || !last) {
      break;
    }
    startingAfter = last.id;
  }
  return earliestProduct(matches);
}

async function findWeeklyPrice(
  stripe: Stripe,
  productId: string,
  totalCents: number,
): Promise<Stripe.Price | null> {
  const listed = await stripe.prices.list({
    lookup_keys: [weeklyPriceLookupKey(totalCents)],
    limit: 1,
  });
  const price = listed.data[0];
  if (!price) {
    return null;
  }
  if (!isMatchingWeeklyPrice(price, productId, totalCents)) {
    throw new BillingConfigError("Weekly price lookup key is already used");
  }
  if (!price.active) {
    return stripe.prices.update(price.id, { active: true });
  }
  return price;
}

function earliestProduct(products: Stripe.Product[]): Stripe.Product | null {
  if (products.length === 0) {
    return null;
  }
  return [...products].sort((left, right) => left.created - right.created || left.id.localeCompare(right.id))[0] ?? null;
}

function isUsableProduct(
  product: Stripe.Product | Stripe.DeletedProduct,
): product is Stripe.Product {
  return product.object === "product" && !("deleted" in product && product.deleted) && product.active === true;
}

function isMatchingWeeklyPrice(price: Stripe.Price, productId: string, totalCents: number): boolean {
  const recurring = price.recurring;
  const intervalCount = recurring?.interval_count ?? 1;
  return (
    priceProductId(price) === productId &&
    price.currency === WEEKLY_CURRENCY &&
    price.unit_amount === totalCents &&
    price.type === "recurring" &&
    recurring?.interval === WEEKLY_INTERVAL &&
    intervalCount === 1
  );
}

function priceProductId(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string") {
    return product;
  }
  if (product && typeof product === "object" && "id" in product && typeof product.id === "string") {
    return product.id;
  }
  return null;
}

function isLookupKeyConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "resource_already_exists" || message.includes("lookup key") || message.includes("lookup_key");
}

function decimalDollarsToCents(raw: string): CentsParse {
  const value = raw.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    return { ok: false, error: "total_amount must be a decimal dollar amount" };
  }
  const dollars = parseUnsignedInteger(match[1]);
  if (dollars === null) {
    return { ok: false, error: "total_amount is out of range" };
  }
  const fraction = match[2] ?? "";
  const centDigits = `${fraction}00`.slice(0, 2);
  const centPart = parseUnsignedInteger(centDigits);
  if (centPart === null) {
    return { ok: false, error: "total_amount is out of range" };
  }
  let cents = dollars * 100 + centPart;
  const remainder = fraction.slice(2);
  if (remainder.length > 0 && remainder.charCodeAt(0) >= 53) {
    cents += 1;
  }
  if (!Number.isSafeInteger(cents) || cents > MAX_TOTAL_CENTS) {
    return { ok: false, error: "total_amount is out of range" };
  }
  return { ok: true, cents };
}

function parseUnsignedInteger(digits: string): number | null {
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  let value = 0;
  for (const char of digits) {
    value = value * 10 + (char.charCodeAt(0) - 48);
    if (!Number.isSafeInteger(value)) {
      return null;
    }
  }
  return value;
}
