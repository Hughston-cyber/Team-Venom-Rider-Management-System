# Team Venom Connected Offline for macOS

## Goal

Deliver a macOS Apple Silicon desktop client that keeps the existing Team Venom Rider Management System as the source of truth. It should present the same workspaces and permissions as the web app, remain useful during an internet outage, and reconcile approved offline work when connectivity returns.

The current `mac-app` prototype is a local-only demonstration. It is not the connected release and must not be installed as the operational system.

## Existing production services

- Supabase project: `xqfbmioydhuycvvkafwq`
- Existing Supabase Auth and role model: `member_profiles`, `member_roles`, `rider_account_links`
- Existing operational tables: `riders`, `race_events`, `rosters`, `roster_stints`, `live_race_state`
- Existing notifications: `notifications`, `notification_preferences`, `push_subscriptions`
- Existing Edge Functions include `push-notifications` and `rider-account-management`
- Existing browser client uses the Supabase publishable key. No service-role or secret key may be placed in the desktop application.

## Recommended architecture

1. **Shared application experience:** Reuse the production web app's UI, navigation, business rules and role visibility rather than maintaining a separate reduced Race Control interface.
2. **Desktop shell:** Electron, Apple Silicon ARM64, context isolation enabled, Node integration disabled, sandbox enabled, and a narrowly scoped preload bridge.
3. **Authentication:** Use the same Supabase Auth project and the same administrator-email / rider-username sign-in rules. Persist refreshable session material only in OS-protected storage (Electron safeStorage backed by macOS Keychain where available). Never store passwords.
4. **Local database:** SQLite on the Mac. Encrypt sensitive local records or the database key using OS-protected storage. Cache only records the signed-in user is authorised to read.
5. **Connectivity and realtime:** Supabase Realtime while connected, with explicit reconnect/resubscribe and a full delta refresh after reconnect. Realtime messages are hints; the database remains authoritative.
6. **Outbox:** Store offline mutations as durable, uniquely identified operations. Each operation includes the signed-in user, entity, expected server version/state, creation time, and an idempotency UUID. Retry safely and mark each item synced, conflicted, or rejected.
7. **Conflict handling:** Never use blind last-write-wins for live race state. A changeover must include the expected current stint ID and be accepted atomically by the server only if that state still matches. A stale or competing changeover is shown for manager review, not replayed over newer live state.
8. **Notifications:** Create/send notifications only after the server confirms the corresponding operation. Offline notifications are queued as pending intent and delivered after successful reconciliation; push cannot be delivered while the Mac has no network.
9. **Software updates:** Publish signed/notarised Apple Silicon builds as GitHub Releases and use Electron's update mechanism. Check for updates when online, show release notes, and ask before installing/restarting. Web content/data changes continue to come from the shared service.
10. **Backups and recovery:** Keep an export/restore facility, automatic local database migrations, and a visible last-sync timestamp plus pending/conflict counts.

## Offline behaviour policy

### Available offline after a successful online sign-in and initial data download

- View cached events, published rosters, rider directory and permitted performance records.
- View the last known live Race Control state.
- Run the race clock locally using timestamps, so it survives app restarts.
- Record supported offline operational actions in the outbox.
- Prepare draft roster edits locally where the app can preserve the original server version for conflict checks.

### Online-only or requiring server confirmation

- Sign-in for the first time, password changes, account creation, role changes and account revocation.
- Publishing a roster, destructive deletes, private management notes and other sensitive administrative mutations until explicit conflict-safe workflows exist.
- Sending announcements, emergency push alerts, Gmail OAuth actions and push subscription management.
- Finalising a live changeover against a stale server state. Offline changeover is recorded as pending and must be reconciled against the expected current stint before it becomes official.

## Delivery phases

### Phase 1 — audit and desktop foundation
- Confirm the exact production app entry points, auth flow, role rules, RPCs, Edge Functions, table policies and notification behaviour.
- Replace the standalone prototype UI with a desktop shell around the shared app experience.
- Add safe local storage and connection status without changing production data.

### Phase 2 — authenticated online parity
- Add shared Supabase login, role-aware workspaces, live reads/writes and Realtime.
- Verify rider username login and administrator email login separately.
- Verify next-rider alerts, administrator alerts and existing emergency/team notification flows.

### Phase 3 — offline cache and outbox
- Add local cache, migrations, offline indicator, queue viewer and deterministic replay.
- Add idempotent server-side operation handling and expected-state checks before enabling offline live operations.
- Add explicit conflict resolution and an audit trail.

### Phase 4 — updates and release
- Build and test ARM64 .dmg.
- Configure signed/notarised releases and safe update prompts.
- Test online -> offline -> online, interrupted sync, duplicate retry, stale changeover, account revocation and app upgrade with queued operations.

## Release gates

Do not call this production-ready until:
- The same Supabase roles and RLS policies protect desktop requests.
- No service-role key or other server secret exists in the app bundle.
- Local cached data is protected and cleared appropriately on sign-out/account revocation.
- Every queued mutation is idempotent and audited.
- Conflicts cannot silently change the live rider or race clock.
- Notifications are sent only after server-confirmed operations.
- ARM64 packaging and update installation are tested on the target Mac.

## Important scope boundary

This desktop client connects to the Rider Management System's existing Supabase backend. Other Team Venom systems (Viper AI, Media Department, World Works Photography, etc.) can be connected only through their own supported APIs/integrations and their own permissions. They are not automatically mirrored just because the Mac client is installed.
