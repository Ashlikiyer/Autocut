/** Simple wrapper for text pages (credits, privacy, terms). */
export function Prose({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
      <header className="mb-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {updated && <p className="mt-1 text-sm">Last updated {updated}</p>}
      </header>
      {children}
    </article>
  );
}
