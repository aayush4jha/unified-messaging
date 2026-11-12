import { NextResponse } from "next/server";
import { randomToken, signState } from "@/server/crypto";
import { getConnector, oauthRedirectUri } from "@/server/connectors";
import { getSessionUser, supabaseConfigured } from "@/server/supabase";

/** Starts the provider OAuth flow. The state is HMAC-signed and bound to this browser via a nonce cookie. */
export async function GET(req: Request, ctx: RouteContext<"/api/connectors/[platform]/start">) {
  const { platform } = await ctx.params;
  const url = new URL(req.url);
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings?tab=accounts&error=${encodeURIComponent(msg)}`, url));

  const connector = getConnector(platform);
  if (!connector?.getAuthorizationUrl) return back(`${platform} doesn't use OAuth or isn't available.`);
  if (!connector.isConfigured() || !supabaseConfigured() || !process.env.ORBIT_TOKEN_ENCRYPTION_KEY) return back(`${platform} isn't configured on this server.`);

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/connectors/${platform}/start`)}`, url));

  const nonce = randomToken(16);
  const state = signState({ userId: user.id, platform, nonce, exp: Date.now() + 10 * 60_000, reconnectAccountId: url.searchParams.get("reconnect") ?? undefined });
  const res = NextResponse.redirect(connector.getAuthorizationUrl(state, oauthRedirectUri(platform, req)));
  res.cookies.set(`orbit_oauth_${platform}`, nonce, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/connectors", maxAge: 600 });
  return res;
}
