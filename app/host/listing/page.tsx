"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { DAILY_RATE_PRESET_TIERS, type DailyRateTierId } from "@/lib/daily-rate-comparison";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import {
  createListing,
  deletePhoto,
  fileToJpegDataUrl,
  loadCatalog,
  saveDetails,
  setPublished,
  uploadPhoto,
  type CatalogListing,
  type CatalogResult,
} from "@/lib/host-catalog-client";
import { MARYLAND_SEO_REGISTRY } from "@/lib/seo-registry";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Gate = "checking" | "denied" | "host";

const TIER_IDS = Object.keys(DAILY_RATE_PRESET_TIERS) as DailyRateTierId[];
const COUNTIES = Object.values(MARYLAND_SEO_REGISTRY)
  .map((county) => ({ slug: county.slug, name: county.countyName }))
  .sort((a, b) => a.name.localeCompare(b.name));

type Form = {
  title: string;
  tier: DailyRateTierId;
  weeklyDollars: string;
  city: string;
  countySlug: string;
  zipCode: string;
  idealFor: string;
  featuresText: string;
  description: string;
};

const NEW_LISTING = "__new__";

function emptyForm(): Form {
  return {
    title: "",
    tier: "RoomSanctuary",
    weeklyDollars: String(DAILY_RATE_PRESET_TIERS.RoomSanctuary.minWeeklyRateCents / 100),
    city: "",
    countySlug: "",
    zipCode: "",
    idealFor: "",
    featuresText: "",
    description: "",
  };
}

function formFromListing(listing: CatalogListing): Form {
  const tier = (listing.tier && listing.tier in DAILY_RATE_PRESET_TIERS
    ? listing.tier
    : "RoomSanctuary") as DailyRateTierId;
  return {
    title: listing.title,
    tier,
    weeklyDollars:
      listing.weeklyRateCents === null ? "" : String(Math.round(listing.weeklyRateCents / 100)),
    city: listing.city,
    countySlug: listing.countySlug ?? "",
    zipCode: listing.zipCode,
    idealFor: listing.idealFor,
    featuresText: listing.features.join("\n"),
    description: listing.description,
  };
}

function parseFeatures(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export default function HostListingPage() {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;
    void callerIsHost().then((allowed) => {
      if (!cancelled) setGate(allowed ? "host" : "denied");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate !== "host") {
    return (
      <main className="gate-screen">
        <h1>{gate === "checking" ? "Checking access" : "Hosts only"}</h1>
        <p className="lede">
          {gate === "checking"
            ? "Confirming your session."
            : "Listing management is limited to host accounts."}
        </p>
        {gate === "checking" ? null : (
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        )}
      </main>
    );
  }
  return <ListingManager />;
}

function ListingManager() {
  const [listings, setListings] = useState<CatalogListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(NEW_LISTING);
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);

  const selected = listings.find((listing) => listing.id === selectedId) ?? null;
  const isNew = selectedId === NEW_LISTING;
  const preset = DAILY_RATE_PRESET_TIERS[form.tier];

  const refresh = useCallback(async (preferId?: string) => {
    const result = await loadCatalog();
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setListings(result.listings);
    const target =
      result.listings.find((listing) => listing.id === preferId) ?? result.listings[0] ?? null;
    if (target) {
      setSelectedId(target.id);
      setForm(formFromListing(target));
    } else {
      setSelectedId(NEW_LISTING);
      setForm(emptyForm());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function applyResult(result: CatalogResult<{ listing: CatalogListing }>, success: string) {
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      setBlockers(result.blockers ?? []);
      return false;
    }
    setBlockers([]);
    if (success) {
      setNotice({ tone: "ok", text: success });
    }
    setListings((prev) => {
      const exists = prev.some((item) => item.id === result.listing.id);
      return exists
        ? prev.map((item) => (item.id === result.listing.id ? result.listing : item))
        : [...prev, result.listing];
    });
    return true;
  }

  function weeklyCents(): number | null {
    const dollars = Number(form.weeklyDollars);
    return Number.isInteger(dollars) && dollars > 0 ? dollars * 100 : null;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const cents = weeklyCents();
    if (cents === null) {
      setNotice({ tone: "error", text: "Enter the weekly price in whole dollars." });
      return;
    }
    setBusy("save");
    setNotice(null);
    const details = {
      title: form.title,
      tier: form.tier,
      weeklyRateCents: cents,
      ...(form.city.trim() ? { city: form.city } : {}),
      ...(form.countySlug ? { countySlug: form.countySlug } : {}),
      ...(form.zipCode.trim() ? { zipCode: form.zipCode } : {}),
      idealFor: form.idealFor,
      features: parseFeatures(form.featuresText),
      description: form.description,
    };
    const result = isNew ? await createListing(details) : await saveDetails(selectedId, details);
    if (applyResult(result, isNew ? "Draft created. Add photos next." : "Saved.") && result.ok) {
      setSelectedId(result.listing.id);
      setForm(formFromListing(result.listing));
    }
    setBusy(null);
  }

  async function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected || files.length === 0) return;
    setBusy("photos");
    setNotice(null);
    let added = 0;
    for (const file of files) {
      const converted = await fileToJpegDataUrl(file);
      if (!converted.ok) {
        setNotice({ tone: "error", text: converted.error });
        break;
      }
      // One at a time: slots are assigned server-side in order.
      const result = await uploadPhoto(selected.id, converted.dataUrl);
      if (!applyResult(result, "")) break;
      added += 1;
    }
    if (added > 0) {
      setNotice({ tone: "ok", text: `${added} photo${added === 1 ? "" : "s"} added.` });
    }
    setBusy(null);
  }

  async function handleDeletePhoto(photoId: string) {
    if (!selected) return;
    setBusy(`photo:${photoId}`);
    setNotice(null);
    applyResult(await deletePhoto(selected.id, photoId), "Photo removed.");
    setBusy(null);
  }

  async function handlePublish(published: boolean) {
    if (!selected) return;
    setBusy("publish");
    setNotice(null);
    applyResult(
      await setPublished(selected.id, published),
      published ? "Your listing is live on VettedRent." : "Your listing is no longer public.",
    );
    setBusy(null);
  }

  const dailyHint =
    weeklyCents() !== null ? `about $${Math.round(Number(form.weeklyDollars) / 7)} / day` : "";

  return (
    <main className="vr-host-listing">
      <header className="vr-host-listing__top">
        <Link href="/" className="vr-host-listing__brand">
          VettedRent<em>.Com</em>
        </Link>
        <Link href="/dashboard" className="text-button">
          Dashboard
        </Link>
      </header>

      <h1>Your listings</h1>
      <p className="vr-host-listing__sub">
        Add details and photos, then publish. Renters see a listing only while it is published. We
        never show your street address.
      </p>

      {loading ? <p className="vr-host-listing__sub">Loading your listings…</p> : null}
      {loadError ? (
        <p className="vr-host-listing__notice" data-tone="error" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError ? (
        <>
          <nav className="vr-host-listing__tabs" aria-label="Your listings">
            {listings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                data-active={listing.id === selectedId}
                onClick={() => {
                  setSelectedId(listing.id);
                  setForm(formFromListing(listing));
                  setNotice(null);
                  setBlockers([]);
                }}
              >
                {listing.title || "Untitled"}
                <small>{listing.isPublished ? "Live" : "Draft"}</small>
              </button>
            ))}
            <button
              type="button"
              data-active={isNew}
              onClick={() => {
                setSelectedId(NEW_LISTING);
                setForm(emptyForm());
                setNotice(null);
                setBlockers([]);
              }}
            >
              + New listing
            </button>
          </nav>

          {notice ? (
            <p
              className="vr-host-listing__notice"
              data-tone={notice.tone}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.text}
            </p>
          ) : null}

          <form className="vr-host-listing__panel" onSubmit={handleSave}>
            <h2>{isNew ? "New listing" : "Details"}</h2>

            <label>
              Title
              <input
                value={form.title}
                maxLength={80}
                required
                placeholder="Sunny private suite near Silver Spring Metro"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <div className="vr-host-listing__row">
              <label>
                Space type
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as DailyRateTierId })}
                >
                  {TIER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {DAILY_RATE_PRESET_TIERS[id].shortLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Weekly price (USD)
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={preset.minWeeklyRateCents / 100}
                  max={preset.maxWeeklyRateCents / 100}
                  required
                  value={form.weeklyDollars}
                  onChange={(e) => setForm({ ...form, weeklyDollars: e.target.value })}
                />
                <small>
                  ${preset.minWeeklyRateCents / 100} to ${preset.maxWeeklyRateCents / 100} per
                  week {dailyHint ? `· ${dailyHint}` : ""}
                </small>
              </label>
            </div>

            <div className="vr-host-listing__row">
              <label>
                City
                <input
                  value={form.city}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                County
                <select
                  value={form.countySlug}
                  onChange={(e) => setForm({ ...form, countySlug: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {COUNTIES.map((county) => (
                    <option key={county.slug} value={county.slug}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ZIP
                <input
                  value={form.zipCode}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value.replace(/\D/g, "") })}
                />
              </label>
            </div>

            <label>
              Great for
              <input
                value={form.idealFor}
                maxLength={60}
                placeholder="Traveling nurses, students, relocating families"
                onChange={(e) => setForm({ ...form, idealFor: e.target.value })}
              />
            </label>

            <label>
              Features (one per line)
              <textarea
                rows={4}
                value={form.featuresText}
                placeholder={"Keyless entry\nPrivate bath\nAll utilities included"}
                onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
              />
            </label>

            <label>
              Description
              <textarea
                rows={5}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <button type="submit" className="button" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : isNew ? "Create draft" : "Save details"}
            </button>
          </form>

          {selected ? (
            <>
              <section className="vr-host-listing__panel" aria-label="Photos">
                <h2>Photos ({selected.photos.length}/12)</h2>
                <p className="vr-host-listing__sub">
                  The first photo is the cover. Removing the cover promotes the next photo.
                </p>
                <div className="vr-host-listing__photos">
                  {selected.photos.map((photo, index) => (
                    <figure key={photo.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={`Photo ${index + 1}`} />
                      {index === 0 ? <span>Cover</span> : null}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void handleDeletePhoto(photo.id)}
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        {busy === `photo:${photo.id}` ? "…" : "Remove"}
                      </button>
                    </figure>
                  ))}
                </div>
                {selected.photos.length < 12 ? (
                  <label className="vr-host-listing__upload">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy !== null}
                      onChange={(e) => void handlePhotos(e)}
                    />
                    <span>{busy === "photos" ? "Uploading…" : "+ Add photos"}</span>
                  </label>
                ) : null}
              </section>

              <section className="vr-host-listing__panel" aria-label="Publish">
                <h2>{selected.isPublished ? "Live on VettedRent" : "Ready to publish?"}</h2>
                {selected.blockers.length > 0 ? (
                  <ul className="vr-host-listing__checks">
                    {selected.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="vr-host-listing__sub">
                    {selected.isPublished
                      ? "Renters can find and book this listing."
                      : "Everything required is filled in."}
                  </p>
                )}
                {blockers.length > 0 ? (
                  <ul className="vr-host-listing__checks">
                    {blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {selected.isPublished ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy !== null}
                    onClick={() => void handlePublish(false)}
                  >
                    {busy === "publish" ? "Updating…" : "Unpublish"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={busy !== null || selected.blockers.length > 0}
                    onClick={() => void handlePublish(true)}
                  >
                    {busy === "publish" ? "Publishing…" : "Publish listing"}
                  </button>
                )}
              </section>
            </>
          ) : (
            <p className="vr-host-listing__sub">Create the draft first, then you can add photos.</p>
          )}
        </>
      ) : null}
    </main>
  );
}

async function callerIsHost(): Promise<boolean> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    return isHostRole(await resolveCallerRole(supabase, data.user));
  } catch {
    return false;
  }
}
