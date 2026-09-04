/* ---------- Nav scroll state ---------- */
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

/* ---------- Mobile drawer ---------- */
const burger = document.getElementById('burgerBtn');
const drawer = document.getElementById('mobileDrawer');
burger.addEventListener('click', () => {
  burger.classList.toggle('open');
  drawer.classList.toggle('open');
});
drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  burger.classList.remove('open'); drawer.classList.remove('open');
}));

/* ---------- Reveal on scroll ---------- */
const revealEls = document.querySelectorAll('.reveal');
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } });
}, { threshold: 0.15 });
revealEls.forEach(el => revealObs.observe(el));

/* ---------- Divider draw-in ---------- */
document.querySelectorAll('.divider').forEach(d => {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: 0.4 });
  obs.observe(d);
});

/* ---------- Counters ---------- */
const counters = document.querySelectorAll('.count');
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = parseInt(el.dataset.target, 10);
    const dur = 1600;
    const start = performance.now();
    function tick(now){
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target);
      if (p < 1) requestAnimationFrame(tick); else el.textContent = target;
    }
    requestAnimationFrame(tick);
    counterObs.unobserve(el);
  });
}, { threshold: 0.6 });
counters.forEach(c => counterObs.observe(c));

/* ---------- Portfolio filter ---------- */
const filterBtns = document.querySelectorAll('.filter-btn');
const tiles = document.querySelectorAll('.p-tile');
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    tiles.forEach(t => {
      const match = f === 'all' || t.dataset.cat === f;
      t.classList.toggle('hidden-tile', !match);
    });
  });
});

/* ---------- Hero background slideshow ---------- */
const heroSlides = document.querySelectorAll('.hero-slide');
const heroSlidesWrap = document.querySelector('.hero-slides');
const heroLightSweep = document.getElementById('heroLightSweep');
let heroIndex = 0;

function fireHeroFlash(){
  if (heroLightSweep){
    heroLightSweep.classList.remove('flash');
    void heroLightSweep.offsetWidth; // reflow so the animation restarts every time
    heroLightSweep.classList.add('flash');
  }
  if (heroSlidesWrap){
    heroSlidesWrap.classList.remove('flash-pop');
    void heroSlidesWrap.offsetWidth;
    heroSlidesWrap.classList.add('flash-pop');
  }
}

if (heroSlides.length > 1){
  setInterval(() => {
    heroSlides[heroIndex].classList.remove('active');
    heroIndex = (heroIndex + 1) % heroSlides.length;
    heroSlides[heroIndex].classList.add('active');
    fireHeroFlash();
  }, 5500);
}

// initial flash shortly after the page loads, alongside the headline entrance
window.setTimeout(fireHeroFlash, 300);

/* ---------- Testimonials carousel ---------- */
const slides = document.querySelectorAll('.t-slide');
const dots = document.querySelectorAll('.t-dot');
let tIndex = 0;
function showSlide(i){
  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));
  slides[i].classList.add('active');
  dots[i].classList.add('active');
  tIndex = i;
}
dots.forEach(d => d.addEventListener('click', () => showSlide(parseInt(d.dataset.i, 10))));
setInterval(() => showSlide((tIndex + 1) % slides.length), 6000);

/* ---------- Service catalogue per division ---------- */
const SERVICE_OPTIONS = {
  photo: ["Wedding Photography", "Portrait Session", "Graduation Shoot", "Corporate / Event Coverage", "Product / Commercial Shoot", "Other Photo Project"],
  video: ["Wedding Film", "Event Coverage", "Live Streaming", "Video Editing", "Commercial / Brand Video", "Other Video Project"],
  music: ["Studio Recording Session", "Mixing & Mastering", "Beat Production", "Podcast / Voiceover Recording", "Live Session Recording", "Other Music Project"]
};
const divisionLabel = { photo: "SANGWA PHOTO", video: "SANGWA VIDEO", music: "SANGWA MUSIC" };

const ofDivision = document.getElementById('ofDivision');
const ofService = document.getElementById('ofService');
const orderTabs = document.querySelectorAll('.order-tab');

function setDivision(div){
  ofDivision.value = div;
  orderTabs.forEach(t => t.classList.toggle('active', t.dataset.division === div));
  ofService.innerHTML = '<option value="">Select a service</option>' +
    SERVICE_OPTIONS[div].map(s => `<option>${s}</option>`).join('');
}
setDivision('photo');

orderTabs.forEach(tab => tab.addEventListener('click', () => setDivision(tab.dataset.division)));
document.querySelectorAll('.order-cta').forEach(btn => {
  btn.addEventListener('click', () => {
    setDivision(btn.dataset.division);
    document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
  });
});

/* ---------- Telegram helper links ---------- */
function tgLink(text){
  const username = window.TELEGRAM_USERNAME || "sangwastudio_bot";
  return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
}
document.getElementById('tgFloat').href = tgLink("Hello SANGWA STUDIO! I'd like to know more about your services.");
document.getElementById('tgFooterLink').href = tgLink("Hello SANGWA STUDIO! I'd like to know more about your services.");

/* ---------- Order form submit ---------- */
const orderForm = document.getElementById('orderForm');
const toast = document.getElementById('formToast');

function showToast(msg, ok){
  toast.textContent = msg;
  toast.className = 'toast show ' + (ok ? 'ok' : 'err');
}

orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(orderForm);
  const data = Object.fromEntries(fd.entries());

  if (!window.sbClient){
    showToast("Booking system isn't connected yet — please contact us directly using the details above.", false);
    console.error("window.sbClient is not set. Check js/config.js has your real SUPABASE_URL and SUPABASE_ANON_KEY, and that the Supabase script tag loads before config.js and main.js.");
    return;
  }

  // Save the booking and confirm in-page. The studio owner gets pinged
  // on Telegram automatically via a Supabase Database Webhook + Edge
  // Function — see README section 3. The customer never sees Telegram.
  const { error } = await window.sbClient.from('orders').insert([{
    division: data.division,
    service_type: data.serviceType,
    full_name: data.fullName,
    phone: data.phone,
    email: data.email || null,
    event_date: data.eventDate || null,
    budget: data.budget,
    details: data.details || null
  }]);

  if (error){
    console.error(error);
    showToast("Something went wrong saving your booking — please try again, or reach us directly using the details above.", false);
    return;
  }

  showToast("Booking received! We'll confirm with you shortly.", true);
  orderForm.reset();
  setDivision(data.division);
});

document.getElementById('yearNow').textContent = new Date().getFullYear();

/* ---------- Quick message form (saves to Supabase `messages` table) ---------- */
const messageForm = document.getElementById('messageForm');
const messageToast = document.getElementById('messageToast');

function showMessageToast(msg, ok){
  messageToast.textContent = msg;
  messageToast.className = 'toast show ' + (ok ? 'ok' : 'err');
}

if (messageForm){
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(messageForm);
    const data = Object.fromEntries(fd.entries());

    if (window.sbClient){
      const { error } = await window.sbClient.from('messages').insert([{
        full_name: data.fullName,
        email: data.email || null,
        subject: data.subject || null,
        message: data.message
      }]);
      if (error){
        console.error(error);
        showMessageToast("Couldn't save your message — opening email instead.", false);
        window.location.href = `mailto:hello@gakoromedia.rw?subject=${encodeURIComponent(data.subject || 'Website message')}&body=${encodeURIComponent(data.message + '\n\n— ' + data.fullName)}`;
      } else {
        showMessageToast("Message sent. We'll get back to you soon.", true);
        messageForm.reset();
      }
    } else {
      // Supabase not configured yet — fall back to opening the visitor's email client
      showMessageToast("Opening your email app to send this message...", true);
      window.location.href = `mailto:hello@gakoromedia.rw?subject=${encodeURIComponent(data.subject || 'Website message')}&body=${encodeURIComponent(data.message + '\n\n— ' + data.fullName)}`;
      messageForm.reset();
    }
  });
}
