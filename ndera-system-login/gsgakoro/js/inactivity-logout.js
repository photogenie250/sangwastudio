// ============================================================
// SDMS — Staff inactivity auto-logout
//
// Watches for user activity (mouse, keyboard, touch, scroll) and
// calls onTimeout() once none of it has happened for `timeoutMs`.
// Used on every authenticated staff page to sign someone out
// automatically if the tab is left open and unattended (e.g. on a
// shared office computer) — mirrors the same protection already
// in place on the parent portal.
// ============================================================

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

export function startInactivityLogout({ timeoutMs = 5 * 60 * 1000, onTimeout }) {
  let timer = null;

  function reset() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onTimeout, timeoutMs);
  }

  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));

  // Also reset when the tab regains focus/visibility, so time spent
  // on another tab/app doesn't silently burn down the countdown in a
  // way the staff member can't see, and re-checks it once they're back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reset();
  });

  reset();

  // Returns a cleanup function, in case a page ever wants to stop
  // watching for activity (not currently used, but cheap to have).
  return () => {
    if (timer) clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
  };
}
