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
                Traditional mid-term rentals burden incoming medical professionals with excessive security deposits, arbitrary background friction, and slow approval pipelines. 
                <strong className="text-emerald-400 font-semibold mx-1">VettedRent dismantles this barrier.</strong> 
                Our platform interfaces directly with clinical staffing payroll systems to secure placements with zero down-payment requirements.
              </p>
            </div>
            <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-900">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">Direct Clinical Access Corridors</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                {countyMetadata.majorHospitals.map((hospital, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    Verified mid-term routes available for contract professionals at <span className="text-slate-200 font-medium">{hospital}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-slate-900/80 p-6 rounded-xl border border-emerald-500/10 shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                {countyMetadata.stateCode} Regional High Velocity Hubs
              </h3>
              <div className="mt-4 space-y-4">
                {countyMetadata.travelNurseDemandHubs.map((hub, index) => (
                  <div key={index} className="pb-3 border-b border-slate-800 last:border-0 last:pb-0">
                    <div className="text-slate-200 font-semibold text-sm">{hub}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Active underwritten capacity monitored hourly</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 rounded-xl border border-slate-900 text-center">
              <div className="text-2xl font-black text-slate-100">$45.00/day Net</div>
              <div className="text-xs text-slate-400 mt-1">Guaranteed RoomSanctuary baseline rate vector</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
