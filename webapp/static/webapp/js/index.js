document.addEventListener('DOMContentLoaded', () => {
  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const getNavH = () => {
    const v = getComputedStyle(root).getPropertyValue('--navbar-height') || '72px';
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 72;
  };

  // ---------- Elements ----------
  const nav = $('.navbar');
  const hero = $('.hero');
  const buttons = $$('.hero-nav__btn');
  const panels  = $$('.section-content');

  if (!nav || !hero) {
    console.warn('[nav/hero] not found. nav=', !!nav, 'hero=', !!hero);
  }

  // ---------- Button scroll (no show/hide) ----------
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        console.warn('[scroll] target not found:', targetId);
      }
    });
  });

  // ---------- Navbar color flip using a sentinel ----------
  if (nav && hero) {
    // Create a 1px sentinel inside the hero where we want the flip to happen
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.position = 'absolute';
    sentinel.style.left = '0';
    sentinel.style.right = '0';
    sentinel.style.height = '1px';
    sentinel.style.pointerEvents = 'none';

    const placeSentinel = () => {
      const navH = getNavH();
      // Flip when we've scrolled past (hero height - nav height)
      sentinel.style.top = `${Math.max(0, hero.offsetHeight - navH)}px`;
    };

    // Ensure hero can position children absolutely
    const heroComputed = getComputedStyle(hero);
    if (heroComputed.position === 'static') {
      hero.style.position = 'relative';
    }

    hero.appendChild(sentinel);
    placeSentinel();

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // If the sentinel is NOT visible, we're past the hero breakpoint
        const scrolled = !entry.isIntersecting;
        nav.classList.toggle('scrolled', scrolled);
        // Debug
        // console.log('[navbar]', { isIntersecting: entry.isIntersecting, scrolled });
      },
      {
        root: null,
        threshold: 0,
        rootMargin: `-${getNavH()}px 0px 0px 0px`, // account for fixed navbar
      }
    );

    obs.observe(sentinel);
    window.addEventListener('resize', placeSentinel);
  }

  // ---------- Keep button "active" in sync with scroll ----------
  if (buttons.length && panels.length) {
    const btnById = new Map(buttons.map(b => [b.dataset.target, b]));
    const sectionObs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            buttons.forEach(b => b.classList.remove('active'));
            btnById.get(e.target.id)?.classList.add('active');
          }
        });
      },
      { root: null, threshold: 0.5, rootMargin: `-${getNavH()}px 0px 0px 0px` }
    );
    panels.forEach(p => sectionObs.observe(p));
  }
});
