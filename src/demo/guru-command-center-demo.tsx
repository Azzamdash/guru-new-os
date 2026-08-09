import React from 'react';

const priorities = [
  { level: 'CRITICAL', title: 'Courier settlement mismatch', detail: '3 settlements need reconciliation', action: 'Review' },
  { level: 'ATTENTION', title: '12 operations are delayed', detail: '5 are past the expected delivery window', action: 'Investigate' },
  { level: 'ATTENTION', title: 'Low stock signal', detail: 'Brand X is trending below its safe level', action: 'Open stock' },
  { level: 'NORMAL', title: '5 approvals pending', detail: 'No SLA breach yet', action: 'Review' },
];

const events = [
  ['09:42', 'Order delivered', 'Customer · Ahmed Hassan', 'Completed'],
  ['09:18', 'Courier assigned', 'Distribution · Branch A', 'Updated'],
  ['08:51', 'Payment recorded', 'Customer · Sara Ali', 'Completed'],
  ['08:27', 'Stock threshold crossed', 'Brand X · Warehouse', 'Attention'],
];

export default function GuruCommandCenterDemo() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Guru OS · Demo</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">What happened, what matters, and what should happen next.</p>
          </div>
          <button className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800">Open Recall</button>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ['3', 'Critical', 'Needs action now'],
            ['7', 'Attention', 'Worth reviewing'],
            ['24', 'Healthy', 'Running normally'],
          ].map(([value, label, hint]) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-3xl font-semibold">{value}</div>
              <div className="mt-1 text-sm font-medium">{label}</div>
              <div className="mt-1 text-xs text-slate-500">{hint}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Priority queue</h2>
                <p className="mt-1 text-xs text-slate-500">Actions surfaced from current operations.</p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">4 items</span>
            </div>
            <div className="mt-5 space-y-3">
              {priorities.map((item) => (
                <article key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-bold tracking-widest text-slate-500">{item.level}</div>
                      <div className="mt-1 font-medium">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                    </div>
                    <button className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950">{item.action}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="font-semibold">Operational pulse</h2>
            <div className="mt-5 space-y-5">
              <div><div className="flex justify-between text-xs"><span>Orders</span><span>+18%</span></div><div className="mt-2 h-2 rounded-full bg-slate-800"><div className="h-2 w-[78%] rounded-full bg-cyan-300" /></div></div>
              <div><div className="flex justify-between text-xs"><span>Courier delays</span><span>+7%</span></div><div className="mt-2 h-2 rounded-full bg-slate-800"><div className="h-2 w-[46%] rounded-full bg-amber-300" /></div></div>
              <div><div className="flex justify-between text-xs"><span>Stock health</span><span>82%</span></div><div className="mt-2 h-2 rounded-full bg-slate-800"><div className="h-2 w-[82%] rounded-full bg-emerald-300" /></div></div>
            </div>
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">Guru noticed a rise in courier delays this week. <button className="ml-1 font-medium text-cyan-300">Show why →</button></div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-semibold">Unified activity</h2><p className="mt-1 text-xs text-slate-500">A single timeline across customers, couriers, stock, and distribution.</p></div>
            <button className="rounded-xl border border-slate-700 px-4 py-2 text-xs hover:bg-slate-800">View all events</button>
          </div>
          <div className="mt-5 divide-y divide-slate-800">
            {events.map(([time, event, context, state]) => (
              <div key={`${time}-${event}`} className="grid gap-2 py-4 md:grid-cols-[70px_1fr_auto] md:items-center">
                <div className="text-xs text-slate-500">{time}</div>
                <div><div className="text-sm font-medium">{event}</div><div className="mt-1 text-xs text-slate-500">{context}</div></div>
                <div className="text-xs text-slate-400">{state}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
