import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MARYLAND_SEO_REGISTRY } from '../../../../lib/seo-registry';
import { ProductLedHero } from '../../../../components/Hero';

interface RouteProps {
  params: Promise<{
    state: string;
    county: string;
  }>;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const resolvedParams = await params;
  const stateCode = resolvedParams.state.toUpperCase();
  const countyMetadata = MARYLAND_SEO_REGISTRY[resolvedParams.county.toLowerCase()];

  if (stateCode !== 'MD' || !countyMetadata) {
    return { title: 'Mid-Term Housing | VettedRent' };
  }

  const titleStr = `Official Mid-Term Housing in ${countyMetadata.countyName}, MD | $0 Security Deposit`;
  const descStr = `Verified temporary lodging near ${countyMetadata.majorHospitals.join(', ')} and across ${countyMetadata.countyName}. Direct employer payroll splits, zero credit friction, and underwritten cash flows.`;

  return {
    title: titleStr,
    description: descStr,
    openGraph: {
      title: titleStr,
      description: descStr,
      url: `https://vettedrent.com/jurisdictions/md/${countyMetadata.slug}`,
      type: 'website',
    }
  };
}

export async function generateStaticParams() {
  return Object.keys(MARYLAND_SEO_REGISTRY).map((key) => ({
    state: 'md',
    county: key,
  }));
}

export default async function ProgrammaticJurisdictionPage({ params }: RouteProps) {
  const resolvedParams = await params;
  const stateCode = resolvedParams.state.toUpperCase();
  const countyMetadata = MARYLAND_SEO_REGISTRY[resolvedParams.county.toLowerCase()];

  if (stateCode !== 'MD' || !countyMetadata) {
    notFound();
  }

  return (
    <main className="bg-slate-950 min-h-screen text-slate-100 selection:bg-emerald-500/30">
      <ProductLedHero portalType="tenant" />
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-2 space-y-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-50">
                Underwritten Medical Staffing & Contractor Lodging in {countyMetadata.countyName}
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed text-base">
                Book move-in ready furnished stays in {countyMetadata.countyName} with{" "}
                <strong className="text-emerald-400 font-semibold">$0 Security Deposit</strong>,{" "}
                <strong className="text-emerald-400 font-semibold">No Credit Check</strong>, and{" "}
                <strong className="text-emerald-400 font-semibold">Instant Bank Link Setup</strong>.
              </p>
            </div>
            <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-900">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">Nearby Medical &amp; Employment Hubs</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                {countyMetadata.majorHospitals.map((hospital, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    Furnished mid-term stays near <span className="text-slate-200 font-medium">{hospital}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-slate-900/80 p-6 rounded-xl border border-emerald-500/10 shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                {countyMetadata.stateCode} Popular Neighborhoods
              </h3>
              <div className="mt-4 space-y-4">
                {countyMetadata.travelNurseDemandHubs.map((hub, index) => (
                  <div key={index} className="pb-3 border-b border-slate-800 last:border-0 last:pb-0">
                    <div className="text-slate-200 font-semibold text-sm">{hub}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Instant online booking available</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 rounded-xl border border-slate-900 text-center">
              <div className="text-2xl font-black text-slate-100">From $45/day</div>
              <div className="text-xs text-slate-400 mt-1">RoomSanctuary ($45/day) · PrivateSuite ($75/day) · ExecutiveTownhome ($106/day)</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
