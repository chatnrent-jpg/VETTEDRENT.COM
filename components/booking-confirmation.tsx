"use client";

import Link from "next/link";
import { formatReadableDate } from "@/lib/availability-calendar";
import { DAILY_RATE_PRESET_TIERS } from "@/lib/daily-rate-comparison";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import type { InstantBookingConfirmation } from "@/components/availability-calendar";
// (type-only import: no runtime cycle with availability-calendar)

export function BookingConfirmation({
  confirmation,
}: {
  confirmation: InstantBookingConfirmation;
}) {
  const tier = DAILY_RATE_PRESET_TIERS[confirmation.tier];
  const guest = confirmation.applicantFullName?.trim() || "Guest";

  return (
    <div className="vr-confirmed" role="status" aria-live="polite">
      <div className="vr-confirmed__badge" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="vr-confirmed__title">You&apos;re booked, {guest.split(" ")[0]}.</h2>
      <p className="vr-confirmed__sub">
        Your {tier.shortLabel} stay is reserved and your license is signed.
      </p>

      <dl className="vr-confirmed__grid">
        <div>
          <dt>Check-in</dt>
          <dd>{formatReadableDate(confirmation.checkInDate)}</dd>
        </div>
        <div>
          <dt>Check-out</dt>
          <dd>{formatReadableDate(confirmation.validUntil)}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{confirmation.stayDays} days</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{formatCurrencyCents(confirmation.dailyRateCents)} / day</dd>
        </div>
      </dl>

      <div className="vr-confirmed__ref">
        <span>License ID</span>
        <code>{confirmation.licenseId}</code>
      </div>

      <div className="vr-confirmed__actions">
        <a className="button" href={confirmation.passportPdfHref} target="_blank" rel="noreferrer">
          Download Stay Passport
        </a>
        <a
          className="vr-confirmed__secondary"
          href={confirmation.commercialLicensePdfHref}
          target="_blank"
          rel="noreferrer"
        >
          Download signed license
        </a>
      </div>

      <p className="vr-confirmed__note">
        Save both documents now. They are your proof of booking and your entry credentials.
      </p>

      <Link href="/" className="vr-confirmed__back">
        ← Back to stays
      </Link>
    </div>
  );
}
