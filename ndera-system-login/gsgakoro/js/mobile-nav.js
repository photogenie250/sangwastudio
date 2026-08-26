// ============================================================
// SDMS — Mobile bottom navigation + "More" drawer
//
// The sidebar's link list is hidden below 900px with nothing to
// replace it (see dashboard.css: .sidebar__nav { display: none }).
// This module is a self-contained drop-in: import it on any
// authenticated shell page and it builds a fixed bottom tab bar
// (Dashboard / Students / Incidents / Reports / More) plus a
// slide-up drawer for the remaining links.
//
// Self-contained on purpose — it reads its own session/role
// rather than depending on another page's script having already
// run, so a single <script type="module" src="../js/mobile-nav.js">
// tag is enough to enable it anywhere.
// ============================================================
import { supabase } from './supabase-client.js';

const PRIMARY = [
  { href: '../dashboard-admin/', label: 'Dashboard', match: 'dashboard-admin', icon: 'home' },
  { href: '../students/', label: 'Students', match: 'students', icon: 'users' },
  { href: '../incidents/', label: 'Incidents', match: 'incidents', icon: 'alert' },
  { href: '../reports/', label: 'Reports', match: 'reports', icon: 'chart' },
];

const MORE = [
  { href: '../classes/', label: 'Classes', match: 'classes', icon: 'building', adminOnly: true },
  { href: '../offenses/', label: 'Offenses', match: 'offenses', icon: 'shield', adminOnly: true },
  { href: '../evaluation/', label: 'Evaluation', match: 'evaluation', icon: 'droplet' },
  { href: '../users/', label: 'Users', match: 'users', icon: 'user-cog', adminOnly: true },
  { href: '../counseling/', label: 'Counseling', match: 'counseling', icon: 'message' },
  { href: '../letters/', label: 'Letters', match: 'letters', icon: 'mail' },
];

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16.5 4.6a3.2 3.2 0 0 1 0 6.3"/><path d="M17.5 14.3c2.9.6 4 2.7 4 5.7"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none"/>',
  chart: '<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h2"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.6 3.1 7.9 7.5 9 4.4-1.1 7.5-4.4 7.5-9V6L12 3Z"/>',
  droplet: '<path d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3Z"/>',
  'user-cog': '<circle cx="9.5" cy="8" r="3"/><path d="M3.5 20c0-3.5 2.7-5.8 6-5.8s6 2.3 6 5.8"/><circle cx="18.5" cy="8.5" r="2"/><path d="M18.5 5.6v1M18.5 10.4v1M15.9 8.5h1M20.1 8.5h1"/>',
  message: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m4 6.5 8 6.5 8-6.5"/>',
  logout: '<path d="M9 21H5a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 5 3h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
}

function currentSection() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // .../ndera-system-login/gsgakoro/<section>/  -> second to last segment
  return parts[parts.length - 2] || parts[parts.length - 1] || '';
}

function buildBottomBar(section) {
  const bar = document.createElement('nav');
  bar.className = 'mobile-nav';
  bar.setAttribute('aria-label', 'Primary');

  const itemsHtml = PRIMARY.map((item) => {
    const active = item.match === section;
    return `<a class="mobile-nav__item${active ? ' mobile-nav__item--active' : ''}" href="${item.href}">${icon(item.icon)}<span>${item.label}</span></a>`;
  }).join('');

  const moreActive = MORE.some((m) => m.match === section);
  const moreBtn = `<button type="button" class="mobile-nav__item${moreActive ? ' mobile-nav__item--active' : ''}" id="mobile-nav-more-btn">${icon('more')}<span>More</span></button>`;

  bar.innerHTML = itemsHtml + moreBtn;
  return bar;
}

function buildDrawer(section, role) {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-drawer';
  wrap.id = 'mobile-nav-drawer';

  const visibleMore = MORE.filter((m) => !m.adminOnly || role === 'administrator' || role === 'teacher');

  const linksHtml = visibleMore.map((item) => {
    const active = item.match === section;
    return `<a class="mobile-drawer__link${active ? ' mobile-drawer__link--active' : ''}" href="${item.href}">${icon(item.icon)}${item.label}</a>`;
  }).join('');

  wrap.innerHTML = `
    <div class="mobile-drawer__scrim" id="mobile-nav-scrim"></div>
    <div class="mobile-drawer__sheet" role="dialog" aria-modal="true" aria-label="More navigation">
      <div class="mobile-drawer__handle"></div>
      <p class="mobile-drawer__title">More</p>
      ${linksHtml}
      <div class="mobile-drawer__divider"></div>
      <button type="button" class="mobile-drawer__signout" id="mobile-nav-signout">${icon('logout')} Sign out</button>
    </div>
  `;
  return wrap;
}

function wireDrawer(drawer, moreBtn) {
  const open = () => drawer.classList.add('is-open');
  const close = () => drawer.classList.remove('is-open');

  moreBtn.addEventListener('click', open);
  drawer.querySelector('#mobile-nav-scrim').addEventListener('click', close);
  drawer.querySelector('#mobile-nav-signout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '../';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

(async function initMobileNav() {
  const section = currentSection();

  // Best-effort role lookup, purely to decide which "More" links to
  // show — RLS remains the real access boundary regardless of what
  // this shows or hides.
  let role = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      role = profile?.role ?? null;
    }
  } catch {
    role = null;
  }

  const bar = buildBottomBar(section);
  const drawer = buildDrawer(section, role);

  document.body.classList.add('has-mobile-nav');
  document.body.appendChild(drawer);
  document.body.appendChild(bar);

  wireDrawer(drawer, bar.querySelector('#mobile-nav-more-btn'));
})();
