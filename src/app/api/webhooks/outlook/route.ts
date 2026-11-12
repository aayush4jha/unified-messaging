import { handleGraphNotification } from "@/server/graph-webhook";

/** Outlook mail change notifications (Microsoft Graph). */
export async function POST(req: Request) {
  return handleGraphNotification(req, "outlook");
}
