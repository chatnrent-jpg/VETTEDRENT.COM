import { NextResponse } from "next/server";
import type { DailyRateTierId } from "@/lib/daily-rate-comparison";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import {
  BENCHMARK_45_STAYS,
  DEFAULT_GMF_FLOAT_SEED_CENTS,
  calculateWeeklyLiquiditySpread,
  type PayoutSchedule,
  type WeeklyLiquiditySpreadResult,
} from "@/lib/liquidity-spread";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { getSupabaseServerClient } from "@/lib/supabase";
import { PURPOSE_COHORT_IDS } from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GmfPoolSnapshot = {
  poolId: string;
  availableBalanceCents: number;
  reservedBackstopCents: number;
  totalRoutedCents: number;
  source: "public.gmf_float_balance" | "seeded_fallback";
};

function parseTierId(value: string | null): DailyRateTierId | undefined {
  if (
    value === "RoomSanctuary" ||
    value === "PrivateSuite" ||
    value === "ExecutiveTownhome"
  ) {
    return value;
  }
  return undefined;
}

function parsePayoutSchedule(value: string | null): PayoutSchedule {
  if (value === "bi-weekly") {
    return "bi-weekly";
  }
  return "monthly";
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function wantsHtmlView(request: Request, url: URL): boolean {
  const format = url.searchParams.get("format");
  if (format === "json") {
    return false;
  }
  if (format === "html") {
    return true;
  }
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  const secFetchDest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  return accept.includes("text/html") || secFetchDest === "document";
}

async function isAuthorizedInternalCaller(request: Request): Promise<boolean> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return false;
  }

  const portalKey = process.env.ENTERPRISE_PORTAL_KEY;
  if (portalKey && portalKey.trim() !== "" && token === portalKey.trim()) {
    return true;
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return false;
    }
    const role = await resolveCallerRole(supabase, data.user);
    return isHostRole(role);
  } catch {
    return false;
  }
}

async function readGmfFloatPoolSnapshot(): Promise<GmfPoolSnapshot> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("gmf_float_balance")
      .select("*")
      .eq("pool_id", "primary_gmf_pool")
      .maybeSingle();

    if (!error && data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      const rawAvailable =
        typeof row.available_balance_cents === "number"
          ? row.available_balance_cents
          : typeof row.available_buffer_cents === "number"
            ? row.available_buffer_cents
            : typeof row.total_float_cents === "number"
              ? row.total_float_cents
              : DEFAULT_GMF_FLOAT_SEED_CENTS;
      const available = Number.isFinite(rawAvailable)
        ? Math.round(rawAvailable)
        : DEFAULT_GMF_FLOAT_SEED_CENTS;

      const rawReserved =
        typeof row.reserved_backstop_cents === "number"
          ? row.reserved_backstop_cents
          : typeof row.allocated_reserve_cents === "number"
            ? row.allocated_reserve_cents
            : 0;
      const reserved = Number.isFinite(rawReserved) ? Math.round(rawReserved) : 0;

      const routed =
        typeof row.total_routed_cents === "number" &&
        Number.isFinite(row.total_routed_cents)
          ? Math.round(row.total_routed_cents)
          : 0;

      return {
        poolId: typeof row.pool_id === "string" ? row.pool_id : "primary_gmf_pool",
        availableBalanceCents: available,
        reservedBackstopCents: reserved,
        totalRoutedCents: routed,
        source: "public.gmf_float_balance",
      };
    }
  } catch {
    // Graceful fallback when Supabase or public.gmf_float_balance is unavailable
  }

  return {
    poolId: "primary_gmf_pool",
    availableBalanceCents: DEFAULT_GMF_FLOAT_SEED_CENTS,
    reservedBackstopCents: 0,
    totalRoutedCents: 0,
    source: "seeded_fallback",
  };
}

function renderPrivateGateHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VettedRent.Com · Private Treasury Record</title>
  <style>
    :root {
      --bg: #0b0f17;
      --text: #f8fafc;
      --muted: #cbd5e1;
      --accent: #e5b869;
      --accent-bright: #f3cc85;
      --accent-ink: #111827;
      --line: rgba(255, 255, 255, 0.2);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100dvh;
      font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }
    .backdrop {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 0;
      background-color: #0b0f17;
      background-image:
        linear-gradient(180deg, rgba(10, 14, 22, 0.56) 0%, rgba(12, 16, 24, 0.44) 45%, rgba(10, 14, 22, 0.78) 100%),
        url("/vettedrent-hero-landlord.jpg");
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .shell {
      position: relative;
      z-index: 1;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: min(64rem, 100%);
      margin: 0 auto;
      padding: 1.35rem 1.5rem 1.5rem;
    }
    .topbar, .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 1.15rem;
      border-radius: 999px;
      background: rgba(15, 20, 30, 0.62);
      border: 1px solid var(--line);
      backdrop-filter: blur(18px);
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      text-decoration: none;
      color: #fff;
    }
    .logo img {
      width: 2.65rem;
      height: 2.65rem;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid rgba(229, 184, 105, 0.55);
    }
    .logo strong {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .logo em {
      font-style: normal;
      color: var(--accent-bright);
    }
    .logo span {
      display: block;
      font-size: 0.76rem;
      color: rgba(248, 250, 252, 0.85);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.75rem;
      padding: 0.55rem 1.25rem;
      border-radius: 999px;
      font-size: 0.94rem;
      font-weight: 700;
      text-decoration: none;
      border: 1px solid var(--line);
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }
    .btn-gold {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: transparent;
    }
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 1.25rem;
      margin: auto 0;
      padding: 2rem;
      max-width: 40rem;
      align-self: center;
      border-radius: 22px;
      background: rgba(15, 21, 32, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(24px);
      box-shadow: 0 28px 68px -16px rgba(0, 0, 0, 0.75);
    }
    .badge {
      padding: 0.35rem 0.9rem;
      border-radius: 999px;
      background: rgba(229, 184, 105, 0.16);
      border: 1px solid rgba(229, 184, 105, 0.4);
      color: var(--accent-bright);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(1.85rem, 3.8vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.035em;
      margin: 0;
    }
    p {
      margin: 0;
      font-size: 1.02rem;
      color: var(--muted);
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <div class="backdrop" aria-hidden="true"></div>
  <main class="shell">
    <header class="topbar">
      <a href="/" class="logo">
        <img src="/vettedrent-logo-mark.jpg" alt="VettedRent.Com Crest" />
        <div>
          <strong>VettedRent<em>.Com</em></strong>
          <span>Be Great to Yourself.</span>
        </div>
      </a>
      <a class="btn btn-gold" href="/dashboard">Host / Admin Sign In →</a>
    </header>

    <section class="stage">
      <span class="badge">Private Internal Treasury Record</span>
      <h1>Authorized Host &amp; Admin Access Only</h1>
      <p>
        Platform treasury reserves, timing float balances, and weekly liquidity spread records are
        confidential to VettedRent.Com. Sign in with an authorized Host / Admin account on the
        Dashboard to view live treasury telemetry.
      </p>
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; justify-content:center; margin-top:0.4rem;">
        <a class="btn btn-gold" href="/dashboard">Sign In to View Treasury →</a>
        <a class="btn" href="/">← Back to Front Page</a>
      </div>
    </section>

    <footer class="footer">
      <span>VettedRent.Com · Confidential Financial Telemetry</span>
      <a class="btn" href="/">Home</a>
    </footer>
  </main>
</body>
</html>`;
}

function renderLiquiditySpreadHtml(
  pool: GmfPoolSnapshot,
  requested: WeeklyLiquiditySpreadResult,
  benchmark45: WeeklyLiquiditySpreadResult,
  townhome45: WeeklyLiquiditySpreadResult,
): string {
  const activeTier = requested.tierId;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VettedRent.Com · Private Treasury &amp; Liquidity Spread</title>
  <style>
    :root {
      --bg: #0b0f17;
      --text: #f8fafc;
      --muted: #cbd5e1;
      --accent: #e5b869;
      --accent-bright: #f3cc85;
      --accent-ink: #111827;
      --ok: #34d399;
      --line: rgba(255, 255, 255, 0.18);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100dvh;
      font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }
    .backdrop {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 0;
      background-color: #0b0f17;
      background-image:
        linear-gradient(180deg, rgba(10, 14, 22, 0.5) 0%, rgba(12, 16, 24, 0.35) 45%, rgba(10, 14, 22, 0.72) 100%),
        url("/vettedrent-hero-landlord.jpg");
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .shell {
      position: relative;
      z-index: 1;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: min(66rem, 100%);
      margin: 0 auto;
      padding: 1.35rem 1.5rem 1.5rem;
    }
    .topbar, .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 1.15rem;
      border-radius: 999px;
      background: rgba(15, 20, 30, 0.62);
      border: 1px solid var(--line);
      backdrop-filter: blur(18px);
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      text-decoration: none;
      color: #fff;
    }
    .logo img {
      width: 2.65rem;
      height: 2.65rem;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid rgba(229, 184, 105, 0.55);
    }
    .logo strong {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .logo em {
      font-style: normal;
      color: var(--accent-bright);
    }
    .logo span {
      display: block;
      font-size: 0.76rem;
      color: rgba(248, 250, 252, 0.85);
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.6rem;
      padding: 0.45rem 1rem;
      border-radius: 999px;
      font-size: 0.9rem;
      font-weight: 650;
      text-decoration: none;
      border: 1px solid var(--line);
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }
    .btn-gold {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: transparent;
    }
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 1.25rem;
      margin: auto 0;
      padding: 1.5rem 0;
    }
    .pill-switch {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.32rem;
      border-radius: 999px;
      background: rgba(15, 21, 32, 0.72);
      border: 1px solid var(--line);
      backdrop-filter: blur(18px);
    }
    .pill-switch a {
      padding: 0.45rem 1.1rem;
      border-radius: 999px;
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 600;
      color: rgba(248, 250, 252, 0.88);
    }
    .pill-switch a.active {
      background: var(--accent);
      color: var(--accent-ink);
    }
    h1 {
      font-size: clamp(2.1rem, 4.6vw, 3.2rem);
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.08;
      margin: 0;
      text-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    }
    .sub {
      font-size: 1.1rem;
      color: rgba(248, 250, 252, 0.92);
      margin: 0;
      max-width: 44rem;
    }
    .sub strong { color: var(--accent-bright); }
    .cards {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0.85rem;
      padding: 0.85rem;
      border-radius: 22px;
      background: rgba(15, 21, 32, 0.76);
      border: 1px solid rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(24px);
      box-shadow: 0 28px 68px -16px rgba(0, 0, 0, 0.75);
    }
    .card {
      padding: 1rem 1.1rem;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      text-align: left;
      display: grid;
      gap: 0.25rem;
    }
    .card span {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .card strong {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #fff;
    }
    .card strong.gold { color: var(--accent-bright); }
    .card strong.emerald { color: var(--ok); }
    .card small {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .pills {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.65rem;
    }
    .info-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 999px;
      background: rgba(15, 21, 32, 0.7);
      border: 1px solid var(--line);
      backdrop-filter: blur(16px);
      font-size: 0.88rem;
    }
    .info-pill strong { color: var(--accent-bright); }
  </style>
</head>
<body>
  <div class="backdrop" aria-hidden="true"></div>
  <main class="shell">
    <header class="topbar">
      <a href="/" class="logo">
        <img src="/vettedrent-logo-mark.jpg" alt="VettedRent.Com Crest" />
        <div>
          <strong>VettedRent<em>.Com</em></strong>
          <span>Be Great to Yourself.</span>
        </div>
      </a>
      <nav class="nav">
        <a class="btn" href="/dashboard">← Back to Dashboard</a>
      </nav>
    </header>

    <section class="stage">
      <div class="pill-switch" role="group" aria-label="Select Space Tier">
        <a href="/api/billing/liquidity-spread?tier=RoomSanctuary&amp;stays=45" class="${activeTier === "RoomSanctuary" ? "active" : ""}">Room ($45/day · $315/wk)</a>
        <a href="/api/billing/liquidity-spread?tier=PrivateSuite&amp;stays=45" class="${activeTier === "PrivateSuite" ? "active" : ""}">Suite ($75/day · $525/wk)</a>
        <a href="/api/billing/liquidity-spread?tier=ExecutiveTownhome&amp;stays=45" class="${activeTier === "ExecutiveTownhome" ? "active" : ""}">Townhome ($106.43/day · $745/wk)</a>
      </div>

      <h1>${formatCurrencyCents(benchmark45.projectedGmfFloatPoolBalanceCents)} Live GMF Treasury.</h1>
      <p class="sub">
        Connected live to <strong>${pool.source}</strong> (${pool.poolId}) · 45 active stays generate
        <strong>${formatCurrencyCents(benchmark45.portfolioMonthlyGrossCollectionCents)}/month</strong> with a
        <strong>${formatCurrencyCents(benchmark45.average21DayTimingFloatCents)}</strong> 21-day timing float.
      </p>

      <div class="cards">
        <div class="card">
          <span>Live Supabase GMF Pool</span>
          <strong class="emerald">${formatCurrencyCents(pool.availableBalanceCents)}</strong>
          <small>Source: ${pool.source}</small>
        </div>
        <div class="card">
          <span>21-Day Timing Float (45 Stays)</span>
          <strong class="gold">${formatCurrencyCents(benchmark45.average21DayTimingFloatCents)}</strong>
          <small>${formatCurrencyCents(requested.perStayAverage21DayTimingFloatCents)} per stay @ ${formatCurrencyCents(requested.weeklyRateCents)}/wk</small>
        </div>
        <div class="card">
          <span>14.3% Monthly GMF Inflow</span>
          <strong class="emerald">+${formatCurrencyCents(benchmark45.portfolioMonthlyGmfVaultContributionCents)}/mo</strong>
          <small>${formatCurrencyCents(benchmark45.portfolioAnnualGmfVaultContributionCents)} / year</small>
        </div>
        <div class="card">
          <span>Townhome Calendar Spread</span>
          <strong class="gold">+${formatCurrencyCents(townhome45.portfolioMonthlyCompoundDeltaCents)}/mo</strong>
          <small>+$228.08/mo per stay ($3,228.08 collected vs. $3,000 flat)</small>
        </div>
      </div>

      <div class="pills">
        <div class="info-pill">
          <strong>75.5% Host Payout</strong>
          <span>${formatCurrencyCents(requested.perStayWeeklyHostCents)}/wk (${formatCurrencyCents(requested.perStayScheduledHostMonthlyDisbursementCents)}/mo net) per stay</span>
        </div>
        <div class="info-pill">
          <strong>14.3% Move-Out Vault</strong>
          <span>${formatCurrencyCents(requested.perStayWeeklyGmfVaultCents)}/wk per stay</span>
        </div>
        <div class="info-pill">
          <strong>10.2% Platform Fee</strong>
          <span>${formatCurrencyCents(requested.perStayWeeklyPlatformFeeCents)}/wk per stay</span>
        </div>
      </div>
    </section>

    <footer class="footer">
      <span>Private Internal Record · System Spec 3.B</span>
      <a class="btn" href="/dashboard">Dashboard</a>
    </footer>
  </main>
</body>
</html>`;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const authorized = await isAuthorizedInternalCaller(request);

    if (!authorized) {
      if (wantsHtmlView(request, url)) {
        return new NextResponse(renderPrivateGateHtml(), {
          status: 401,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "Private internal record. Sign in with an authorized Host/Admin session or supply a valid bearer token.",
        },
        { status: 401 },
      );
    }

    const tierId = parseTierId(url.searchParams.get("tier"));
    const rawWeeklyCents = Number(url.searchParams.get("weeklyCents"));
    const weeklyRateCents =
      Number.isFinite(rawWeeklyCents) && rawWeeklyCents >= 5000 && rawWeeklyCents <= 500000
        ? Math.round(rawWeeklyCents)
        : undefined;
    const rawStays = Number(url.searchParams.get("stays"));
    const activeStays =
      Number.isFinite(rawStays) && rawStays >= 1 && rawStays <= 500
        ? Math.round(rawStays)
        : 1;
    const payoutSchedule = parsePayoutSchedule(url.searchParams.get("schedule"));

    const gmfFloatPool = await readGmfFloatPoolSnapshot();

    const requested = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const singleStay = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays: 1,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const benchmark45Stays = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays: BENCHMARK_45_STAYS,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const tiers = {
      RoomSanctuary: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "RoomSanctuary",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "RoomSanctuary",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
      PrivateSuite: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "PrivateSuite",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "PrivateSuite",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
      ExecutiveTownhome: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "ExecutiveTownhome",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "ExecutiveTownhome",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
    };

    if (wantsHtmlView(request, url)) {
      const html = renderLiquiditySpreadHtml(
        gmfFloatPool,
        requested,
        benchmark45Stays,
        tiers.ExecutiveTownhome.benchmark45Stays,
      );
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      spec: "System Spec 3.B — Weekly Liquidity Spread Schema Engine",
      motto: "Be Great to Yourself.",
      gmfFloatPool,
      universalCohorts: PURPOSE_COHORT_IDS,
      requested,
      singleStay,
      benchmark45Stays,
      tiers,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not compute weekly liquidity spread" },
      { status: 500 },
    );
  }
}
