import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <h1>VettedRent</h1>
      <p className="lede">Weekly stays for hosts and lodgers.</p>
      <div className="stack">
        <Link className="button" href="/dashboard">
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
