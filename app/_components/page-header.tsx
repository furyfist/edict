export function PageHeader({
  title,
  question,
  right,
}: {
  title: string;
  question: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-400">
          {question}
        </p>
      </div>
      {right}
    </div>
  );
}

/** Shown when the database is unreachable. Never a blank screen. */
export function DbUnavailable() {
  return (
    <div className="mt-6 rounded border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm text-amber-200">No database connection.</p>
      <p className="mt-1 text-xs text-neutral-400">
        Set <code className="text-neutral-300">DATABASE_URL</code>, then run{" "}
        <code className="text-neutral-300">npm run db:push &amp;&amp; npm run seed</code>.
      </p>
    </div>
  );
}
