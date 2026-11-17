import { createClient } from "npm:@supabase/supabase-js@2";
import { send } from "jsr:@daaku/webpush@0.2.0";
 
// Compatibility for Base64 typed-array APIs not yet available in this Supabase Deno runtime.
type Base64Options = { alphabet?: "base64" | "base64url"; omitPadding?: boolean; lastChunkHandling?: string };
const Uint8ArrayCompat = Uint8Array as typeof Uint8Array & {
  fromBase64?: (value: string, options?: Base64Options) => Uint8Array;
  prototype: Uint8Array & { toBase64?: (options?: Base64Options) => string };
};
if (typeof Uint8ArrayCompat.fromBase64 !== "function") {
  Uint8ArrayCompat.fromBase64 = (value: string, options?: Base64Options) => {
    let base64 = String(value).replace(/\s/g, "");
    if (options?.alphabet === "base64url" || /[-_]/.test(base64)) {
      base64 = base64.replace(/-/g, "+").replace(/_/g, "/");
    }
    base64 = base64.replace(/=+$/g, "");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  };
}
if (typeof Uint8ArrayCompat.prototype.toBase64 !== "function") {
  Object.defineProperty(Uint8ArrayCompat.prototype, "toBase64", {
    configurable: true,
    writable: true,
    value: function(options?: Base64Options) {
      const bytes = this as Uint8Array;
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      let encoded = btoa(binary);
      if (options?.alphabet === "base64url") encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_");
      if (options?.omitPadding) encoded = encoded.replace(/=+$/g, "");
      return encoded;
    },
  });
}

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const supabase = createClient(PROJECT_URL, SERVICE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = new Set([
  "https://hughston-cyber.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://hughston-cyber.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
});

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}
function decodeBase64Url(value: string): Uint8Array {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - normal.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function vapidJwk(): JsonWebKey {
  const publicBytes = decodeBase64Url(VAPID_PUBLIC_KEY);
  const privateBytes = decodeBase64Url(VAPID_PRIVATE_KEY);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("VAPID key format is invalid. Regenerate the keys and check the Supabase secrets.");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(publicBytes.slice(1, 33)),
    y: encodeBase64Url(publicBytes.slice(33, 65)),
    d: encodeBase64Url(privateBytes),
    ext: true,
  };
}

async function activeUser(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session is invalid. Please sign in again.");
  const { data: profile } = await supabase.from("member_profiles")
    .select("status").eq("user_id", data.user.id).maybeSingle();
  if (profile?.status !== "active") throw new Error("An active Team Venom account is required.");
  const { data: roleRows } = await supabase.from("member_roles")
    .select("role").eq("user_id", data.user.id);
  return { user: data.user, roles: (roleRows ?? []).map((row) => row.role as string) };
}
function isManager(roles: string[]) {
  return roles.some((role) => role === "administrator" || role === "manager");
}
async function getEventName(eventId: string) {
  const { data } = await supabase.from("race_events").select("event_name").eq("id", eventId).maybeSingle();
  return data?.event_name ?? "the race event";
}
async function buildMessage(type: string, body: Record<string, unknown>) {
  if (type === "team_announcement" || type === "emergency_announcement") {
    const title = String(body.title ?? "").trim().slice(0, 120);
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!title || !message) throw new Error("An announcement title and message are required.");
    return { sender: type === "emergency_announcement" ? "Emergency Operations" : "Team Communications", inboxTitle: title, message, pushBody: message };
  }
  if (type === "race_clock_started" || type === "race_clock_stopped") {
    const eventId = String(body.event_id ?? "");
    if (!eventId) throw new Error("A race event is required.");
    const eventName = await getEventName(eventId);
    const started = type === "race_clock_started";
    return {
      sender: "Race Control",
      inboxTitle: started ? "Race clock started" : "Race clock stopped",
      message: started ? `The 24-hour race clock has started for ${eventName}.` : `The race clock has been stopped for ${eventName}.`,
      pushBody: started ? `The 24-hour race clock has started for ${eventName}.` : `The race clock has been stopped for ${eventName}.`,
    };
  }
  if (type === "rider_changeover") {
    const eventId = String(body.event_id ?? "");
    if (!eventId) throw new Error("A race event is required.");
    const eventName = await getEventName(eventId);
    const { data: state } = await supabase.from("live_race_state").select("current_roster_stint_id").eq("event_id", eventId).maybeSingle();
    let riderName = "the next rider";
    if (state?.current_roster_stint_id) {
      const { data: stint } = await supabase.from("roster_stints")
        .select("riders(first_name,last_name,preferred_name)")
        .eq("id", state.current_roster_stint_id).maybeSingle();
      const rider = Array.isArray(stint?.riders) ? stint.riders[0] : stint?.riders;
      if (rider) riderName = rider.preferred_name ? `${rider.preferred_name} ${rider.last_name}` : `${rider.first_name} ${rider.last_name}`;
    }
    return { sender: "Race Control", inboxTitle: "Rider changeover", message: `${riderName} is now riding for ${eventName}.`, pushBody: `${riderName} is now riding for ${eventName}.` };
  }
  if (type === "roster_published") {
    const rosterId = String(body.roster_id ?? "");
    if (!rosterId) throw new Error("A roster is required.");
    const { data: roster } = await supabase.from("rosters").select("event_id,version_number").eq("id", rosterId).maybeSingle();
    if (!roster) throw new Error("The published roster could not be found.");
    const eventName = await getEventName(roster.event_id);
    const message = `Roster version ${roster.version_number} has been published for ${eventName}.`;
    return { sender: "Team Management", inboxTitle: "Roster published", message, pushBody: message };
  }
  throw new Error("That notification type is not supported.");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  try {
    if (!SERVICE_KEY) throw new Error("The Supabase server key is not configured.");
    const { user, roles } = await activeUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "public-key") {
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("Push service keys are not configured.");
      return json({ publicKey: VAPID_PUBLIC_KEY }, 200, origin);
    }

    if (action === "subscribe") {
      const subscription = body.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth ||
          !String(subscription.endpoint).startsWith("https://")) {
        throw new Error("The browser subscription is incomplete.");
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return json({ success: true, deviceOnly: true }, 200, origin);
    }

    if (action === "unsubscribe") {
      const endpoint = String(body.endpoint ?? "");
      if (!endpoint.startsWith("https://")) throw new Error("A valid subscription endpoint is required.");
      const { error } = await supabase.from("push_subscriptions").delete()
        .eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) throw error;
      return json({ success: true, deviceOnly: true }, 200, origin);
    }

    if (action === "test") {
      const endpoint = String(body.endpoint ?? "");
      if (!endpoint.startsWith("https://")) throw new Error("A valid device endpoint is required.");
      const { data: subscriptions, error } = await supabase.from("push_subscriptions")
        .select("endpoint,subscription").eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) throw error;
      if (!subscriptions?.length) throw new Error("This browser is not registered for push notifications.");
      const payload = JSON.stringify({
        title: "Team Venom",
        body: "Push notifications are connected on this device.",
        icon: "./favicon.svg",
        badge: "./favicon.svg",
        tag: "team-venom-test",
        data: { url: "./" },
      });
      const vapid = vapidJwk();
      let sent = 0;
      for (const item of subscriptions) {
        try {
          await send(item.subscription, payload, {
            vapid,
            subscriber: "https://hughston-cyber.github.io/Team-Venom-Rider-Management-System/",
            ttl: 300,
            urgency: "normal",
          });
          sent++;
        } catch (error) {
          const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
          }
          console.error("Test push delivery failed:", status, String(error));
        }
      }
      if (!sent) throw new Error("The push service could not deliver a test notification. Check this device's notification settings.");
      return json({ success: true, pushDevices: sent }, 200, origin);
    }

    if (action === "notify_next_rider") {
      if (!isManager(roles)) throw new Error("Administrator or manager access is required.");
      const eventId = String(body.event_id ?? "");
      const riderId = String(body.rider_id ?? "");
      if (!eventId || !riderId) throw new Error("The event and next rider are required.");
      const { data: stint, error: stintError } = await supabase.from("roster_stints")
        .select("id,rider_id,rosters!inner(event_id,status)")
        .eq("rider_id", riderId).eq("rosters.event_id", eventId).eq("rosters.status", "published")
        .order("scheduled_start", { ascending: true }).limit(1).maybeSingle();
      if (stintError) throw stintError;
      if (!stint) throw new Error("The next rider is not on a published roster for this event.");
      const { data: rider, error: riderError } = await supabase.from("riders")
        .select("first_name,last_name,preferred_name").eq("id", riderId).maybeSingle();
      if (riderError) throw riderError;
      const riderName = rider ? (rider.preferred_name ? rider.preferred_name + " " + rider.last_name : rider.first_name + " " + rider.last_name) : "You";
      const eventName = await getEventName(eventId);
      const { data: links, error: linksError } = await supabase.from("rider_account_links")
        .select("user_id").eq("rider_id", riderId).not("user_id", "is", null);
      if (linksError) throw linksError;
      const riderAccountIds = [...new Set((links ?? []).map((link) => link.user_id).filter(Boolean))];

      // Notify every active administrator as well as the linked account(s) for the next rider.
      const { data: adminRoles, error: adminRolesError } = await supabase.from("member_roles")
        .select("user_id").eq("role", "administrator");
      if (adminRolesError) throw adminRolesError;
      const adminAccountIds = [...new Set((adminRoles ?? []).map((row) => row.user_id).filter(Boolean))];
      const requestedIds = [...new Set([...riderAccountIds, ...adminAccountIds])];
      if (!requestedIds.length) {
        return json({ success: true, rider: riderName, inboxRecipients: 0, pushDevices: 0, message: "No active rider or administrator accounts were found." }, 200, origin);
      }

      const { data: profiles, error: profilesError } = await supabase.from("member_profiles")
        .select("user_id").in("user_id", requestedIds).eq("status", "active");
      if (profilesError) throw profilesError;
      const activeIds = (profiles ?? []).map((profile) => profile.user_id);
      const activeRiderIds = activeIds.filter((id) => riderAccountIds.includes(id));
      const activeAdminIds = activeIds.filter((id) => adminAccountIds.includes(id));
      const riderMessage = "You're getting in the trike next. Please get ready, your stint is approaching!";
      const adminMessage = riderName + " is the next rider and has been notified for " + eventName + ".";
      const recipientMessages = new Map<string, { title: string; message: string }>();
      for (const id of activeAdminIds) recipientMessages.set(id, { title: "Next rider notified", message: adminMessage });
      // If an administrator is also the next rider, keep the rider-facing notification.
      for (const id of activeRiderIds) recipientMessages.set(id, { title: "You're riding next", message: riderMessage });

      const recipientIds = [...recipientMessages.keys()];
      if (!recipientIds.length) {
        return json({ success: true, rider: riderName, inboxRecipients: 0, pushDevices: 0 }, 200, origin);
      }
      const inboxRows = recipientIds.map((recipient_user_id) => ({
        recipient_user_id,
        title: recipientMessages.get(recipient_user_id)!.title,
        message: recipientMessages.get(recipient_user_id)!.message,
        channel: "in_app",
        status: "sent",
        sent_at: new Date().toISOString(),
      }));
      const { error: inboxError } = await supabase.from("notifications").insert(inboxRows);
      if (inboxError) throw inboxError;
      const { data: subscriptions, error: subscriptionsError } = await supabase.from("push_subscriptions")
        .select("user_id,endpoint,subscription").in("user_id", recipientIds);
      if (subscriptionsError) throw subscriptionsError;
      const vapid = vapidJwk();
      let sent = 0, failed = 0;
      for (const item of subscriptions ?? []) {
        const notification = recipientMessages.get(item.user_id) ?? { title: "Next rider notified", message: adminMessage };
        const payload = JSON.stringify({
          title: notification.title,
          body: notification.message,
          icon: "./favicon.svg", badge: "./favicon.svg",
          tag: "team-venom-next-rider-" + eventId,
          data: { url: "./" },
        });
        try {
          await send(item.subscription, payload, {
            vapid,
            subscriber: "https://hughston-cyber.github.io/Team-Venom-Rider-Management-System/",
            ttl: 60 * 60,
            urgency: "high",
          });
          sent++;
        } catch (error) {
          failed++;
          const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
          if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
          console.error("Next rider push delivery failed:", status, String(error));
        }
      }
      return json({
        success: true,
        rider: riderName,
        inboxRecipients: recipientIds.length,
        riderAccountsNotified: activeRiderIds.length,
        administratorAccountsNotified: activeAdminIds.length,
        pushDevices: sent,
        failed,
      }, 200, origin);
    }

    if (action === "send") {
      const type = String(body.type ?? "");
      if (type === "emergency_announcement") {
        if (!roles.includes("administrator")) throw new Error("Only an administrator can send emergency operational announcements.");
      } else if (type === "team_announcement") {
        if (!roles.includes("administrator")) throw new Error("Only an administrator can send team announcements.");
      } else if (!isManager(roles)) {
        throw new Error("Administrator or manager access is required.");
      }

      const built = await buildMessage(type, body);
      const { data: members, error: membersError } = await supabase.from("member_profiles")
        .select("user_id").eq("status", "active");
      if (membersError) throw membersError;
      const memberIds = (members ?? []).map((member) => member.user_id);
      if (memberIds.length) {
        const inboxRows = memberIds.map((recipient_user_id) => ({
          recipient_user_id,
          title: built.sender === "Team Communications" || built.sender === "Emergency Operations" ? built.inboxTitle : built.sender + " · " + built.inboxTitle,
          message: built.message,
          channel: "in_app",
          status: "sent",
          sent_at: new Date().toISOString(),
        }));
        const { error: inboxError } = await supabase.from("notifications").insert(inboxRows);
        if (inboxError) throw inboxError;
      }

      const { data: subscriptions, error: subscriptionsError } = await supabase.from("push_subscriptions")
        .select("user_id,endpoint,subscription").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
      if (subscriptionsError) throw subscriptionsError;
      const vapid = vapidJwk();
      const emergency = type === "emergency_announcement";
      const payload = JSON.stringify({
        title: emergency ? "EMERGENCY · " + built.sender : built.sender,
        body: built.pushBody,
        emergency,
        icon: "./favicon.svg",
        badge: "./favicon.svg",
        tag: "team-venom-" + type,
        data: { url: "./" },
      });
      let sent = 0;
      let failed = 0;
      for (const item of subscriptions ?? []) {
        try {
          await send(item.subscription, payload, {
            vapid,
            subscriber: "https://hughston-cyber.github.io/Team-Venom-Rider-Management-System/",
            ttl: 60 * 60,
            urgency: type === "emergency_announcement" ? "high" : "normal",
          });
          sent++;
        } catch (error) {
          failed++;
          const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
          }
          console.error("Push delivery failed:", status, String(error));
        }
      }
      return json({ success: true, inboxRecipients: memberIds.length, pushDevices: sent, failed }, 200, origin);
    }

    return json({ error: "Unknown action." }, 400, origin);
  } catch (error) {
    console.error("Push notification function error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 400, origin);
  }
});
