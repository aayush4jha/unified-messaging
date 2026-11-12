import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/search/search-view";
import { ListSkeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Search" };
export const instant = false;

export default function SearchPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchView />
    </Suspense>
  );
}
