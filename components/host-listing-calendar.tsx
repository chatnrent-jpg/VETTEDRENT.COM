"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDaysIsoUtc, todayIsoUtc } from "@/lib/availability-calendar";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * One property's calendar for its host. Click a day to close or reopen it.
 * Days a guest has booked are shown but cannot be changed here.
 *
 * State flow (one direction): the server is the source of truth. Load fills `saved*`; clicks edit
 * `closed`; Save sends `closed`, then the server's answer replaces both. Nothing is shown as
 * saved unless the server confirmed it.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MAX_MONTHS_AHEAD = 17;

type LoadState = "loading" | "ready" | "error";

type ServerDates = { blockedDates: string[]; bookedDates: string[]; isPublished: boolean };

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function readServerDates(body: unknown): ServerDates | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.blockedDates) || !Array.isArray(record.bookedDates)) return null;
  return {
    blockedDates: stringList(record.blockedDates),
    bookedDates: stringList(record.bookedDates),
    isPublished: record.isPublished === true,
  };
}

function errorText(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return fallback;
}

async function sessionToken(): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getSession();
    return error ? null : (data.session?.access_token ?? null);
  } catch {
    return null;
  }
}

async function requestCalendar(
  listingId: string,
  closedDates: string[] | null,
): Promise<{ ok: true; dates: ServerDates } | { ok: false; message: string }> {
  const token = await sessionToken();
  if (!token) return { ok: false, message: "Please sign in again." };
  try {
    const response =
      closedDates === null
        ? await fetch(`/api/host/catalog/availability?listingId=${encodeURIComponent(listingId)}`, {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch("/api/host/catalog/availability", {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ listingId, blockedDates: closedDates }),
          });
    const body: unknown = await response.json();
    const dates = response.ok ? readServerDates(body) : null;
    if (!dates) {
      return {
        ok: false,
        message: errorText(
          body,
          closedDates === null
            ? "We couldn't load your calendar."
            : "We couldn't save your calendar.",
        ),
      };
    }
    return { ok: true, dates };
  } catch {
    return { ok: false, message: "Network problem. Check your connection and try again." };
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function HostListingCalendar({
  listingId,
  listingName,
}: {
  listingId: string;
  listingName: string;
}) {
  const today = todayIsoUtc();
  const [load, setLoad] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [isPublished, setIsPublished] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const apply = useCallback((dates: ServerDates) => {
    setSaved(new Set(dates.blockedDates));
    setClosed(new Set(dates.blockedDates));
    setBooked(new Set(dates.bookedDates));
    setIsPublished(dates.isPublished);
  }, []);

  // Reloads whenever the host picks a different property.
  useEffect(() => {
    let cancelled = false;
    setLoad("loading");
    setLoadError(null);
    setNote(null);
    setMonthOffset(0);
    void requestCalendar(listingId, null).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        apply(result.dates);
        setLoad("ready");
      } else {
        setLoadError(result.message);
        setLoad("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, apply]);

  const dirty = !sameSet(saved, closed);

  const month = useMemo(() => {
    const base = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 1));
    const daysInMonth = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const isoFirst = first.toISOString().slice(0, 10);
    const days: string[] = [];
    for (let i = 0; i < daysInMonth; i++) days.push(addDaysIsoUtc(isoFirst, i));
    return {
      label: `${MONTH_NAMES[first.getUTCMonth()]} ${first.getUTCFullYear()}`,
      leadingBlanks: first.getUTCDay(),
      days,
    };
  }, [today, monthOffset]);

  const editableDays = month.days.filter((d) => d >= today && !booked.has(d));

  function toggle(iso: string) {
    if (saving || iso < today || booked.has(iso)) return;
    setNote(null);
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function setMonthClosed(shouldClose: boolean) {
    if (saving) return;
    setNote(null);
    setClosed((prev) => {
      const next = new Set(prev);
      for (const d of editableDays) {
        if (shouldClose) next.add(d);
        else next.delete(d);
      }
      return next;
    });
  }

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setNote(null);
    const result = await requestCalendar(listingId, Array.from(closed).sort());
    if (result.ok) {
      apply(result.dates);
      setNote({ tone: "ok", text: "Saved. Guests now see these dates." });
    } else {
      setNote({ tone: "error", text: result.message });
    }
    setSaving(false);
  }

  if (load === "loading") {
    return <p className="vr-help">Loading the calendar for {listingName}...</p>;
  }

  if (load === "error") {
    return (
      <p className="error" role="alert">
        {loadError ?? "We couldn't load your calendar."}
      </p>
    );
  }

  return (
    <div className="vr-cal">
      <p className="vr-help">
        Tap a day to close it, and tap it again to reopen it. Days stay open to guests unless you
        close them.
        {isPublished ? "" : " This property isn't live yet, so guests can't see it until you publish it."}
      </p>

      <div className="vr-cal__bar">
        <button
          type="button"
          className="text-button"
          onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
          disabled={monthOffset === 0}
          aria-label="Previous month"
        >
          ← Back
        </button>
        <strong>{month.label}</strong>
        <button
          type="button"
          className="text-button"
          onClick={() => setMonthOffset((m) => Math.min(MAX_MONTHS_AHEAD, m + 1))}
          disabled={monthOffset >= MAX_MONTHS_AHEAD}
          aria-label="Next month"
        >
          Next →
        </button>
      </div>

      <div className="vr-cal__grid" role="grid" aria-label={`Open dates for ${listingName}, ${month.label}`}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="vr-cal__dow" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: month.leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {month.days.map((iso) => {
          const isPast = iso < today;
          const isBooked = booked.has(iso);
          const isClosed = closed.has(iso);
          const state = isPast ? "past" : isBooked ? "booked" : isClosed ? "closed" : "open";
          const label = isBooked ? "booked by a guest" : isClosed ? "closed" : "open";
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={`vr-cal__day vr-cal__day--${state}`}
              disabled={isPast || isBooked || saving}
              aria-pressed={isClosed}
              aria-label={`${iso}, ${isPast ? "past" : label}`}
              onClick={() => toggle(iso)}
            >
              {Number(iso.slice(8, 10))}
            </button>
          );
        })}
      </div>

      <div className="vr-cal__legend">
        <span>
          <i className="vr-cal__swatch vr-cal__swatch--open" /> Open
        </span>
        <span>
          <i className="vr-cal__swatch vr-cal__swatch--closed" /> Closed by you
        </span>
        <span>
          <i className="vr-cal__swatch vr-cal__swatch--booked" /> Booked by a guest
        </span>
      </div>

      <div className="vr-cta-row">
        <button type="button" className="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setMonthClosed(true)}
          disabled={saving || editableDays.length === 0}
        >
          Close all of {MONTH_NAMES[Number(month.days[0].slice(5, 7)) - 1]}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setMonthClosed(false)}
          disabled={saving || editableDays.length === 0}
        >
          Open all of {MONTH_NAMES[Number(month.days[0].slice(5, 7)) - 1]}
        </button>
      </div>
      {dirty ? <p className="vr-help">You have changes that aren&apos;t saved yet.</p> : null}
      {note ? (
        <p className={note.tone === "error" ? "error" : "vr-help"} role={note.tone === "error" ? "alert" : "status"}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
