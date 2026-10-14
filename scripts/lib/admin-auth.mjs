/* Decides whether a Supabase onAuthStateChange event should trigger a full
   re-route (checkAuthAndRoute()) in the admin panel — i.e. reset the UI to
   the Projects tab and reload data. Mirrored by hand in js/admin.js's
   handleAuthStateChange (browser classic script, can't import this Node
   module). Keep the two in sync if the rule changes.

   Rule: TOKEN_REFRESHED never reroutes (same session, just a renewed
   token). SIGNED_OUT always reroutes. Anything else only reroutes when the
   event's user differs from the one already shown as authorized — a
   duplicate SIGNED_IN fired when the tab regains focus, for the same user,
   must NOT wipe whatever the admin was mid-typing in a form. */
export function shouldRerouteOnAuthEvent(event, userId, authorizedUserId) {
  if (event === "TOKEN_REFRESHED") return false;
  if (event === "SIGNED_OUT") return true;
  if (userId && userId === authorizedUserId) return false;
  return true;
}
