import {
  SkeletonCards,
  SkeletonPageHeader,
  SkeletonSectionHeader,
} from "@/app/_components/feedback/skeletons";

/**
 * The console's shared loading state.
 *
 * Next applies this to `/console` and to every nested route that does not
 * declare its own, so one file covers eight surfaces — and, just as
 * importantly, it makes the sidebar respond the instant a link is clicked
 * rather than 2.5 seconds later.
 *
 * The shape is the one most console pages share: a page header over a stack of
 * record cards. Routes whose shape differs enough to shift the layout override
 * it (see `vendors/loading.tsx`).
 */
export default function ConsoleLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonSectionHeader />
      <SkeletonCards count={5} />
    </>
  );
}
