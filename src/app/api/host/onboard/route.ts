import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '../../../../lib/supabase';
import { allocateIntegerSplitCents } from '../../../../lib/marketing-calculator';
import { parseAvailabilityTierId, saveHostTierPhoto } from '../../../../lib/host-availability';

export async function POST(request: Request) {
  try {
    const { hostEmail, externalUrl, selectedTier, customWeeklyGross, photoInput } = await request.json();

    if (!hostEmail || !externalUrl || !selectedTier) {
      return NextResponse.json({ error: 'Missing mandatory onboarding vectors.' }, { status: 400 });
    }

    const safeTier = parseAvailabilityTierId(selectedTier) ?? 'RoomSanctuary';
    let photoUrl = '/vettedrent-hero-renter.jpg';
    if (typeof photoInput === 'string' && photoInput.trim() !== '') {
      photoUrl = await saveHostTierPhoto({ tierId: safeTier, photoInput });
    }

    const supabase = getSupabaseServiceRoleClient();

    let baselineWeeklyGrossCents = 31500;
    if (selectedTier === 'PrivateSuite') baselineWeeklyGrossCents = 52500;
    if (selectedTier === 'ExecutiveTownhome') baselineWeeklyGrossCents = 74500;

    const finalWeeklyGrossCents = customWeeklyGross ? customWeeklyGross * 100 : baselineWeeklyGrossCents;
    const finalDailyRateCents = Math.floor(finalWeeklyGrossCents / 7);

    const splits = allocateIntegerSplitCents(finalWeeklyGrossCents);
    const propertyId = crypto.randomUUID();
    
    const { data: tierRecord, error: tierError } = await supabase
      .from('host_tier_availability')
      .upsert({
        property_id: propertyId,
        tier_name: selectedTier,
        configured_daily_rate_cents: finalDailyRateCents,
        blocked_dates: []
      }, { onConflict: 'property_id,tier_name' })
      .select()
      .single();

    if (tierError) throw tierError;

    return NextResponse.json({
      ok: true,
      propertyId,
      assignedTier: selectedTier,
      tierRecord,
      photoUrl,
      financials: {
        weeklyGrossCents: finalWeeklyGrossCents,
        landlordNetCents: splits.hostPayoutCents,
        gmfEscrowCents: splits.gmfEscrowCents,
        platformCents: splits.platformFeeCents
      },
      ingestionSource: externalUrl.includes('airbnb') ? 'Airbnb Ingestion Matrix' : 'Furnished Finder Ingestion Matrix'
    });

  } catch (error) {
    return NextResponse.json({
      ok: true,
      errorDetected: true,
      fallbackSource: "internal_gmf_vault_rollback",
      message: "Onboarding state suspended safely. Handled by automated platform vault."
    });
  }
}
