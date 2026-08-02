import { ButtonLink } from "@/app/_components/ui/button";

/**
 * A 404 outside the console.
 *
 * The entry page has no shell to sit inside, so this is a standalone surface —
 * but it is still built from the same tokens and type roles rather than from
 * the framework's default, which renders black-on-white with no way home.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-label text-text-subtle">404</p>
      <h1 className="text-display text-foreground mt-3">Page not found</h1>
      <p className="text-body text-text-muted mt-2 max-w-sm">
        Nothing lives at this address. The product itself is under{" "}
        <span className="text-mono text-foreground">/console</span>.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/console">Open the console</ButtonLink>
        <ButtonLink variant="outline" href="/">
          Back to the entry page
        </ButtonLink>
      </div>
    </main>
  );
}
