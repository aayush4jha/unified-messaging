import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PlatformId } from "@/lib/types";
import { verifyState } from "@/server/crypto";
import { getConnector, oauthRedirectUri } from "@/server/connectors";
import { getSessionUser } from "@/server/supabase";
import { saveConnectedAccount, syncAccount } from "@/server/sync";

export async function GET(req: Request, ctx: RouteContext<"/api/connectors/[platform]/callback">) {
  const { platform } = await ctx.params;
  const url = new URL(req.url);
  const fail = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/settings?tab=accounts&error=${encodeURIComponent(msg)}`, url));
    res.cookies.delete({ name: `orbit_oauth_${platform}`, path: "/api/connectors" });
    return res;
  };

  if (url.searchParams.get("error")) return fail(`Connection was cancelled (${url.searchParams.get("error")}).`);
  const connector = getConnector(platform);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!connector?.exchangeCode || !code || !stateParam) return fail("Invalid callback.");

  const nonce = (await cookies()).get(`orbit_oauth_${platform}`)?.value;
  let state;
  try {
    state = verifyState(stateParam, nonce);
  } catch {
    return fail("The connection request expired or didn't start in this browser. Please try again.");
  }
  const user = await getSessionUser();
  if (!user || user.id !== state.userId || state.platform !== platform) return fail("You were signed out during the connection. Please try again.");

  try {
    const result = await connector.exchangeCode(code, oauthRedirectUri(platform, req));
    const identities = Array.isArray(result) ? result : [result];
    const accountIds: string[] = [];
    for (const identity of identities) accountIds.push(await saveConnectedAccount(user.id, platform as PlatformId, identity));
    // Initial sync runs after the redirect so the user isn't kept waiting.
    for (const id of accountIds) after(() => syncAccount(user.id, id, "initial").catch((e) => console.error("[sync] initial", e)));
    const res = NextResponse.redirect(new URL(`/inbox?account=${accountIds[0]}&connected=${accountIds.length}`, url));
    res.cookies.delete({ name: `orbit_oauth_${platform}`, path: "/api/connectors" });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't connect the account.");
  }
}
