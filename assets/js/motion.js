/* V-Track · motion design (GSAP + ScrollTrigger + SplitText + Flip, défilement doux Lenis). */
(function () {
  'use strict';
  if (!window.gsap) { window.Motion = null; return; }

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var root = document.documentElement;
  if (RM) root.classList.add('rm');
  [window.ScrollTrigger, window.SplitText, window.Flip].forEach(function (p) { if (p) gsap.registerPlugin(p); });
  gsap.config({ nullTargetWarn: false });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var lenis = null, ctx = null, mm = null;
  var vel = 0, svel = 0, lastY = 0;
  var strips = [], marquees = [], skews = [];
  var tread = 0, TILE = 48;

  /* ------------------------------------------------------------ boucle */
  function tick(time, dtMs) {
    var dt = Math.min(dtMs || 16, 50) / 1000;
    if (!lenis) { var y = window.scrollY; vel = (y - lastY) / Math.max(dt * 60, 0.5); lastY = y; }
    svel += (vel - svel) * 0.12;
    if (RM) return;
    var dir = svel < -0.4 ? -1 : 1;
    var sp = 36 + Math.min(Math.abs(svel) * 46, 1100);
    tread -= sp * dt * dir;
    var tx = ((tread % TILE) - TILE) % TILE;
    for (var i = 0; i < strips.length; i++) strips[i].style.transform = 'translate3d(' + tx.toFixed(2) + 'px,0,0)';
    for (i = 0; i < marquees.length; i++) {
      var m = marquees[i];
      if (!m.half) m.half = m.el.scrollWidth / 2;
      m.x -= (55 + Math.min(Math.abs(svel) * 26, 700)) * dt * dir;
      if (m.x <= -m.half) m.x += m.half;
      if (m.x > 0) m.x -= m.half;
      m.el.style.transform = 'translate3d(' + m.x.toFixed(2) + 'px,0,0)';
    }
    var sk = gsap.utils.clamp(-5, 5, -svel * 0.22);
    for (i = 0; i < skews.length; i++) skews[i](sk);
  }
  function cache(scope) {
    strips = $$('.tread-strip');
    marquees = $$('[data-marquee]', scope).map(function (el) { return { el: el, x: 0, half: 0 }; });
    skews = FINE ? $$('[data-skew]', scope).map(function (el) { return gsap.quickSetter(el, 'skewX', 'deg'); }) : [];
  }

  /* ------------------------------------------------------------ init */
  function init() {
    if (!RM && window.Lenis) {
      lenis = new Lenis({ lerp: 0.105, smoothWheel: true, wheelMultiplier: 1 });
      lenis.on('scroll', function (e) { if (window.ScrollTrigger) ScrollTrigger.update(); vel = e.velocity || 0; });
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
    gsap.ticker.add(tick);
    header();
    navIndicator();
    $$('[data-magnetic]').forEach(magnet);
    footerWord();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); });
    window.addEventListener('resize', function () { marquees.forEach(function (m) { m.half = 0; }); });
  }

  function header() {
    var h = $('[data-hdr]'); if (!h) return;
    var last = window.scrollY;
    var upd = function () {
      var y = window.scrollY;
      h.classList.toggle('is-solid', y > 24);
      if (!root.classList.contains('is-locked')) {
        if (y > 220 && y > last + 3) h.classList.add('is-hidden');
        else if (y < last - 3 || y < 220) h.classList.remove('is-hidden');
      }
      last = y;
    };
    window.addEventListener('scroll', upd, { passive: true });
    upd();
  }
  function showHeader() { var h = $('[data-hdr]'); if (h) h.classList.remove('is-hidden'); }

  function navIndicator() {
    var nav = $('[data-nav]'), ind = nav && $('.nav-ind', nav); if (!ind) return;
    function to(a, instant) {
      if (!a) { gsap.to(ind, { opacity: 0, duration: 0.25 }); return; }
      gsap.to(ind, { x: a.offsetLeft, width: a.offsetWidth, opacity: 1, duration: instant ? 0 : 0.45, ease: 'expo.out' });
    }
    $$('.nav-a', nav).forEach(function (a) { a.addEventListener('mouseenter', function () { to(a); }); a.addEventListener('focus', function () { to(a); }); });
    nav.addEventListener('mouseleave', function () { to($('.nav-a.is-on', nav)); });
    Motion._nav = function () { to($('.nav-a.is-on', nav), false); };
  }

  function magnet(el) {
    if (!FINE || RM || el._mg) return; el._mg = 1;
    var xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' }), yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.22); yTo((e.clientY - r.top - r.height / 2) * 0.32);
    });
    el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
  }
  function tilt(el) {
    if (!FINE || RM || el._tl) return; el._tl = 1;
    var rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' }), ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    gsap.set(el, { transformPerspective: 900 });
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 8); rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    el.addEventListener('pointerleave', function () { rx(0); ry(0); });
  }
  function footerWord() {
    var w = $('[data-ft-word]'); if (!w || !window.ScrollTrigger || RM) return;
    var spans = $$('span', w);
    gsap.set(spans, { yPercent: 105 });
    ScrollTrigger.create({
      trigger: w, start: 'top 95%',
      onEnter: function () { gsap.to(spans, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05, overwrite: true }); },
      onLeaveBack: function () { gsap.to(spans, { yPercent: 105, duration: 0.4, ease: 'power2.in', overwrite: true }); }
    });
  }

  /* ------------------------------------------------------------ préchargement */
  function intro() {
    return new Promise(function (res) {
      var pl = $('[data-pl]');
      var seen = false; try { seen = sessionStorage.getItem('vt.pl') === '1'; sessionStorage.setItem('vt.pl', '1'); } catch (e) { /* */ }
      if (!pl) { res(); return; }
      if (RM || seen) { pl.remove(); res(); return; }
      // Le logo Valmat se trace, se remplit, puis rejoint sa place dans l'en-tête
      var q = gsap.utils.selector(pl), logo = $('.pl-logo', pl), parts = q('.vm-p');
      var mark = $('.hdr-logo svg');
      parts.forEach(function (p) { p.setAttribute('pathLength', '1'); });
      gsap.set(parts, { fillOpacity: 0, strokeDasharray: '1 1', strokeDashoffset: 1 });
      if (mark) gsap.set(mark, { visibility: 'hidden' });
      var tl = gsap.timeline();
      tl.fromTo(q('.vm-val'), { x: -150 }, { x: 0, duration: 1.4, ease: 'expo.out' }, 0.1)
        .fromTo(q('.vm-mat'), { x: 150 }, { x: 0, duration: 1.4, ease: 'expo.out' }, 0.1)
        .to(parts, { strokeDashoffset: 0, duration: 0.9, stagger: 0.08, ease: 'power2.inOut' }, 0.1)
        .fromTo(q('.pl-bar i'), { scaleX: 0 }, { scaleX: 1, duration: 1.5, ease: 'power2.inOut' }, 0.1)
        .to(parts, { fillOpacity: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out' }, 0.8)
        .to(parts, { strokeOpacity: 0, duration: 0.3 }, 1.4)
        .to(q('.pl-bar'), { opacity: 0, duration: 0.25 }, 1.6)
        .add(function () {
          if (!mark) return;
          var a = logo.getBoundingClientRect(), b = mark.getBoundingClientRect();
          gsap.to(logo, { x: b.left + b.width / 2 - a.left - a.width / 2, y: b.top + b.height / 2 - a.top - a.height / 2, scale: b.width / a.width, duration: 1, ease: 'expo.inOut' });
        }, 1.75)
        .to(q('.pl-p'), { yPercent: -100, duration: 1, ease: 'expo.inOut', stagger: 0.08 }, 1.85)
        .add(res, 1.95)
        .add(function () { if (mark) gsap.set(mark, { clearProps: 'visibility' }); pl.remove(); }, 2.95);
    });
  }

  /* ------------------------------------------------------------ transitions de page */
  function leave(label) {
    return new Promise(function (res) {
      if (RM) { res(); return; }
      var pt = $('[data-pt]'); $('.pt-label', pt).textContent = label;
      gsap.set(pt, { visibility: 'visible' });
      var q = gsap.utils.selector(pt);
      gsap.timeline({ onComplete: res })
        .fromTo(q('.pt-a'), { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: 'expo.inOut' }, 0)
        .fromTo(q('.pt-b'), { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: 'expo.inOut' }, 0.07)
        .fromTo(q('.pt-icon'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }, 0.28)
        .fromTo(q('.pt-label'), { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: 'expo.out' }, 0.3)
        .fromTo(q('.pt-bar i'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, 0.25);
    });
  }
  function uncover() {
    var pt = $('[data-pt]'); var q = gsap.utils.selector(pt);
    return gsap.timeline({ onComplete: function () { gsap.set(pt, { visibility: 'hidden' }); } })
      .to(q('.pt-label'), { yPercent: -110, duration: 0.4, ease: 'power3.in' }, 0)
      .to(q('.pt-icon'), { y: -14, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0)
      .to(q('.pt-b'), { yPercent: -100, duration: 0.75, ease: 'expo.inOut' }, 0.1)
      .to(q('.pt-a'), { yPercent: -100, duration: 0.75, ease: 'expo.inOut' }, 0.18);
  }

  function enter(scope, route, opts) {
    opts = opts || {};
    if (ctx) { ctx.revert(); ctx = null; }
    if (mm) { mm.revert(); mm = null; }
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
    showHeader();
    cache(scope);
    $$('[data-magnetic]', scope).forEach(magnet);
    $$('[data-tilt]', scope).forEach(tilt);
    if (Motion._nav) Motion._nav();
    return new Promise(function (res) {
      var run = function (D) {
        mm = gsap.matchMedia();
        ctx = gsap.context(function () { return animateView(scope, route, D); }, scope);
        requestAnimationFrame(function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); });
      };
      if (opts.first) intro().then(function () { run(0.12); res(); });
      else if (RM) { run(0); res(); }
      else { run(0.34); uncover().eventCallback('onComplete', function () { gsap.set('[data-pt]', { visibility: 'hidden' }); res(); }); }
    });
  }

  /* ------------------------------------------------------------ animations de vue */
  function inView(el) { var r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }
  function st(el, extra) { var o = { trigger: el, start: 'top 90%', once: true }; for (var k in extra) o[k] = extra[k]; return o; }

  function animateView(scope, route, D) {
    var cleanups = [];
    if (RM) {
      $$('[data-count]', scope).forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
      return function () {};
    }
    var delayFor = function (el) { return inView(el) ? D : 0; };

    var hero = $('[data-hero]', scope);
    if (hero) cleanups.push(heroAnim(hero, D));

    // titres découpés en lignes
    $$('[data-split]', scope).forEach(function (el) {
      var d = delayFor(el);
      gsap.set(el, { opacity: 1 });
      if (!window.SplitText) { gsap.from(el, { opacity: 0, y: 30, duration: 1, delay: d, scrollTrigger: st(el) }); return; }
      SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'sl', autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.lines, { yPercent: 108, duration: 1.1, ease: 'expo.out', stagger: 0.09, delay: d, scrollTrigger: st(el) });
        }
      });
    });

    // apparitions génériques
    $$('[data-reveal]', scope).forEach(function (el) {
      var type = el.getAttribute('data-reveal');
      if (type === 'card' || type === 'door') return;
      var d = delayFor(el);
      if (type === 'fade') gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, delay: d, ease: 'power2.out', scrollTrigger: st(el) });
      else if (type === 'clip') {
        gsap.fromTo(el, { opacity: 1, clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, delay: d, ease: 'expo.inOut', scrollTrigger: st(el), clearProps: 'clipPath' });
        var im = $('img', el); if (im) gsap.fromTo(im, { scale: 1.3 }, { scale: 1, duration: 1.8, delay: d, ease: 'expo.out', scrollTrigger: st(el) });
      } else if (type === 'stagger') {
        gsap.set(el, { opacity: 1 });
        gsap.fromTo(el.children, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, delay: d, scrollTrigger: st(el) });
      } else if (type === 'rows') {
        gsap.set(el, { opacity: 1 });
        gsap.fromTo($$('tbody tr', el), { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out', stagger: 0.04, delay: d, scrollTrigger: st(el) });
      } else gsap.fromTo(el, { opacity: 0, y: 38 }, { opacity: 1, y: 0, duration: 0.95, delay: d, ease: 'power3.out', scrollTrigger: st(el) });
    });

    // cartes produits par lots
    var cards = $$('[data-reveal="card"]', scope);
    if (cards.length && window.ScrollTrigger) {
      gsap.set(cards, { y: 46 });
      ScrollTrigger.batch(cards, {
        start: 'top 94%', once: true,
        onEnter: function (b) { gsap.to(b, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: inView(b[0]) ? D * 0.6 : 0, overwrite: true }); }
      });
    }

    // portes d'entrée
    var doors = $$('[data-reveal="door"]', scope);
    if (doors.length) {
      gsap.set(doors, { opacity: 1, clipPath: 'inset(100% 0% 0% 0%)' });
      ScrollTrigger.batch(doors, {
        start: 'top 88%', once: true,
        onEnter: function (b) {
          gsap.to(b, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'expo.inOut', stagger: 0.11 });
          gsap.fromTo(b.map(function (x) { return $('.door-media', x); }), { scale: 1.4 }, { scale: 1, duration: 1.8, ease: 'expo.out', stagger: 0.11 });
          gsap.fromTo(b.map(function (x) { return $('.door-body', x); }), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.11, delay: 0.45 });
        }
      });
    }

    // compteurs
    $$('[data-count]', scope).forEach(function (el) {
      var target = Number(el.getAttribute('data-count')), o = { v: 0 };
      el.textContent = '0';
      gsap.to(o, { v: target, duration: 1.8, ease: 'power3.out', delay: delayFor(el), scrollTrigger: st(el), onUpdate: function () { el.textContent = Math.round(o.v); } });
    });
    $$('.commit-line', scope).forEach(function (el) {
      gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'expo.inOut', delay: delayFor(el), scrollTrigger: st(el) });
    });

    // en-têtes de pages
    $$('.pg-line', scope).forEach(function (el) { gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: 'expo.inOut', delay: D + 0.15 }); });
    $$('.pg-hero-media img', scope).forEach(function (el) { gsap.fromTo(el.parentNode, { opacity: 0 }, { opacity: 1, duration: 1.4, delay: D, ease: 'power2.out' }); });

    // parallaxe
    $$('[data-parallax]', scope).forEach(function (el) {
      var f = Number(el.getAttribute('data-parallax')) || 0.15;
      gsap.fromTo(el, { yPercent: -f * 50 }, { yPercent: f * 50, ease: 'none', scrollTrigger: { trigger: el.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // schémas
    $$('svg[data-draw]', scope).forEach(function (svg) {
      if (svg.closest('[data-scrub-draw]') || svg.closest('[hidden]')) return;
      var tl = drawTL(svg);
      ScrollTrigger.create({ trigger: svg, start: 'top 85%', once: true, onEnter: function () { tl.delay(delayFor(svg)).play(); } });
    });
    $$('[data-scrub-draw]', scope).forEach(function (box) {
      var svg = $('svg', box); if (!svg) return;
      var tl = drawTL(svg);
      ScrollTrigger.create({ trigger: box, start: 'top 82%', end: 'bottom 55%', scrub: 0.8, animation: tl });
      gsap.fromTo(box, { rotationX: 18, y: 60, transformPerspective: 1200, transformOrigin: '50% 100%' }, { rotationX: 0, y: 0, ease: 'none', scrollTrigger: { trigger: box, start: 'top bottom', end: 'top 45%', scrub: true } });
    });

    // pas de chaîne
    $$('[data-pitch]', scope).forEach(function (sec) {
      if (sec.hidden) return;
      ScrollTrigger.create({ trigger: sec, start: 'top 72%', once: true, onEnter: function () { pitch(sec); } });
    });

    // stock : défilement horizontal épinglé
    var hs = $('[data-hscroll]', scope);
    if (hs) {
      var track = $('.hs-track', hs), vp = $('.hs-viewport', hs);
      gsap.fromTo(track.children, { opacity: 0, x: 90 }, { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: hs, start: 'top 78%', once: true } });
      mm.add('(min-width: 1024px)', function () {
        var dist = function () { return Math.max(0, track.scrollWidth - vp.clientWidth); };
        gsap.to(track, {
          x: function () { return -dist(); }, ease: 'none',
          scrollTrigger: { trigger: hs, start: 'center center', end: function () { return '+=' + dist(); }, pin: true, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1 }
        });
      });
    }

    // confirmation
    var ok = $('.ok-mark', scope);
    if (ok) {
      var q = gsap.utils.selector(ok);
      q('.ok-burst i').forEach(function (i, n) { gsap.set(i, { rotation: n * 30, svgOrigin: undefined }); });
      gsap.timeline({ delay: D + 0.1 })
        .fromTo(q('.ok-c'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' })
        .fromTo(q('.ok-p'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: 'power3.out' }, '-=0.2')
        .fromTo(q('.ok-burst i'), { scaleY: 0, opacity: 1 }, { scaleY: 1, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.012 }, '-=0.25')
        .fromTo(ok, { scale: 0.9 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, .4)' }, '-=1');
    }

    // icônes engrenage (états vides)
    $$('.noresult-ic svg', scope).forEach(function (svg) {
      var g = $('.gi-g', svg); if (g) gsap.to(g, { rotation: 360, svgOrigin: '222 297', duration: 14, ease: 'none', repeat: -1 });
    });

    return function () { cleanups.forEach(function (f) { if (f) f(); }); };
  }

  function heroAnim(hero, D) {
    var q = gsap.utils.selector(hero);
    gsap.timeline({ delay: D })
      .fromTo(q('.hero-img'), { scale: 1.24 }, { scale: 1.04, duration: 2.8, ease: 'expo.out' }, 0)
      .fromTo(q('.hero-title .ln > span'), { y: 0, yPercent: 112 }, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.12 }, 0.1)
      .fromTo(q('.hero-title em'), { '--u': 0 }, { '--u': 1, duration: 1.1, ease: 'expo.inOut' }, 0.75)
      .fromTo(q('[data-hero-fade]'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09 }, 0.45)
      .fromTo(q('[data-hero-qs]'), { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out' }, 0.62)
      .fromTo(q('.tread-hero'), { yPercent: 100 }, { yPercent: 0, duration: 1.1, ease: 'expo.out' }, 0.55);
    if (window.ScrollTrigger) {
      gsap.to(q('.hero-media'), { yPercent: 16, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to(q('.hero-in'), { yPercent: -8, opacity: 0.1, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 15%', scrub: true } });
    }
    var off = function () {};
    if (FINE) {
      var img = q('.hero-img')[0];
      var xTo = gsap.quickTo(img, 'x', { duration: 1.4, ease: 'power3.out' }), yTo = gsap.quickTo(img, 'y', { duration: 1.4, ease: 'power3.out' });
      var mv = function (e) { xTo((e.clientX / window.innerWidth - 0.5) * -26); yTo((e.clientY / window.innerHeight - 0.5) * -16); };
      hero.addEventListener('pointermove', mv);
      off = function () { hero.removeEventListener('pointermove', mv); };
    }
    var stopDust = dust(q('.hero-dust')[0]);
    return function () { off(); stopDust(); };
  }

  function dust(canvas) {
    if (RM || !canvas) return function () {};
    var c = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
    var N = window.innerWidth < 700 ? 36 : 90, ps = [], mx = 0, my = 0, vis = true;
    function size() { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    for (var i = 0; i < N; i++) ps.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3, vx: Math.random() * 16 + 5, vy: -(Math.random() * 7 + 1), a: Math.random() * 0.5 + 0.12, ph: Math.random() * 6.28, z: Math.random() });
    var onMove = function (e) { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    var io = new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }); io.observe(canvas);
    function frame(time, dtMs) {
      if (!vis) return;
      var dt = Math.min(dtMs || 16, 50) / 1000;
      c.clearRect(0, 0, W, H); c.globalCompositeOperation = 'lighter';
      for (var j = 0; j < ps.length; j++) {
        var p = ps[j];
        p.x += (p.vx + Math.abs(svel) * 3) * dt * (0.4 + p.z); p.y += p.vy * dt;
        if (p.x > W + 12) p.x = -12; if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
        var fl = 0.55 + 0.45 * Math.sin(time * 1.7 + p.ph);
        c.beginPath(); c.arc(p.x + mx * 34 * p.z, p.y + my * 22 * p.z, p.r * (0.6 + p.z), 0, 6.2832);
        c.fillStyle = 'rgba(255,' + (160 + Math.round(p.z * 60)) + ',100,' + (p.a * fl).toFixed(3) + ')'; c.fill();
      }
    }
    gsap.ticker.add(frame); window.addEventListener('resize', size); window.addEventListener('pointermove', onMove);
    return function () { gsap.ticker.remove(frame); window.removeEventListener('resize', size); window.removeEventListener('pointermove', onMove); io.disconnect(); };
  }

  /* ------------------------------------------------------------ schémas */
  function drawTL(svg) {
    var q = gsap.utils.selector(svg);
    var tl = gsap.timeline({ paused: true });
    tl.fromTo(q('.part,.pad,.link,.band,.tile,.tile-d,.tile-s,.plate,.screw-r,.screw,.screw-h,.hid,.bsc,.bnut,.chain,.dot,.loop,.loop-in,.idler,.idler-c,.roller,.sprk-wrap,.insert,.bolt,.cbolt,.slotcut,.core'), { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.025, ease: 'power2.out' }, 0)
      .fromTo(q('.lug'), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' }, 0.1)
      .fromTo(q('.hole,.slot,.clip,.axle,.axle-c'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.45, stagger: 0.05, ease: 'back.out(2.2)' }, 0.25)
      .fromTo(q('.guide,.call,.ground'), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.4)
      .fromTo(q('.ext'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.35, stagger: 0.03, ease: 'power1.inOut' }, 0.45)
      .fromTo(q('.dl'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, stagger: 0.08, ease: 'power2.inOut' }, 0.6)
      .fromTo(q('.ah'), { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.03 }, 0.85)
      .fromTo(q('.dt,.lbl,.tick,.mark'), { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: 0.04 }, 0.9);
    return tl;
  }
  function draw(svg) { drawTL(svg).play(); }

  function pitch(sec, replay) {
    var svg = $('svg.pitch', sec); if (!svg || RM) return;
    var q = gsap.utils.selector(svg), mv = q('[data-mv]')[0], o = { v: 0 };
    gsap.killTweensOf(q('*'));
    gsap.timeline()
      .fromTo(q('.link'), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
      .fromTo(q('.axle,.axle-c'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, stagger: 0.06, duration: 0.45, ease: 'back.out(2.2)' }, 0.1)
      .fromTo(q('.ml'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 1.5, ease: 'power2.inOut' }, 0.55)
      .fromTo(q('.ml-a,.mv'), { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.55)
      .fromTo(o, { v: 0 }, { v: 540, duration: 1.5, ease: 'power2.inOut', onUpdate: function () { mv.textContent = Math.round(o.v); } }, 0.55)
      .fromTo(q('.ml-b'), { opacity: 0 }, { opacity: 1, duration: 0.2 }, 1.95)
      .fromTo(q('.pb,.pbt'), { opacity: 0 }, { opacity: 1, stagger: 0.1, duration: 0.35, ease: 'power3.out' }, 1.7)
      .fromTo(q('.pres'), { opacity: 0, scale: 0.7, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2.4)' }, 2.35);
  }

  /* ------------------------------------------------------------ micro-interactions */
  function visibleCart() {
    return $$('[data-cart-target]').filter(function (el) { return el.offsetParent !== null && el.getBoundingClientRect().width > 0; })[0];
  }
  function fly(from, cb) {
    var hdr = $('[data-hdr]'), wasHidden = hdr && hdr.classList.contains('is-hidden');
    showHeader();
    var target = visibleCart();
    if (RM || !from || !target) { cb(); return; }
    var a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (wasHidden) b = { left: b.left, top: b.top + hdr.offsetHeight, width: b.width, height: b.height };
    var el = document.createElement('div'); el.className = 'fly';
    if (from.tagName === 'IMG') el.style.backgroundImage = 'url("' + (from.currentSrc || from.src) + '")'; else el.classList.add('fly-dot');
    document.body.appendChild(el);
    var s = 74, sx = a.left + a.width / 2 - s / 2, sy = a.top + a.height / 2 - s / 2, ex = b.left + b.width / 2 - s / 2, ey = b.top + b.height / 2 - s / 2;
    var cx = (sx + ex) / 2 + 40, cy = Math.min(sy, ey) - 180, o = { t: 0 };
    gsap.set(el, { x: sx, y: sy });
    gsap.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.18 });
    setTimeout(function () {
      gsap.to(o, {
        t: 1, duration: 0.9, ease: 'power2.inOut',
        onUpdate: function () {
          var t = o.t, it = 1 - t;
          gsap.set(el, { x: it * it * sx + 2 * it * t * cx + t * t * ex, y: it * it * sy + 2 * it * t * cy + t * t * ey, scale: 1 - 0.78 * t, rotation: t * 240 });
        },
        onComplete: function () { el.remove(); cb(); ring(target); }
      });
    }, 120);
  }
  function ring(target) {
    var r = document.createElement('span'); r.className = 'ring'; target.appendChild(r);
    gsap.fromTo(r, { scale: 0.6, opacity: 0.9 }, { scale: 1.8, opacity: 0, duration: 0.8, ease: 'expo.out', onComplete: function () { r.remove(); } });
  }
  function bump() {
    if (RM) return;
    gsap.fromTo('[data-cart-count]', { scale: 1.9 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, .35)' });
  }
  function toastIn(el) { gsap.fromTo(el, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }); }
  function toastOut(el) {
    gsap.to(el, { x: 60, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: function () {
      gsap.to(el, { height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, duration: 0.25, onComplete: function () { el.remove(); } });
    } });
  }
  function panelIn(el) { if (!RM) gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }); }
  function shake(el) { if (el && !RM) gsap.fromTo(el, { x: 0 }, { keyframes: { x: [-9, 8, -6, 4, -2, 0] }, duration: 0.5, ease: 'power1.out' }); }
  function pop(el) { if (!RM) gsap.fromTo(el, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, .4)' }); }
  function stagger(els, step) { if (!RM && els.length) gsap.fromTo(els, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: step || 0.05, ease: 'power3.out' }); }
  function flipCards(cards, fn) {
    if (RM || !window.Flip) { fn(); return; }
    var state = Flip.getState(cards);
    fn();
    Flip.from(state, {
      duration: 0.65, ease: 'power3.inOut', absolute: true, stagger: 0.015,
      onEnter: function (els) { return gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: 'power3.out' }); },
      onLeave: function (els) { return gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.35 }); },
      onComplete: function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); }
    });
  }
  // Grille paginée : sortie rapide avant un nouveau filtrage, puis entrée en cascade des cartes
  function gridOut(grid, cb) {
    var cards = $$('.pcard', grid);
    if (RM || !cards.length) { cb(); return; }
    gsap.to(cards.slice(0, 24), { opacity: 0, y: -14, duration: 0.22, stagger: 0.012, ease: 'power2.in', onComplete: cb });
  }
  function cardsIn(cards) {
    if (!cards.length) return;
    if (RM) { gsap.set(cards, { opacity: 1 }); return; }
    gsap.fromTo(cards, { opacity: 0, y: 42, scale: 0.97 }, {
      opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out', stagger: 0.045,
      onComplete: function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); }
    });
  }
  function rowsIn(rows) {
    if (RM || !rows.length) return;
    gsap.fromTo(rows, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out', stagger: 0.015, onComplete: function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); } });
  }
  function sheetOut(wrap, cb) {
    if (RM) { cb(); return; }
    gsap.to(wrap.children, { opacity: 0, y: -18, duration: 0.28, ease: 'power2.in', onComplete: cb });
  }
  function sheetIn(wrap) {
    if (RM) return;
    var sh = wrap.firstElementChild;
    gsap.fromTo(sh, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' });
    gsap.fromTo($$('.steps li, .legend > div', sh), { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', delay: 0.15 });
    $$('svg[data-draw]', sh).forEach(function (svg, i) { drawTL(svg).delay(0.15 + i * 0.25).play(); });
  }
  function collapse(row, cb) {
    if (RM) { cb(); return; }
    gsap.timeline({ onComplete: cb })
      .to(row, { opacity: 0, x: 50, duration: 0.3, ease: 'power2.in' })
      .to(row, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, borderTopWidth: 0, borderBottomWidth: 0, duration: 0.35, ease: 'power3.inOut' });
  }
  function scrollTo(target, offset) {
    if (lenis) { lenis.scrollTo(target, { offset: offset || 0, duration: 1.1 }); return; }
    if (typeof target === 'number') window.scrollTo({ top: target, behavior: RM ? 'auto' : 'smooth' });
    else target.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' });
  }
  function accordion(d, a) {
    if (d.open) {
      gsap.to(a, { height: 0, duration: 0.4, ease: 'power3.inOut', onComplete: function () { d.open = false; gsap.set(a, { clearProps: 'height' }); if (window.ScrollTrigger) ScrollTrigger.refresh(); } });
      d.classList.remove('is-open');
    } else {
      d.open = true; d.classList.add('is-open');
      gsap.fromTo(a, { height: 0 }, { height: 'auto', duration: 0.5, ease: 'power3.out', onComplete: function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); } });
      gsap.fromTo($('p', a), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.1 });
    }
  }
  function searchIn(so) {
    if (lenis) lenis.stop();
    if (RM) return;
    gsap.fromTo($('.so-bg', so), { opacity: 0 }, { opacity: 1, duration: 0.35 });
    gsap.fromTo($('.so-panel', so), { yPercent: -100 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' });
    gsap.fromTo($$('.so-form, .so-results', so), { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.06, delay: 0.15 });
  }
  function searchOut(so, cb) {
    if (lenis) lenis.start();
    if (RM) { cb(); return; }
    gsap.to($('.so-bg', so), { opacity: 0, duration: 0.3 });
    gsap.to($('.so-panel', so), { yPercent: -100, duration: 0.45, ease: 'expo.in', onComplete: cb });
  }
  function menuIn(m) {
    if (lenis) lenis.stop();
    if (RM) return;
    gsap.fromTo(m, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'expo.inOut' });
    gsap.fromTo($$('.mnav-a > span', m), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05, delay: 0.3 });
    gsap.fromTo($$('.mnav-foot > *', m), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, delay: 0.55 });
  }
  function menuOut(m, cb) {
    if (lenis) lenis.start();
    if (RM) { cb(); return; }
    gsap.to(m, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.55, ease: 'expo.inOut', onComplete: cb });
  }
  function cookiesIn(el) { if (!RM) gsap.fromTo(el, { yPercent: 130, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out' }); }
  function cookiesOut(el) { if (RM) { el.hidden = true; return; } gsap.to(el, { yPercent: 130, opacity: 0, duration: 0.5, ease: 'expo.in', onComplete: function () { el.hidden = true; } }); }

  window.Motion = {
    init: init, enter: enter, leave: leave, fly: fly, bump: bump, toastIn: toastIn, toastOut: toastOut,
    panelIn: panelIn, shake: shake, pop: pop, stagger: stagger, flip: flipCards, draw: draw, pitch: pitch,
    gridOut: gridOut, cardsIn: cardsIn, rowsIn: rowsIn,
    sheetIn: sheetIn, sheetOut: sheetOut, collapse: collapse, scrollTo: scrollTo, accordion: accordion,
    searchIn: searchIn, searchOut: searchOut, menuIn: menuIn, menuOut: menuOut, cookiesIn: cookiesIn, cookiesOut: cookiesOut
  };
})();
