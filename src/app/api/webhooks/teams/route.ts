import { handleGraphNotification } from "@/server/graph-webhook";

/** Teams chat message change notifications (Microsoft Graph). */
export async function POST(req: Request) {
  return handleGraphNotification(req, "teams");
}
