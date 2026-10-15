// Drawer, notification popover, logout, toast.
const $ = (id) => document.getElementById(id);
const drawer = $('drawer'), overlay = $('drawer-overlay'), menuBtn = $('menu-btn');
const bellBtn = $('bell-btn'), pop = $('bell-popover');

function setDrawer(open) {
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  menuBtn.setAttribute('aria-expanded', String(open));
  overlay.hidden = !open;
}
menuBtn.addEventListener('click', () => setDrawer(!drawer.classList.contains('is-open')));
overlay.addEventListener('click', () => setDrawer(false));
document.querySelectorAll('[data-drawer-link]').forEach((a) => a.addEventListener('click', () => setDrawer(false)));

bellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pop.hidden = !pop.hidden;
  bellBtn.setAttribute('aria-expanded', String(!pop.hidden));
});
document.addEventListener('click', (e) => { if (!pop.contains(e.target)) pop.hidden = true; });

$('drawer-logout-btn').addEventListener('click', () => window.dispatchEvent(new Event('sdms-logout')));
$('avatar-btn').addEventListener('click', () => setDrawer(true));
