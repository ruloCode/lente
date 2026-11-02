// Which user a request or socket acts for (add-accounts 3.3). The credential checks are injected:
// access tokens by src/user-auth.ts, web sessions and device tokens by their stores. Every failure
// resolves to no one (401); a bad bearer token never falls back to a cookie or the owner.

import { type AuthMode } from "./access-gate.ts";
import { cookieValue } from "./device-auth.ts";

/** The single user of a laptop hub or a pairing-mode cloud hub. */
export const LOCAL_OWNER = "local-owner";

export interface Identity {
  userId: string;
  /** How the caller proved who they are; `device` carries the device id for `last_seen_at` and the audit trail. */
  via: "owner" | "pairing" | "bearer" | "cookie" | "device";
  deviceId?: string;
}

export interface IdentitySources {
  mode: AuthMode;
  /** Name of the session cookie: the pairing cookie (pairing) or the web session cookie (accounts). */
  cookieName: string;
  /** Pairing mode: the cookie belongs to a paired phone. */
  pairedSession?: (cookie: string) => boolean;
  /** Pairing mode: the token belongs to a device that has not been revoked. */
  knownDevice?: (token: string) => boolean;
  /** Accounts mode: the user id of a valid access token; throws on any invalid token. */
  verifyAccessToken?: (token: string) => Promise<string>;
  /** Accounts mode: the user of a live web session cookie. */
  sessionUser?: (cookie: string) => Promise<string | undefined>;
  /** Accounts mode: the user and device id of a device token that has not been revoked. */
  deviceUser?: (token: string) => Promise<{ userId: string; deviceId: string } | undefined>;
}

export interface Credentials {
  authorization?: string;
  cookie?: string;
  /** Full request URL, for `?token=` (browsers cannot set headers on a WebSocket). */
  url?: string;
}

/** A Supabase access token is a JWT (three dot-separated parts); device tokens are base64url with no dots. */
const looksLikeJwt = (token: string): boolean => token.split(".").length === 3;

function bearerOf(creds: Credentials, allowQuery: boolean): string | undefined {
  const header = /^Bearer (\S+)$/.exec(creds.authorization ?? "")?.[1];
  if (header) return header;
  if (!allowQuery) return undefined;
  return new URL(creds.url ?? "/", "http://hub").searchParams.get("token") ?? undefined;
}

/**
 * Resolves the caller. `surface` is `web` for HTTP routes and `device` for the `/device` upgrade:
 * device tokens (and `?token=`) count only on the upgrade, so a clip's token opens no HTTP route.
 */
export async function identify(creds: Credentials, sources: IdentitySources, surface: "web" | "device"): Promise<Identity | undefined> {
  if (sources.mode === "open") return { userId: LOCAL_OWNER, via: "owner" };
  const onDevice = surface === "device";
  const bearer = bearerOf(creds, onDevice);
  const cookie = cookieValue(creds.cookie, sources.cookieName);

  if (sources.mode === "pairing") {
    if (bearer && onDevice && sources.knownDevice?.(bearer)) return { userId: LOCAL_OWNER, via: "device" };
    if (cookie && sources.pairedSession?.(cookie)) return { userId: LOCAL_OWNER, via: "pairing" };
    return undefined;
  }

  if (bearer) {
    if (looksLikeJwt(bearer)) {
      try {
        return { userId: await sources.verifyAccessToken!(bearer), via: "bearer" };
      } catch {
        return undefined;
      }
    }
    if (!onDevice) return undefined;
    const device = await sources.deviceUser?.(bearer);
    return device ? { userId: device.userId, via: "device", deviceId: device.deviceId } : undefined;
  }
  if (cookie) {
    const userId = await sources.sessionUser?.(cookie);
    return userId ? { userId, via: "cookie" } : undefined;
  }
  return undefined;
}
