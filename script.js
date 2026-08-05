/* ==========================================================================
   Wander landing — interactions (GitHub Pages / static version)
   ========================================================================== */

/* ----- 1. PROMO COUNTDOWN --------------------------------------------------
   EDIT ME: set when the 50%-off launch deal ends (local time).
   Format: "YYYY-MM-DDTHH:MM:SS". When it passes, the promo bar hides itself. */
const PROMO_END = new Date('2026-08-01T23:59:59');

(function countdown() {
  const bar = document.getElementById('promo');
  const cd  = document.getElementById('countdown');
  if (!bar || !cd) return;

  const d = cd.querySelector('[data-d]'), h = cd.querySelector('[data-h]'),
        m = cd.querySelector('[data-m]'), s = cd.querySelector('[data-s]');
  const pad = n => String(n).padStart(2, '0');

  // `timer` MUST be declared (and initialised) before the first tick() call below.
  //
  // THIS EXACT LINE IS WHY THE WHOLE SITE WENT BLANK FOR THREE DAYS (2026-08-02 → 08-05).
  // It used to be `const timer = setInterval(...)` written AFTER the first `tick()`. While the
  // promo was live that was harmless, because the expired branch — the only place that touches
  // `timer` — never ran. The instant PROMO_END passed, the first synchronous tick() took that
  // branch and hit `clearInterval(timer)` with `timer` still in the temporal dead zone:
  // "ReferenceError: Cannot access 'timer' before initialization". The throw escaped this IIFE
  // and killed the rest of script.js, so reveal() never ran and all 28 `.reveal` elements stayed
  // at opacity:0 — a full-height, completely blank page, for every visitor.
  // A `let` initialised up here cannot be in the TDZ when tick() runs, and clearInterval(null)
  // is a no-op, so the expired-on-first-tick path is now safe.
  let timer = null;

  function tick() {
    const diff = PROMO_END - new Date();
    if (diff <= 0) {                 // expired → hide the promo bar entirely
      bar.classList.add('expired');
      const p = document.getElementById('promoPrice');
      if (p) p.textContent = '';
      if (timer) clearInterval(timer);
      return;
    }
    const sec = Math.floor(diff / 1000);
    d.textContent = pad(Math.floor(sec / 86400));
    h.textContent = pad(Math.floor((sec % 86400) / 3600));
    m.textContent = pad(Math.floor((sec % 3600) / 60));
    s.textContent = pad(sec % 60);
  }
  tick();
  // Assignment, not a declaration — `timer` is the `let` above. If the first tick() already took
  // the expired branch this still runs, but tick() will clear it on its next pass; harmless.
  timer = setInterval(tick, 1000);
})();

/* ----- 2. DISMISS PROMO (remembers via localStorage) ---------------------- */
(function promoClose() {
  const bar = document.getElementById('promo');
  const btn = document.getElementById('promoClose');
  if (!bar || !btn) return;
  if (localStorage.getItem('wander_promo_closed') === '1') bar.classList.add('dismissed');
  btn.addEventListener('click', () => {
    bar.classList.add('dismissed');
    localStorage.setItem('wander_promo_closed', '1');
  });
})();

/* ----- 3. NAV: shadow on scroll + mobile menu ----------------------------- */
(function nav() {
  const nav = document.getElementById('nav');
  const ham = document.getElementById('hamburger');
  const menu = document.getElementById('navMobile');

  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (ham && menu) {
    const toggle = (open) => {
      ham.classList.toggle('open', open);
      menu.classList.toggle('open', open);
      ham.setAttribute('aria-expanded', open);
    };
    ham.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
  }
})();

/* ----- 4. SCROLL-SPY (active nav link) ------------------------------------ */
(function scrollSpy() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const map = new Map();
  links.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const sec = document.getElementById(id);
    if (sec) map.set(sec, a);
  });
  if (!map.size) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        map.get(e.target)?.classList.add('active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  map.forEach((_, sec) => obs.observe(sec));
})();

/* ----- 5. REVEAL ON SCROLL ------------------------------------------------ */
(function reveal() {
  const els = document.querySelectorAll('.reveal');
  // No observer support → leave the CSS default (visible). The `.js-reveal` opt-in added by the
  // inline head script is dropped by its own failsafe, so nothing stays hidden.
  if (!('IntersectionObserver' in window) || !els.length) return;

  const obs = new IntersectionObserver((entries, o) => {
    // The observer has actually reported, so it IS driving the animation — tell the head script's
    // failsafe to stand down. Set here rather than at setup time on purpose: an observer that is
    // constructed but never fires (background tab, prerender) must still trip the failsafe, or the
    // page stays blank exactly the way it did for three days in August 2026.
    window.__wanderRevealReady = true;
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), (i % 4) * 70);
        o.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach(e => obs.observe(e));
})();

/* ----- 6. CONTACT FORM (static: opens the user's mail client via mailto) --- */
(function contact() {
  const form = document.getElementById('contactForm');
  const msg  = document.getElementById('formMsg');
  if (!form) return;
  form.addEventListener('submit', () => {
    // The form's action="mailto:" opens the mail app with the fields prefilled.
    if (msg) { msg.textContent = 'Opening your email app…'; msg.className = 'form-msg ok'; }
  });
})();

/* ----- 7. Footer year ----------------------------------------------------- */
document.getElementById('year').textContent = new Date().getFullYear();
