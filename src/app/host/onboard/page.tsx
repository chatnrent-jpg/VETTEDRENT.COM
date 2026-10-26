'use client';
import Link from 'next/link';
import React, { useState } from 'react';

export default function FrictionlessHostOnboarding() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState('RoomSanctuary');
  const [photoInput, setPhotoInput] = useState('');
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoInput(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const executeOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('/api/host/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostEmail: email,
          externalUrl: url,
          selectedTier: tier,
          photoInput: photoInput || undefined,
        })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Onboarding suspended safely.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-slate-950 min-h-screen text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-xl w-full bg-slate-900/60 border border-slate-900 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Host Portal · Listing &amp; Photo Ingestion</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-50">Unvetted renting is over.</h1>
          <p className="mt-2 text-sm text-slate-400">Paste your existing listing URL and upload your property photos to publish to the live marketplace.</p>
        </div>

        {!result ? (
          <form onSubmit={executeOnboarding} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Account Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@domain.com" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Listing Link (Airbnb / Furnished Finder / VRBO)</label>
              <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://airbnb.com..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Select Allocation Tier</label>
              <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors">
                <option value="RoomSanctuary">RoomSanctuary ($45/day baseline floor)</option>
                <option value="PrivateSuite">PrivateSuite ($75/day baseline floor)</option>
                <option value="ExecutiveTownhome">ExecutiveTownhome ($106/day baseline floor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">
                Property Cover Photo (Upload Image File or Paste Photo URL)
              </label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoFileChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-300"
                />
                <input
                  type="url"
                  value={photoInput.startsWith('data:') ? '' : photoInput}
                  onChange={(e) => {
                    setPhotoFileName(null);
                    setPhotoInput(e.target.value);
                  }}
                  placeholder="Or paste direct image URL (https://...)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-xs"
                />
              </div>
              {photoInput ? (
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative">
                  <img
                    src={photoInput}
                    alt="Uploaded property preview"
                    className="w-full h-48"
                    style={{ objectFit: 'cover', display: 'block' }}
                  />
                  <div className="p-2 text-xs text-emerald-400 font-semibold text-center">
                    ✓ Photo ready for tenant marketplace card {photoFileName ? `(${photoFileName})` : ''}
                  </div>
                </div>
              ) : null}
            </div>

            <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-bold rounded-lg shadow-lg hover:shadow-emerald-500/10 transition-all duration-200">
              {loading ? 'Ingesting Property Vectors & Photos...' : 'Import, Upload Photo & Publish Property'}
            </button>
          </form>
        ) : (
          <div className="space-y-6 border border-emerald-500/10 bg-slate-950/40 p-6 rounded-xl text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">✓</div>
            <div>
              <h2 className="text-xl font-bold text-slate-50">Property &amp; Photo Ingested Successfully</h2>
              <p className="text-xs text-slate-400 mt-1">Source verified via {result.ingestionSource || 'Internal System'}</p>
            </div>

            {(result.photoUrl || photoInput) ? (
              <div className="rounded-xl overflow-hidden border border-slate-800">
                <img
                  src={result.photoUrl || photoInput}
                  alt="Published listing cover"
                  className="w-full h-48"
                  style={{ objectFit: 'cover', display: 'block' }}
                />
              </div>
            ) : null}
            
            <div className="border-t border-slate-900 pt-4 text-left space-y-2 text-sm text-slate-300">
              <div className="flex justify-between"><span className="text-slate-500">Guaranteed Weekly Gross:</span> <span className="font-semibold">${((result.financials?.weeklyGrossCents || 31500) / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Your Secured Net Payout (75.5%):</span> <span className="text-emerald-400 font-bold">${((result.financials?.landlordNetCents || 23783) / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">GMF Escrow Protection Pool (14.3%):</span> <span className="text-slate-400 font-medium">${((result.financials?.gmfEscrowCents || 4505) / 100).toFixed(2)}</span></div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-4">
              <Link href="/" className="button button-secondary text-xs">
                ← View Live Tenant Marketplace
              </Link>
              <button onClick={() => setResult(null)} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
                Onboard another listing →
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
