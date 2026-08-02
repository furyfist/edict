import {
  SkeletonPageHeader,
  SkeletonTable,
} from "@/app/_components/feedback/skeletons";

/**
 * Vendors is the one console route that is a table rather than a card stack,
 * so it overrides the shared skeleton. A card-shaped placeholder resolving into
 * a 44px-row table is exactly the layout jump these exist to prevent.
 */
export default function VendorsLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonTable rows={8} columns={5} />
    </>
  );
}
