// ============================================================
// Student dashboard — UI shell (drawer, notifications, static
// announcements feed, bottom-nav "coming soon" placeholders).
//
// This is deliberately separate from parent-dashboard.js, which
// owns the real Supabase data. This file only reacts to the
// custom events that file dispatches (sdms:alerts, sdms:likes)
// and otherwise handles pure UI chrome that has no backend yet.
// ============================================================

const menuBtn = document.getElementById('menu-btn');
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerLogoutBtn = document.getElementById('drawer-logout-btn');
const logoutBtn = document.getElementById('logout-btn'); // reused by parent-dashboard.js's own logout

const bellBtn = document.getElementById('bell-btn');
const bellDot = document.getElementById('bell-dot');
const bellPopover = document.getElementById('bell-popover');
const notifList = document.getElementById('notif-list');

const avatarBtn = document.getElementById('avatar-btn');
const bottomNavProfile = document.getElementById('bottom-nav-profile');

const toastEl = document.getElementById('dash-toast');
const announceList = document.getElementById('announce-list');

// ------------------------------------------------------------
// Drawer (hamburger menu)
// ------------------------------------------------------------
function openDrawer() {
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerOverlay.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  drawerOverlay.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}

menuBtn?.addEventListener('click', openDrawer);
drawerOverlay?.addEventListener('click', closeDrawer);
document.querySelectorAll('[data-drawer-link]').forEach((el) => {
  el.addEventListener('click', closeDrawer);
});

// The drawer has its own logout entry point (same effect as the
// original top-bar logout button, which parent-dashboard.js wires
// via #logout-btn — that button no longer exists in the new markup,
// so we forward its click handling here instead).
drawerLogoutBtn?.addEventListener('click', () => {
  sessionStorage.removeItem('sdms_parent_student_code');
  window.location.href = '../';
});

// ------------------------------------------------------------
// Notifications (bell) — assembled from real portal signals
// ------------------------------------------------------------
let alertsState = { underCounseling: false, letterEligible: false, incidentCount: 0 };
let likesState = null;

function renderNotifications() {
  const items = [];

  if (alertsState.letterEligible) {
    items.push({
      warning: true,
      title: 'Ibaruwa igenewe ababyeyi',
      body: `Umunyeshuri afite amakosa ${alertsState.incidentCount} yanditswe muri iki gihembwe.`,
    });
  }

  if (alertsState.underCounseling) {
    items.push({
      warning: false,
      title: 'Ubujyanama burakomeje',
      body: 'Umunyeshuri afite gahunda y\'ubujyanama iteganyijwe muri iki gihe.',
    });
  }

  if (likesState && !likesState.eligible) {
    items.push({
      warning: true,
      title: 'Amashimwe arahagaze by\'agateganyo',
      body: 'Kubera ikosa ryanditswe muri iki gihembwe, nta shimwe rishya rishobora guhabwa ubu.',
    });
  } else if (likesState && likesState.eligible && likesState.count > 0) {
    items.push({
      warning: false,
      title: 'Amashimwe mashya',
      body: `Umunyeshuri yahawe amashimwe ${likesState.count} kubera imyitwarire myiza.`,
    });
  }

  bellDot.hidden = items.length === 0;

  if (items.length === 0) {
    notifList.innerHTML = '<p class="dash-empty-note">Nta makuru mashya.</p>';
    return;
  }

  notifList.innerHTML = items.map((n) => `
    <div class="dash-notif-item${n.warning ? ' dash-notif-item--warning' : ''}">
      <p><strong>${n.title}</strong>${n.body}</p>
    </div>
  `).join('');
}

document.addEventListener('sdms:alerts', (e) => {
  alertsState = e.detail;
  renderNotifications();
});

document.addEventListener('sdms:likes', (e) => {
  likesState = e.detail;
  renderNotifications();
});

function toggleBellPopover(force) {
  const show = force ?? bellPopover.hidden;
  bellPopover.hidden = !show;
  bellBtn.setAttribute('aria-expanded', String(show));
}

bellBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleBellPopover();
});

document.addEventListener('click', (e) => {
  if (!bellPopover.hidden && !bellPopover.contains(e.target) && e.target !== bellBtn) {
    toggleBellPopover(false);
  }
});

// ------------------------------------------------------------
// Avatar button / bottom-nav "Umwirondoro" — scrolls to the
// identity card at the top (the fullest view of the student's
// own profile info the portal currently has).
// ------------------------------------------------------------
function goToProfile() {
  document.querySelector('.hero-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

avatarBtn?.addEventListener('click', goToProfile);
bottomNavProfile?.addEventListener('click', goToProfile);

// ------------------------------------------------------------
// "Coming soon" placeholders — nav items the system doesn't
// have real data/pages for yet (subjects, library).
// ------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

document.querySelectorAll('[data-coming-soon]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    closeDrawer();
    showToast('Iyi feature iraza vuba!');
  });
});

// ------------------------------------------------------------
// Announcements — static feed for now (no announcements table
// in the schema yet). Swap this array for a Supabase fetch once
// one exists; the render + markup are already wired for it.
// ------------------------------------------------------------
const ANNOUNCEMENTS = [
  {
    icon: 'megaphone',
    title: "Inteko rusange y'ababyeyi",
    body: "Inteko rusange izabera ku wa Gatandatu, 31 Gicurasi 2025 saa 08:00.",
    date: '20 MAY 2025',
  },
  {
    icon: 'calendar',
    title: 'Ibizamini bya 2nd Term',
    body: 'Ibizamini bya 2nd Term bizatangira ku wa 02/06/2025.',
    date: '16 MAY 2025',
  },
];

const ANNOUNCE_ICONS = {
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
};

function renderAnnouncements() {
  if (!announceList) return;
  announceList.innerHTML = ANNOUNCEMENTS.map((a, idx) => `
    <div class="announce-item">
      <span class="announce-item__icon announce-item__icon--${idx % 2 === 0 ? 'blue' : 'green'}">${ANNOUNCE_ICONS[a.icon] ?? ''}</span>
      <div class="announce-item__body">
        <p class="announce-item__title">${a.title}</p>
        <p class="announce-item__desc">${a.body}</p>
      </div>
      <span class="announce-item__date">${a.date}</span>
    </div>
  `).join('');
}

renderAnnouncements();
