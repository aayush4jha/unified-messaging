import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsView } from "@/components/contacts/contacts-view";

export const metadata: Metadata = { title: "Contacts" };
// Client-state driven (see workspace layout).
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContactsView />
    </Suspense>
  );
}
