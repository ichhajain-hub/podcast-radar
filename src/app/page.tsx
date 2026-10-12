export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24">
      <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">Podcast Ecosystem Radar</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-900">Setting up</h1>
      <p className="mt-4 text-slate-600">
        The weekly radar dashboard will appear here. System status: <a className="text-indigo-600 underline" href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
