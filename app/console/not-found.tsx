import { PageHeader } from "@/app/_components/layout/page-header";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { ButtonLink } from "@/app/_components/ui/button";

/**
 * A console route that does not exist.
 *
 * Rendered inside the shell, so the sidebar is still there and the reader is
 * one click from any of the eight real surfaces — which is the whole difference
 * between a 404 and a dead end.
 */
export default function ConsoleNotFound() {
  return (
    <>
      <PageHeader
        title="No such page"
        question="This route does not exist. Every surface in the console is in the sidebar."
      />

      <EmptyState
        variant="no-matches"
        title="Nothing lives at this address"
        description="The link may be from an older version of the console, or the address may have a typo."
        action={
          <ButtonLink variant="outline" size="sm" href="/console">
            Back to the ledger
          </ButtonLink>
        }
      />
    </>
  );
}
