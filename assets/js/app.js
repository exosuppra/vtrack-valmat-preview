/* V-Track · application (routeur, vues, recherche, panier de devis). */
(function () {
  'use strict';

  /* ------------------------------------------------------------ outils */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };
  var session = {
    get: function (k) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* idem */ } }
  };
  var M = {}, P = {};
  function indexCatalog() {
    Object.keys(M).forEach(function (k) { delete M[k]; });
    Object.keys(P).forEach(function (k) { delete P[k]; });
    VT.machines.forEach(function (m) { M[m.id] = m; });
    VT.products.forEach(function (p) {
      P[p.id] = p; p.machines = p.machines || [];
      // Classe machine et variante sont rangées avec les cotes (champs texte du back-office)
      if (p.dims) ['cls', 'note'].forEach(function (k) { if (p.dims[k] && !p[k]) p[k] = p.dims[k]; });
    });
    HAY = {};
  }
  indexCatalog();
  var FAMILY = { chenille: 'chenille', roadliner: 'patins', clipon: 'patins', bolton: 'patins', tariere: 'autres', brh: 'autres' };
  var PAD_TYPES = ['roadliner', 'clipon', 'bolton'];
  // BRH et tarières : la platine dépend de la machine du client, elle se précise dans la demande de devis.
  var PLATE_TYPES = ['tariere', 'brh'];

  var S = { lang: 'fr', cart: store.get('vt.quote', []), route: null, first: true };

  function t(k, vars) {
    var dict = VT.i18n[S.lang] || VT.i18n.fr;
    var s = dict[k] != null ? dict[k] : (VT.i18n.fr[k] != null ? VT.i18n.fr[k] : k);
    if (vars) {
      if (vars.n != null && s.indexOf('|') > -1) {
        var parts = s.split('|');
        var many = S.lang === 'fr' ? vars.n > 1 : vars.n !== 1;
        s = many ? parts[1] : parts[0];
      }
      s = s.replace(/\{(\w+)\}/g, function (m, p) { return vars[p] != null ? vars[p] : m; });
    }
    return s;
  }
  function C() { return VT.content[S.lang]; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { if (n == null || n === '') return '—'; return S.lang === 'fr' ? String(n).replace('.', ',') : String(n); }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function unitFor(u) { var p = String(u).split('|'); return S.lang === 'fr' ? p[0] : (p[1] || p[0]); }

  /* ------------------------------------------------------------ routes */
  function href(route, param, query, lang) {
    var L = lang || S.lang;
    var slug = (VT.routes[route] || VT.routes.home)[L];
    var h = '#/' + L + (slug ? '/' + slug : '') + (param ? '/' + encodeURIComponent(param) : '');
    if (query) {
      var q = Object.keys(query).filter(function (k) { return query[k] !== '' && query[k] != null && query[k] !== false; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); }).join('&');
      if (q) h += '?' + q;
    }
    return h;
  }
  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var qi = raw.indexOf('?');
    var path = qi > -1 ? raw.slice(0, qi) : raw;
    var qs = qi > -1 ? raw.slice(qi + 1) : '';
    var parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    var lang = (parts[0] === 'fr' || parts[0] === 'en') ? parts.shift() : null;
    var slug = parts.shift() || '';
    var param = parts.join('/') || null;
    var route = null, L = lang || S.lang;
    Object.keys(VT.routes).forEach(function (id) { if (!route && VT.routes[id][L] === slug) route = id; });
    if (!route) Object.keys(VT.routes).forEach(function (id) { if (!route && (VT.routes[id].fr === slug || VT.routes[id].en === slug)) route = id; });
    var query = {};
    qs.split('&').filter(Boolean).forEach(function (kv) {
      var i = kv.indexOf('='); var k = decodeURIComponent(i > -1 ? kv.slice(0, i) : kv);
      query[k] = decodeURIComponent((i > -1 ? kv.slice(i + 1) : '').replace(/\+/g, ' '));
    });
    return { lang: lang, route: route || '404', param: param, query: query };
  }
  function replaceUrl(h) { try { history.replaceState(null, '', h); } catch (e) { /* file:// */ } }

  /* ------------------------------------------------------------ catalogue (API du back-office, sinon data.js) */
  var API = 'api/';
  VT.source = 'local';
  function applyCatalog(d) {
    if (!d || !d.ok || !Array.isArray(d.products) || !Array.isArray(d.machines)) return false;
    var c = d.config || {};
    ['phone', 'phoneHref', 'email'].forEach(function (k) { if (c[k]) VT.config[k] = c[k]; });
    if (Array.isArray(c.commitments) && c.commitments.length) VT.config.commitments = c.commitments;
    VT.machines = d.machines.map(function (m) { return { id: m.id, brand: m.brand, model: m.model, type: m.type, t: m.t == null ? null : Number(m.t) }; });
    VT.products = d.products.map(function (p) { p.machines = p.machines || []; return p; });
    // Textes : le français de la base fait foi ; un anglais vide retombe sur le français.
    if (d.i18n) ['fr', 'en'].forEach(function (L) {
      var src = d.i18n[L] || {};
      Object.keys(src).forEach(function (k) { if (L === 'en' && src[k] === '') delete VT.i18n.en[k]; else VT.i18n[L][k] = src[k]; });
    });
    // Pages et images modifiées dans le back-office
    if (d.content) ['fr', 'en'].forEach(function (L) {
      var src = d.content[L], c = VT.content[L]; if (!src) return;
      ['about', 'faq', 'legal'].forEach(function (k) { if (src[k]) c[k] = src[k]; });
      Object.keys(src.cats || {}).forEach(function (id) { if (c.cats[id] && src.cats[id].intro) c.cats[id].intro = src.cats[id].intro; });
    });
    VT.images = d.images || {};
    VT.source = 'api';
    indexCatalog();
    return true;
  }
  // Sans serveur (aperçu statique) : catalogue généré depuis les tableaux Excel, chargé seulement dans ce cas
  function loadStaticCatalog() {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'assets/js/catalog.js';
      s.onload = function () { indexCatalog(); res(false); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }
  function loadCatalog() {
    if (!window.fetch || location.protocol === 'file:') return loadStaticCatalog();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    return fetch(API + 'catalog.php', { headers: { Accept: 'application/json' }, cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') < 0) throw new Error('catalog ' + r.status);
        return r.json();
      })
      .then(applyCatalog)
      .catch(function () { return false; })
      .then(function (ok) { clearTimeout(timer); return ok || loadStaticCatalog(); });
  }

  /* ------------------------------------------------------------ produits */
  function machinesOf(p) { return p.machines.map(function (id) { return M[id]; }).filter(Boolean); }
  function enginesOf(p) { return uniq(machinesOf(p).map(function (m) { return m.type; })); }
  function brandsOf(p) { return uniq(machinesOf(p).map(function (m) { return m.brand; })); }
  function tonnageOf(p) {
    var ts = machinesOf(p).map(function (m) { return m.t; }).filter(function (v) { return v != null && !isNaN(v); });
    return [Math.min.apply(null, ts), Math.max.apply(null, ts)];
  }
  function widthOf(p) { return p.dims ? (p.type === 'chenille' ? p.dims.w : (p.dims.tw || p.dims.L)) : null; }
  function dimsLabel(p) {
    var d = p.dims; if (!d) return '';
    return p.type === 'chenille' ? num(d.w) + ' × ' + num(d.p) + (d.g || '') + ' × ' + d.l : d.p + '-' + (d.tw || d.L);
  }
  function pname(p) { return (p.name && p.name[S.lang]) || t('n.' + p.type, { d: dimsLabel(p) }); }
  // Photo : chemin complet venant du back-office (uploads/…, assets/img/…) ou nom de fichier de data.js
  function imgSrc(f) { return !f ? '' : (f.indexOf('/') > -1 ? f : 'assets/img/' + f); }
  // Image d'un emplacement du site : celle du back-office, sinon l'image d'origine
  function siteImg(slot, fallback) { return esc((VT.images && VT.images[slot]) || (fallback ? imgSrc(fallback) : '')); }
  // Mention demandée par Valmat sous chaque photo de produit
  function pnc() { return '<span class="pnc">' + t('p.pnc') + '</span>'; }
  // Sans photo : visuel de la référence (sculpture de chenille + cote), en attendant les photos de Valentin
  function phVisual(p) {
    var lab = p.type === 'chenille' ? dimsLabel(p) : (p.dims ? p.ref : t('ty.' + p.type));
    return '<div class="ph ph-x ph-' + p.type + '"><span class="ph-tread" aria-hidden="true"></span>' +
      '<span class="ph-dim">' + esc(lab) + '</span><span class="ph-note">' + t('p.photo') + '</span></div>';
  }
  function pimg(p, cls) {
    if (p.img) return '<img src="' + esc(imgSrc(p.img)) + '" alt="' + esc(pname(p)) + '" loading="lazy" decoding="async" class="' + (cls || '') + '">' + pnc();
    return phVisual(p);
  }
  function badge(p) {
    if (p.badge) return '<span class="badge badge-' + p.badge + '">' + t('b.' + p.badge) + '</span>';
    return p.stock ? '<span class="badge">' + t('b.stock') + '</span>' : '';
  }
  function avail(p) {
    return p.stock ? '<p class="avail is-in"><i aria-hidden="true"></i>' + (p.qty != null ? t('p.stockQty', { n: p.qty }) : t('p.stock')) + '</p>'
      : '<p class="avail"><i aria-hidden="true"></i>' + t('p.order') + '</p>';
  }
  function fitsLine(p) {
    var ms = machinesOf(p);
    var shown = ms.slice(0, 2).map(function (m) { return m.brand + ' ' + m.model; }).join(', ');
    return shown + (ms.length > 2 ? ' <span class="more">+' + (ms.length - 2) + '</span>' : '');
  }
  function card(p, opts) {
    opts = opts || {};
    var tn = tonnageOf(p);
    var attrs = ' data-id="' + p.id + '" data-type="' + p.type + '" data-family="' + FAMILY[p.type] + '" data-engines="' + enginesOf(p).join(' ') +
      '" data-w="' + (widthOf(p) || '') + '" data-brands="' + brandsOf(p).join(' ').toLowerCase() + '" data-tmin="' + tn[0] + '" data-tmax="' + tn[1] +
      '" data-stock="' + (p.stock ? 1 : 0) + '"';
    var link = href('product', p.id);
    return '<article class="pcard"' + attrs + (opts.reveal === false ? '' : ' data-reveal="card"') + '>' +
      '<a class="pcard-media" href="' + link + '" tabindex="-1" aria-hidden="true">' + pimg(p) + badge(p) + '</a>' +
      '<div class="pcard-body">' +
      '<p class="pcard-type">' + t('ty.' + p.type) + '</p>' +
      '<h3 class="pcard-title"><a href="' + link + '">' + pname(p) + '</a></h3>' +
      '<p class="pcard-ref mono">' + t('p.ref') + ' ' + esc(p.ref) + '</p>' +
      '<p class="pcard-fit">' + (p.machines.length ? '<span>' + t('p.fits') + '</span> ' + fitsLine(p) : '<span>' + (p.cls ? t('sp.cls') + ' : ' + esc(p.cls) : t('p.fitsAsk')) + '</span>') + '</p>' +
      avail(p) +
      '<div class="pcard-foot"><span class="price">' + t('p.price') + '</span>' +
      '<button class="btn btn-o btn-sm" type="button" data-add="' + p.id + '"><span>' + t('p.add') + '</span></button></div>' +
      '</div></article>';
  }

  /* ------------------------------------------------------------ recherche */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function key(s) { return norm(s).replace(/,/g, '.').replace(/[^a-z0-9.]/g, '').replace(/(^|[a-z])0+(?=\d)/g, '$1'); }
  function nums(s) { return (norm(s).replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) || []).map(Number); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    var dp = []; for (var i = 0; i <= a.length; i++) { dp[i] = [i]; }
    for (var j = 1; j <= b.length; j++) dp[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
  }
  var HAY = {};
  function hay(p) {
    if (HAY[p.id]) return HAY[p.id];
    var strings = [p.ref, p.desig, VT.i18n.fr['ty.' + p.type], VT.i18n.en['ty.' + p.type]].concat(p.old || [], p.oem || []);
    machinesOf(p).forEach(function (m) { strings.push(m.brand + ' ' + m.model, m.model); });
    var keys = strings.filter(Boolean).map(key);
    var words = [];
    strings.filter(Boolean).forEach(function (s) { norm(s).split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 2) words.push(w); }); });
    var d = p.dims || {};
    var dn = ['w', 'p', 'l', 'L', 'tw', 'A', 'B', 'C', 'W', 'H'].map(function (k) { return d[k]; }).filter(function (v) { return v != null; });
    HAY[p.id] = { keys: keys, words: uniq(words), dims: dn };
    return HAY[p.id];
  }
  function near(a, b) { return Math.abs(a - b) < 0.3; }
  function score(p, q) {
    var h = hay(p), sc = 0;
    var qn = nums(q);
    if (qn.length >= 2) {
      var hit = qn.filter(function (n) { return h.dims.some(function (d) { return near(d, n); }); }).length;
      if (hit === qn.length) sc += 12 * hit; else if (hit >= 2) sc += 4 * hit;
    }
    var whole = key(q);
    if (whole.length >= 3 && h.keys.some(function (k) { return k.indexOf(whole) > -1; })) sc += 10;
    norm(q).split(/[\s/]+/).filter(function (w) { return w.length >= 2; }).forEach(function (w) {
      var k = key(w);
      if (!k) return;
      if (/^[\d.]+$/.test(k) && qn.length >= 2) return; // déjà compté dans les dimensions
      if (/^\d+(\.\d+)?$/.test(k)) {
        if (h.dims.some(function (d) { return near(d, Number(k)); })) sc += 3;
        else if (h.keys.some(function (x) { return x.indexOf(k) > -1; })) sc += 2;
        return;
      }
      if (h.keys.some(function (x) { return x.indexOf(k) > -1; })) sc += 4;
      else if (/[a-z]/.test(k) && k.length >= 4 && h.words.some(function (x) { return x[0] === k[0] && /[a-z]{2}/.test(x) && (lev(k, x) <= 1 || (x.length > k.length && lev(k, x.slice(0, k.length)) <= 1)); })) sc += 2;
    });
    return sc;
  }
  function searchText(q) {
    if (!q || !q.trim()) return [];
    return VT.products.map(function (p) { return { p: p, s: score(p, q) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (b.p.stock - a.p.stock); })
      .map(function (r) { return r.p; });
  }
  function searchMachines(q) {
    var k = key(q); if (k.length < 2) return [];
    return VT.machines.filter(function (m) {
      var mk = key(m.brand + m.model), mo = key(m.model);
      return mk.indexOf(k) > -1 || mo.indexOf(k) > -1 || (k.length >= 4 && lev(k, key(m.brand)) <= 1);
    }).slice(0, 4);
  }
  function searchDims(type, w, p, l) {
    var W = parseFloat(String(w).replace(',', '.')), Pp = parseFloat(String(p).replace(',', '.')), Ll = parseFloat(String(l).replace(',', '.'));
    return VT.products.filter(function (x) {
      if (!x.dims) return false;
      if (type === 'chenille') {
        if (x.type !== 'chenille') return false;
        return (isNaN(W) || near(x.dims.w, W)) && (isNaN(Pp) || near(x.dims.p, Pp)) && (isNaN(Ll) || near(x.dims.l, Ll));
      }
      if (PAD_TYPES.indexOf(x.type) < 0) return false;
      if (type && type !== 'patins' && x.type !== type) return false;
      return (isNaN(W) || near(widthOf(x), W)) && (isNaN(Pp) || near(x.dims.p, Pp));
    });
  }
  function searchMachine(brand, model) {
    return VT.products.filter(function (p) {
      return machinesOf(p).some(function (m) { return model ? m.id === model : (!brand || m.brand === brand); });
    });
  }

  /* ------------------------------------------------------------ panier */
  function saveCart() { store.set('vt.quote', S.cart); updateCount(true); }
  function cartUnits() { return S.cart.reduce(function (a, i) { return a + i.qty; }, 0); }
  function updateCount(bump) {
    var n = S.cart.length;
    $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.classList.toggle('is-zero', n === 0); });
    if (bump && window.Motion) Motion.bump();
  }
  function addToCart(id, qty, fromEl) {
    qty = Math.max(1, qty || 1);
    var line = S.cart.filter(function (i) { return i.id === id; })[0];
    if (line) line.qty += qty; else S.cart.push({ id: id, qty: qty });
    if (window.Motion) Motion.fly(fromEl, function () { saveCart(); });
    else saveCart();
    toast(t('tt.added'), { label: t('tt.view'), href: href('devis') });
  }
  function addCustom(type, dims, fromEl) {
    S.cart.push({ id: 'custom-' + Date.now().toString(36), custom: true, type: type, dims: dims, qty: 1 });
    if (window.Motion) Motion.fly(fromEl, function () { saveCart(); }); else saveCart();
    toast(t('tt.custom'), { label: t('tt.view'), href: href('devis') });
  }
  function customLabel(i) {
    return Object.keys(i.dims).filter(function (k) { return i.dims[k] !== ''; })
      .map(function (k) { return (k === 'N' ? t('qs.links') : k) + ' ' + num(i.dims[k]); }).join(' · ');
  }
  function lineLabel(i) {
    if (i.custom) return t('q.custom') + ' · ' + t('ty.' + i.type) + ' · ' + customLabel(i);
    var p = P[i.id]; return p ? pname(p) + ' (' + p.ref + ')' : i.id;
  }
  function needsPlate(i) { var p = !i.custom && P[i.id]; return !!p && PLATE_TYPES.indexOf(p.type) > -1; }
  function plateText(i) { return i.plateUnknown ? t('q.plateUnknown') : String(i.plate || '').trim(); }

  function toast(msg, action) {
    var box = $('[data-toasts]'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast-ic" aria-hidden="true"></span><span class="toast-msg">' + msg + '</span>' +
      (action ? (action.href ? '<a class="toast-act" href="' + action.href + '">' + action.label + '</a>' : '<button class="toast-act" type="button">' + action.label + '</button>') : '');
    box.appendChild(el);
    if (action && action.onClick) el.querySelector('.toast-act').addEventListener('click', function () { action.onClick(); kill(); });
    function kill() { if (window.Motion) Motion.toastOut(el); else el.remove(); }
    if (window.Motion) Motion.toastIn(el);
    setTimeout(kill, action && action.sticky ? 9000 : 3600);
  }

  /* ------------------------------------------------------------ schémas */
  function dimH(x1, x2, y, k, v, o) {
    o = o || {};
    var ext = (o.ext || []).map(function (e) { return '<line class="ext" x1="' + e[0] + '" y1="' + e[1] + '" x2="' + e[2] + '" y2="' + e[3] + '" pathLength="1"/>'; }).join('');
    return '<g class="dim" data-dim="' + k + '">' + ext +
      '<line class="dl" x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" pathLength="1"/>' +
      '<path class="ah" d="M' + x1 + ' ' + y + 'l7 -3.5v7z"/><path class="ah" d="M' + x2 + ' ' + y + 'l-7 -3.5v7z"/>' +
      '<text class="dt" x="' + ((x1 + x2) / 2) + '" y="' + (y - 7) + '" text-anchor="middle">' + (o.label || k) + ' = <tspan data-v="' + k + '">' + num(v) + '</tspan>' + (o.suffix || '') + '</text></g>';
  }
  function dimV(x, y1, y2, k, v, o) {
    o = o || {};
    var ext = (o.ext || []).map(function (e) { return '<line class="ext" x1="' + e[0] + '" y1="' + e[1] + '" x2="' + e[2] + '" y2="' + e[3] + '" pathLength="1"/>'; }).join('');
    var tx = o.side === 'r' ? x + 15 : x - 8;
    return '<g class="dim" data-dim="' + k + '">' + ext +
      '<line class="dl" x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" pathLength="1"/>' +
      '<path class="ah" d="M' + x + ' ' + y1 + 'l-3.5 7h7z"/><path class="ah" d="M' + x + ' ' + y2 + 'l-3.5 -7h7z"/>' +
      '<text class="dt" transform="translate(' + tx + ' ' + ((y1 + y2) / 2) + ') rotate(-90)" text-anchor="middle">' + (o.label || k) + ' = <tspan data-v="' + k + '">' + num(v) + '</tspan></text></g>';
  }
  function hole(cx, cy) {
    return '<g class="hole"><circle cx="' + cx + '" cy="' + cy + '" r="7"/><path class="cross" d="M' + (cx - 11) + ' ' + cy + 'h22M' + cx + ' ' + (cy - 11) + 'v22"/></g>';
  }
  function svgWrap(vb, inner, label, extra) {
    return '<svg class="draw" viewBox="' + vb + '" role="img" aria-label="' + esc(label) + '" data-draw' + (extra || '') + '>' + inner + '</svg>';
  }
  var DRAW = {
    roadlinerBottom: function (d, L) {
      return svgWrap('0 0 560 300',
        '<text class="lbl" x="270" y="18" text-anchor="middle">' + L.travel + '</text>' +
        '<rect class="part" x="60" y="80" width="420" height="130" rx="10"/>' +
        '<path class="guide" d="M224 118L238 168M336 118L322 168"/>' +
        hole(224, 118) + hole(336, 118) + hole(238, 168) + hole(322, 168) +
        '<path class="call" d="M336 118L380 72H390"/><text class="lbl" x="394" y="77">' + L.holes + ' (' + (d.bolt || 'M12') + ')</text>' +
        dimH(224, 336, 56, 'A', d.A, { ext: [[224, 62, 224, 108], [336, 62, 336, 108]] }) +
        dimH(238, 322, 240, 'B', d.B, { ext: [[238, 178, 238, 246], [322, 178, 322, 246]] }) +
        dimV(190, 118, 168, 'C', d.C, { ext: [[213, 118, 184, 118], [227, 168, 184, 168]] }) +
        dimH(60, 480, 280, 'L', d.L, { ext: [[60, 212, 60, 286], [480, 212, 480, 286]] }) +
        dimV(512, 80, 210, 'l', d.l, { side: 'r', ext: [[482, 80, 518, 80], [482, 210, 518, 210]] }),
        'Roadliner, ' + L.travel);
    },
    roadlinerSide: function (d, L) {
      var pads = '', i;
      for (i = 0; i < 3; i++) {
        var x = 92 + i * 135;
        pads += '<rect class="pad" x="' + x + '" y="84" width="101" height="66" rx="6"/><rect class="core" x="' + (x + 8) + '" y="90" width="85" height="7" rx="2"/>';
      }
      var axes = [75, 210, 345, 480].map(function (x) { return '<circle class="axle" cx="' + x + '" cy="60" r="8"/><circle class="axle-c" cx="' + x + '" cy="60" r="2.5"/>'; }).join('');
      return svgWrap('0 0 560 240',
        '<rect class="link" x="62" y="48" width="431" height="24" rx="12"/>' + axes + pads +
        '<line class="ground" x1="40" y1="150" x2="530" y2="150"/><text class="lbl" x="44" y="166">' + L.ground + '</text>' +
        '<path class="call" d="M480 52L492 30"/><text class="lbl" x="452" y="22">' + L.axis + '</text>' +
        dimH(210, 345, 34, 'P', d.p, { ext: [[210, 40, 210, 52], [345, 40, 345, 52]] }) +
        dimH(227, 328, 190, 'l', d.l, { ext: [[227, 152, 227, 196], [328, 152, 328, 196]] }) +
        dimV(512, 84, 150, 'h', d.h, { side: 'r', ext: [[464, 84, 518, 84], [464, 150, 518, 150]] }),
        'Roadliner, ' + L.axis);
    },
    boltFace: function (d, L) {
      var slot = function (cx, cy) { return '<rect class="slot" x="' + (cx - 13) + '" y="' + (cy - 7) + '" width="26" height="14" rx="5"/>'; };
      return svgWrap('0 0 560 300',
        '<rect class="part" x="60" y="92" width="420" height="116" rx="8"/>' +
        hole(88, 150) + hole(452, 150) + slot(244, 128) + slot(316, 128) + slot(230, 172) + slot(330, 172) +
        dimH(88, 452, 34, 'A', d.A, { ext: [[88, 40, 88, 140], [452, 40, 452, 140]] }) +
        dimH(244, 316, 72, 'B', d.B, { ext: [[244, 78, 244, 120], [316, 78, 316, 120]] }) +
        dimH(230, 330, 240, 'C', d.C, { ext: [[230, 180, 230, 246], [330, 180, 330, 246]] }) +
        dimV(376, 128, 172, 'D', d.D, { side: 'r', ext: [[330, 128, 382, 128], [344, 172, 382, 172]] }) +
        dimV(186, 128, 172, 'E', d.E, { ext: [[230, 128, 180, 128], [216, 172, 180, 172]] }) +
        dimH(60, 480, 280, 'L', d.L, { ext: [[60, 210, 60, 286], [480, 210, 480, 286]] }) +
        dimV(512, 92, 208, 'l', d.l, { side: 'r', ext: [[482, 92, 518, 92], [482, 208, 518, 208]] }),
        'Bolt-On, ' + L.slots);
    },
    boltSection: function (d, L) {
      return svgWrap('0 0 560 220',
        '<rect class="tile" x="40" y="86" width="480" height="10"/>' +
        '<rect class="pad" x="56" y="96" width="448" height="48" rx="5"/>' +
        '<rect class="insert" x="82" y="98" width="12" height="26"/><rect class="insert" x="446" y="98" width="12" height="26"/>' +
        '<rect class="bolt" x="78" y="78" width="20" height="8"/><rect class="bolt" x="442" y="78" width="20" height="8"/>' +
        '<rect class="slotcut" x="240" y="96" width="34" height="16" rx="3"/><rect class="slotcut" x="286" y="96" width="34" height="16" rx="3"/>' +
        '<rect class="cbolt" x="244" y="44" width="26" height="62" rx="4"/><rect class="cbolt" x="290" y="44" width="26" height="62" rx="4"/>' +
        '<text class="lbl" x="104" y="80">' + L.tile + '</text>' +
        '<text class="lbl" x="104" y="164">' + L.insert + '</text>' +
        dimH(88, 452, 24, 'A', d.A, { ext: [[88, 30, 88, 76], [452, 30, 452, 76]] }) +
        dimH(56, 504, 194, 'L', d.L, { ext: [[56, 146, 56, 200], [504, 146, 504, 200]] }) +
        dimV(526, 96, 144, 'h', d.h, { side: 'r', ext: [[506, 96, 532, 96], [506, 144, 532, 144]] }),
        'Bolt-On, ' + L.tile);
    },
    clipTop: function (d, L) {
      var clip = function (x) { return '<rect class="clip" x="' + x + '" y="46" width="36" height="146" rx="3"/>'; };
      return svgWrap('0 0 560 260',
        '<rect class="tile-d" x="48" y="44" width="444" height="150" rx="6"/>' +
        '<rect class="part" x="60" y="56" width="420" height="126" rx="10"/>' +
        clip(60) + clip(444) +
        '<text class="lbl lbl-c" x="270" y="124" text-anchor="middle">' + L.nodrill + '</text>' +
        '<path class="call" d="M462 50L444 26H330"/><text class="lbl" x="330" y="20">' + L.clips + '</text>' +
        dimH(60, 480, 228, 'L', d.L, { ext: [[60, 194, 60, 234], [480, 194, 480, 234]] }) +
        dimV(516, 56, 182, 'W', d.W, { side: 'r', ext: [[482, 56, 522, 56], [482, 182, 522, 182]] }),
        'Clip-On, ' + L.nodrill);
    },
    clipSection: function (d, L) {
      return svgWrap('0 0 560 240',
        '<text class="lbl" x="20" y="20">' + L.chainSide + '</text>' +
        '<rect class="tile" x="150" y="52" width="260" height="12"/><path class="tile" d="M262 64h36l-4 24h-28z"/>' +
        '<path class="pad" d="M170 64H260V92H300V64H390V150a6 6 0 0 1-6 6H176a6 6 0 0 1-6-6Z"/>' +
        '<path class="clip" d="M150 44h22v8h-14v20h-8z"/><path class="clip" d="M410 44h-22v8h14v20h8z"/>' +
        '<path class="call" d="M150 58H106"/><text class="lbl" x="22" y="63">' + L.tile + '</text>' +
        '<path class="call" d="M284 78L318 30H340"/><text class="lbl" x="344" y="34">' + L.rib + '</text>' +
        dimH(170, 390, 210, 'W', d.W, { ext: [[170, 158, 170, 216], [390, 158, 390, 216]] }) +
        dimH(260, 300, 182, 'W1', d.W1, { ext: [[260, 94, 260, 188], [300, 94, 300, 188]] }) +
        dimV(432, 64, 156, 'H', d.H, { side: 'r', ext: [[392, 64, 438, 64], [392, 156, 438, 156]] }) +
        dimV(130, 64, 92, 'H1', d.H1, { ext: [[168, 64, 124, 64], [258, 92, 124, 92]] }),
        'Clip-On, ' + L.rib);
    },
    trackTop: function (d, L) {
      var lugs = '', ticks = '', i;
      for (i = 0; i < 8; i++) {
        var x = 52 + i * 60;
        lugs += '<path class="lug" d="M' + x + ' 64h18l20 61l-20 61h-18l20-61z"/>';
        ticks += '<text class="tick" x="' + (x + 19) + '" y="210" text-anchor="middle">' + (i + 1) + '</text>';
      }
      return svgWrap('0 0 560 260',
        '<rect class="band" x="40" y="60" width="480" height="130" rx="4"/>' + lugs + ticks +
        dimV(22, 60, 190, 'W', d.w, { ext: [[38, 60, 16, 60], [38, 190, 16, 190]] }) +
        dimH(172, 232, 38, 'P', d.p, { ext: [[172, 44, 172, 62], [232, 44, 232, 62]] }) +
        '<text class="dt" x="290" y="240" text-anchor="middle"><tspan data-v="N">' + d.l + '</tspan> = ' + L.count + '</text>',
        'Track, ' + L.width);
    },
    trackFlank: function (d, L) {
      var g = window.VT_LOGO ? VT_LOGO.gearFull : '';
      return svgWrap('0 0 560 210',
        '<path class="loop" d="M130 44H430A61 61 0 0 1 430 166H130A61 61 0 0 1 130 44Z"/>' +
        '<path class="loop-in" d="M130 58H430A47 47 0 0 1 430 152H130A47 47 0 0 1 130 58Z"/>' +
        '<g class="sprk-wrap" transform="translate(430 105)"><g class="sprk"><path transform="scale(.27) translate(-222 -297)" fill-rule="evenodd" d="' + g + '"/></g></g>' +
        '<circle class="idler" cx="130" cy="105" r="36"/><circle class="idler-c" cx="130" cy="105" r="8"/>' +
        [205, 265, 325].map(function (x) { return '<circle class="roller" cx="' + x + '" cy="140" r="9"/>'; }).join('') +
        '<text class="mark" x="282" y="103" text-anchor="middle"><tspan data-v="W">' + num(d.w) + '</tspan> × <tspan data-v="P">' + num(d.p) + '</tspan><tspan data-v="G">' + (d.g || '') + '</tspan> × <tspan data-v="N">' + d.l + '</tspan></text>' +
        '<text class="lbl" x="282" y="200" text-anchor="middle">' + L.flank + '</text>',
        'Track, ' + L.flank, ' data-loop');
    },
    pitch: function () {
      var axes = [70, 190, 310, 430, 550], br = '', i;
      for (i = 0; i < 4; i++) {
        br += '<path class="pb" d="M' + (axes[i] + 4) + ' 76v-6h' + 112 + 'v6"/><text class="pbt" x="' + (axes[i] + 60) + '" y="64" text-anchor="middle">P</text>';
      }
      return '<svg class="draw pitch" viewBox="0 0 620 170" role="img" aria-label="P">' +
        '<line class="ml" x1="70" y1="36" x2="550" y2="36"/><path class="ah ml-a" d="M70 36l7 -3.5v7z"/><path class="ah ml-b" d="M550 36l-7 -3.5v7z"/>' +
        '<text class="mv" x="310" y="24" text-anchor="middle"><tspan data-mv>0</tspan> mm</text>' + br +
        '<rect class="link" x="40" y="86" width="560" height="26" rx="13"/>' +
        axes.map(function (x) { return '<circle class="axle" cx="' + x + '" cy="99" r="9"/><circle class="axle-c" cx="' + x + '" cy="99" r="3"/>'; }).join('') +
        '<g class="pres"><rect class="pill" x="215" y="126" width="190" height="32" rx="4"/><text x="310" y="147" text-anchor="middle">540 ÷ 4 = <tspan class="pres-v">135</tspan> mm</text></g>' +
        '</svg>';
    }
  };
  function drawingsFor(type, d) {
    var L = C().guide.labels;
    if (type === 'chenille') return [DRAW.trackTop(d, L), DRAW.trackFlank(d, L)];
    if (type === 'roadliner') return [DRAW.roadlinerBottom(d, L), DRAW.roadlinerSide(d, L)];
    if (type === 'bolton') return [DRAW.boltFace(d, L), DRAW.boltSection(d, L)];
    if (type === 'clipon') return [DRAW.clipTop(d, L), DRAW.clipSection(d, L)];
    return [];
  }
  // Exemple des guides de mesure (Takeuchi TB260, pas 135, tuile 400) : fixe, indépendant du catalogue.
  var EXAMPLE = {
    chenille: { w: 400, p: 72.5, l: 74, g: 'W' },
    roadliner: { p: 135, A: 104, B: 80, C: 46, L: 400, l: 125, h: 61, bolt: 'M12', n: 4 },
    bolton: { p: 135, tw: 400, A: 300, B: 72, C: 99, D: 46, E: 46, L: 390, h: 36, l: 106, bolt: 'M12' },
    clipon: { p: 135, L: 400, W: 110, H: 60, W1: 31, H1: 21 }
  };

  /* ------------------------------------------------------------ composants */
  function brandsList() { return uniq(VT.machines.map(function (m) { return m.brand; })).sort(); }
  function modelOptions(brand, sel) {
    if (!brand) return '<option value="">' + t('qs.modelSel') + '</option>';
    return '<option value="">' + t('qs.allModels') + '</option>' + VT.machines.filter(function (m) { return m.brand === brand; })
      .map(function (m) { return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + m.model + ' · ' + t('e.' + m.type) + '</option>'; }).join('');
  }
  function quickSearch(pre) {
    pre = pre || {};
    var tab = pre.tab || 'model', isPad = pre.type && pre.type !== 'chenille';
    var brand = pre.brand || '';
    return '<div class="qs" data-qs data-tab="' + tab + '">' +
      '<div class="qs-tabs" role="tablist">' +
      '<button type="button" role="tab" class="qs-tab" data-qs-tab="model" aria-selected="' + (tab === 'model') + '">' + t('qs.model') + '</button>' +
      '<button type="button" role="tab" class="qs-tab" data-qs-tab="dims" aria-selected="' + (tab === 'dims') + '">' + t('qs.dims') + '</button>' +
      '<span class="qs-ind" aria-hidden="true"></span></div>' +
      '<form class="qs-panel" data-qs-panel="model"' + (tab === 'model' ? '' : ' hidden') + '>' +
      '<label class="sel"><span class="sr">' + t('qs.brand') + '</span><select name="brand" aria-label="' + t('qs.brand') + '"><option value="">' + t('qs.brand') + '</option>' +
      brandsList().map(function (b) { return '<option' + (b === brand ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></label>' +
      '<label class="sel"><span class="sr">' + t('qs.modelSel') + '</span><select name="model" aria-label="' + t('qs.modelSel') + '"' + (brand ? '' : ' disabled') + '>' + modelOptions(brand, pre.model) + '</select></label>' +
      '<button class="btn btn-o qs-go" type="submit" data-magnetic><span>' + t('qs.go') + '</span></button></form>' +
      '<form class="qs-panel qs-dims" data-qs-panel="dims"' + (tab === 'dims' ? '' : ' hidden') + '>' +
      '<label class="sel sel-type"><span class="sr">' + t('qs.type') + '</span><select name="type" aria-label="' + t('qs.type') + '">' +
      '<option value="chenille">' + t('ty.chenille') + '</option><option value="patins"' + (isPad ? ' selected' : '') + '>' + t('ty.patins') + '</option></select></label>' +
      '<label class="fld"><span>' + t('qs.width') + '</span><input name="w" inputmode="decimal" autocomplete="off" placeholder="400" value="' + esc(pre.w || '') + '"></label>' +
      '<label class="fld"><span>' + t('qs.pitch') + '</span><input name="p" inputmode="decimal" autocomplete="off" placeholder="' + (isPad ? '135' : num(72.5)) + '" value="' + esc(pre.p || '') + '"></label>' +
      '<label class="fld" data-links' + (isPad ? ' hidden' : '') + '><span>' + t('qs.links') + '</span><input name="l" inputmode="numeric" autocomplete="off" placeholder="74" value="' + esc(pre.l || '') + '"></label>' +
      '<button class="btn btn-o qs-go" type="submit" data-magnetic><span>' + t('qs.go') + '</span></button></form>' +
      '</div>';
  }
  function mountQuickSearch(root) {
    $$('[data-qs]', root).forEach(function (qs) {
      var tabs = $$('[data-qs-tab]', qs), ind = $('.qs-ind', qs);
      function place() {
        var act = $('[aria-selected="true"]', qs); if (!act || !ind) return;
        ind.style.width = act.offsetWidth + 'px'; ind.style.transform = 'translateX(' + act.offsetLeft + 'px)';
      }
      tabs.forEach(function (b) {
        b.addEventListener('click', function () {
          var tab = b.getAttribute('data-qs-tab');
          tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          $$('[data-qs-panel]', qs).forEach(function (p) {
            var on = p.getAttribute('data-qs-panel') === tab;
            p.hidden = !on; if (on && window.Motion) Motion.panelIn(p);
          });
          qs.setAttribute('data-tab', tab); place();
        });
      });
      requestAnimationFrame(place);
      if (window.ResizeObserver) new ResizeObserver(place).observe($('.qs-tabs', qs));
      else window.addEventListener('resize', place);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
      window.addEventListener('load', place); setTimeout(place, 700); setTimeout(place, 1800);
      var mf = $('[data-qs-panel="model"]', qs), df = $('[data-qs-panel="dims"]', qs);
      var bs = $('select[name="brand"]', mf), ms = $('select[name="model"]', mf);
      bs.addEventListener('change', function () { ms.innerHTML = modelOptions(bs.value); ms.disabled = !bs.value; if (bs.value) ms.focus(); });
      mf.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!bs.value) { bs.focus(); if (window.Motion) Motion.shake(bs.parentNode); return; }
        location.hash = href('search', null, { brand: bs.value, model: ms.value });
      });
      var ts = $('select[name="type"]', df);
      ts.addEventListener('change', function () {
        var pad = ts.value !== 'chenille';
        $('[data-links]', df).hidden = pad;
        $('input[name="p"]', df).placeholder = pad ? '135' : num(72.5);
      });
      df.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = new FormData(df);
        if (!f.get('w') && !f.get('p') && !f.get('l')) { $('input[name="w"]', df).focus(); if (window.Motion) Motion.shake($('input[name="w"]', df).parentNode); return; }
        location.hash = href('search', null, { type: f.get('type'), w: f.get('w'), p: f.get('p'), l: ts.value === 'chenille' ? f.get('l') : '' });
      });
    });
  }
  function eyebrow(txt) { return '<p class="eyebrow" data-reveal="fade">' + txt + '</p>'; }
  function notFoundLine(query) {
    return '<p class="nf-line" data-reveal>' + t('qs.notfound') + ' <a class="link-o" href="' + href('contact', null, query || null) + '">' + t('qs.contact') + ' <span aria-hidden="true">→</span></a>' +
      '<span class="sep" aria-hidden="true"></span><a class="link-u" href="' + href('identifier', 'roadliner') + '">' + t('qs.howto') + '</a></p>';
  }
  function commitments(compact) {
    var inStock = VT.products.filter(function (p) { return p.stock; }).length;
    return '<section class="commit' + (compact ? ' commit-s' : '') + '" aria-label="' + t('c.title') + '"><div class="wrap">' +
      (compact ? '' : '<div class="sec-head">' + eyebrow(t('c.eyebrow')) + '<h2 class="h2" data-split>' + t('c.title') + '</h2></div>') +
      '<ul class="commit-list">' + VT.config.commitments.map(function (c) {
        // Tant qu'aucun stock n'est renseigné, on affiche la taille du catalogue plutôt que « 0 en stock »
        var catalog = c.value === 'stock' && !inStock;
        var v = c.value === 'stock' ? (inStock || VT.products.length) : c.value;
        return '<li data-reveal><span class="commit-v"><b data-count="' + v + '">' + v + '</b><small>' + unitFor(c.unit) + '</small></span><span class="commit-l">' + t(catalog ? 'c.c4b' : 'c.' + c.key) + '</span><i class="commit-line" aria-hidden="true"></i></li>';
      }).join('') + '</ul>' + (compact ? '' : '<p class="mono-note" data-reveal="fade">' + t('c.note') + '</p>') + '</div></section>';
  }
  function crumbs(items) {
    return '<nav class="crumbs" aria-label="breadcrumb" data-reveal="fade"><a href="' + href('home') + '">' + t('cat.home') + '</a>' +
      items.map(function (it) { return '<span aria-hidden="true">/</span>' + (it[1] ? '<a href="' + it[1] + '">' + it[0] + '</a>' : '<span aria-current="page">' + it[0] + '</span>'); }).join('') + '</nav>';
  }
  function treadDivider() { return '<div class="tread tread-div" aria-hidden="true"><div class="tread-strip"></div></div>'; }

  /* ------------------------------------------------------------ grille filtrable */
  // Valeurs de « puce » d'un produit : type d'engin, type de pièce ou famille
  function chipValues(p, attr) { return attr === 'engines' ? enginesOf(p) : attr === 'type' ? [p.type] : [FAMILY[p.type]]; }
  function hasTonnage(p) { return isFinite(tonnageOf(p)[0]); }
  function filterBar(list, cfg) {
    var widths = uniq(list.map(widthOf).filter(Boolean)).sort(function (a, b) { return a - b; });
    var brands = uniq([].concat.apply([], list.map(brandsOf))).sort();
    var f = cfg.state;
    var chips = (cfg.chips || []).filter(function (c) {
      return list.some(function (p) { return chipValues(p, cfg.chipAttr).indexOf(c[0]) > -1; });
    }).map(function (c) {
      return '<button type="button" class="chip" data-chip="' + c[0] + '" aria-pressed="' + (f.sub === c[0]) + '">' + c[1] + '</button>';
    }).join('');
    var tons = [['0-2', '< 2 t'], ['2-4', '2 – 4 t'], ['4-7', '4 – 7 t'], ['7-12', '7 – 12 t'], ['12-99', '> 12 t']];
    return '<div class="fbar" data-fbar data-reveal="fade">' +
      (chips ? '<div class="chips" role="group" aria-label="' + (cfg.chipsLabel || '') + '"><button type="button" class="chip" data-chip="" aria-pressed="' + (!f.sub) + '">' + t('cat.all') + '</button>' + chips + '</div>' : '') +
      '<div class="fbar-row">' +
      (widths.length > 1 ? '<label class="sel sel-s"><span class="sr">' + t('cat.width') + '</span><select data-f="w" aria-label="' + t('cat.width') + '"><option value="">' + t('cat.width') + ' · ' + t('cat.any') + '</option>' +
        widths.map(function (w) { return '<option value="' + w + '"' + (String(f.w) === String(w) ? ' selected' : '') + '>' + num(w) + ' mm</option>'; }).join('') + '</select></label>' : '') +
      (brands.length > 1 ? '<label class="sel sel-s"><span class="sr">' + t('cat.brand') + '</span><select data-f="brand" aria-label="' + t('cat.brand') + '"><option value="">' + t('cat.brand') + ' · ' + t('cat.any') + '</option>' +
        brands.map(function (b) { return '<option value="' + esc(b.toLowerCase()) + '"' + (f.brand === b.toLowerCase() ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('') + '</select></label>' : '') +
      (list.some(hasTonnage) ? '<label class="sel sel-s"><span class="sr">' + t('cat.tonnage') + '</span><select data-f="t" aria-label="' + t('cat.tonnage') + '"><option value="">' + t('cat.tonnage') + ' · ' + t('cat.any') + '</option>' +
        tons.map(function (o) { return '<option value="' + o[0] + '"' + (f.t === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' : '') +
      (list.some(function (p) { return p.stock; }) ? '<label class="check"><input type="checkbox" data-f="stock"' + (f.stock ? ' checked' : '') + '><span class="check-box" aria-hidden="true"></span>' + t('cat.instock') + '</label>' : '') +
      '<span class="fbar-count mono" data-count-label aria-live="polite"></span>' +
      '<button type="button" class="link-u fbar-reset" data-reset>' + t('cat.reset') + '</button>' +
      '</div></div>';
  }
  // Grille paginée : les cartes sont rendues depuis les données, 24 par 24 (« Voir plus »)
  var PAGE = 24;
  function gridHTML() {
    return '<div class="grid" data-grid></div><div class="empty" data-empty hidden><p>' + t('cat.empty') + '</p></div>' +
      '<div class="more-row"><button type="button" class="btn btn-line" data-more hidden><span></span></button></div>';
  }
  function mountFilters(root, cfg) {
    var grid = $('[data-grid]', root), bar = $('[data-fbar]', root); if (!grid || !bar) return;
    var f = cfg.state, list = cfg.list || [], matches = [], shown = 0, more = $('[data-more]', root);
    function match(p) {
      if (f.sub && chipValues(p, cfg.chipAttr).indexOf(f.sub) < 0) return false;
      if (f.w && String(widthOf(p)) !== String(f.w)) return false;
      if (f.brand && brandsOf(p).map(function (b) { return b.toLowerCase(); }).indexOf(f.brand) < 0) return false;
      // Type d'engin + marque : il faut une même machine qui réponde aux deux
      if (f.brand && f.sub && cfg.chipAttr === 'engines' && !machinesOf(p).some(function (m) { return m.type === f.sub && m.brand.toLowerCase() === f.brand; })) return false;
      if (f.t) { var r = f.t.split('-').map(Number), tn = tonnageOf(p); if (!isFinite(tn[0]) || tn[1] < r[0] || tn[0] > r[1]) return false; }
      if (f.stock && !p.stock) return false;
      return true;
    }
    function renderNext(animate) {
      var next = matches.slice(shown, shown + PAGE);
      grid.insertAdjacentHTML('beforeend', next.map(function (p) { return card(p, { reveal: !animate }); }).join(''));
      var added = $$('.pcard', grid).slice(shown);
      shown += next.length;
      if (animate && window.Motion) Motion.cardsIn(added);
      if (more) { var rest = matches.length - shown; more.hidden = rest <= 0; $('span', more).textContent = t('cat.more', { n: Math.min(rest, PAGE), total: rest }); }
    }
    function apply(animate) {
      matches = list.filter(match);
      var go = function () {
        grid.innerHTML = ''; shown = 0; renderNext(animate);
        $('[data-count-label]', bar).textContent = t('cat.count', { n: matches.length });
        var empty = $('[data-empty]', root); if (empty) empty.hidden = matches.length > 0;
      };
      if (animate && window.Motion) Motion.gridOut(grid, go); else go();
      $$('[data-chip]', bar).forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-chip') === (f.sub || ''))); });
      if (cfg.onChange) cfg.onChange(f);
    }
    if (more) more.addEventListener('click', function () { renderNext(true); });
    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (chip) { f.sub = chip.getAttribute('data-chip'); apply(true); }
      if (e.target.closest('[data-reset]')) {
        f.sub = cfg.keepSub ? f.sub : ''; f.w = ''; f.brand = ''; f.t = ''; f.stock = false;
        $$('select[data-f]', bar).forEach(function (s) { s.value = ''; });
        var sc = $('input[data-f="stock"]', bar); if (sc) sc.checked = false;
        apply(true);
      }
    });
    bar.addEventListener('change', function (e) {
      var el = e.target.closest('[data-f]'); if (!el) return;
      var k = el.getAttribute('data-f'); f[k] = el.type === 'checkbox' ? el.checked : el.value; apply(true);
    });
    apply(false);
  }
  function stateFrom(r) { return { sub: r.param || r.query.sub || '', w: r.query.w || '', brand: r.query.brand || '', t: r.query.t || '', stock: r.query.stock === '1' }; }
  function queryFrom(f) { return { w: f.w, brand: f.brand, t: f.t, stock: f.stock ? '1' : '' }; }

  /* ------------------------------------------------------------ vues */
  var V = {};

  V.home = {
    html: function () {
      var c = C();
      var stock = VT.products.filter(function (p) { return p.stock; }).sort(function (a, b) { return (b.home ? 1 : 0) - (a.home ? 1 : 0); });
      // Sans stock renseigné : sélection du catalogue choisie pour l'accueil (back-office : « Accueil »)
      var hasStock = stock.length > 0;
      if (!hasStock) stock = VT.products.filter(function (p) { return p.home; }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
      var allLink = hasStock ? href('stock') : href('search');
      var doors = [
        ['chenilles', siteImg('door-chenilles', 'door-chenilles.jpg'), t('r.chenilles'), t('d.chenilles.s'), t('d.chenilles.c'), href('chenilles')],
        ['patins', siteImg('door-patins', 'door-patins.jpg'), t('r.patins'), t('d.patins.s'), t('d.patins.c'), href('patins')],
        ['identifier', siteImg('door-identifier', 'door-identifier.jpg'), t('d.identifier.t'), t('d.identifier.s'), t('d.identifier.c'), href('identifier')],
        ['autres', siteImg('door-autres'), t('r.autres'), t('d.autres.s'), t('d.autres.c'), href('autres')]
      ];
      var mq = t('mq').split('|');
      var mqItems = mq.concat(mq).map(function (w, i) { return '<span class="mq-w' + (i % mq.length === 0 ? ' is-o' : '') + '">' + w + '</span><span class="mq-dot" aria-hidden="true"></span>'; }).join('');
      return '' +
        '<section class="hero" data-hero>' +
        '<div class="hero-media" aria-hidden="true"><img class="hero-img" src="' + siteImg('hero', 'hero-excavator.jpg') + '" alt="" fetchpriority="high"><canvas class="hero-dust"></canvas><div class="hero-shade"></div></div>' +
        '<div class="wrap hero-in">' +
        '<p class="eyebrow" data-hero-fade>' + t('h.eyebrow') + '</p>' +
        '<h1 class="hero-title"><span class="ln"><span>' + t('h.t1') + '</span></span><span class="ln"><span>' + t('h.t2') + '</span></span><span class="ln"><span>' + t('h.t3') + '</span></span></h1>' +
        '<p class="hero-sub" data-hero-fade>' + t('h.sub') + '</p>' +
        '<div data-hero-qs>' + quickSearch() + '</div>' +
        '<div class="hero-help" data-hero-fade><a class="btn btn-line btn-sm" href="' + href('identifier', 'roadliner') + '"><span>' + t('qs.howto') + '</span></a>' +
        '<p class="nf-inline">' + t('qs.notfound') + ' <a class="link-o" href="' + href('contact') + '">' + t('qs.contact') + ' <span aria-hidden="true">→</span></a></p></div>' +
        '</div>' +
        '<div class="hero-foot wrap" data-hero-fade><span class="scroll-cue"><i aria-hidden="true"></i>' + t('h.scroll') + '</span><span class="mono hero-tag">' + t('mq').split('|')[0] + '</span></div>' +
        '<div class="tread tread-hero" aria-hidden="true"><div class="tread-strip"></div></div>' +
        '</section>' +

        '<section class="sec stock-sec" data-hscroll aria-labelledby="stock-t"><div class="wrap sec-head sec-head-row">' +
        '<div>' + eyebrow(t(hasStock ? 'h.stockEyebrow' : 'h.selEyebrow')) + '<h2 class="h2" id="stock-t" data-split>' + t(hasStock ? 'h.stockTitle' : 'h.selTitle') + '</h2></div>' +
        '<p class="sec-lead" data-reveal>' + t(hasStock ? 'h.stockText' : 'h.selText') + '</p></div>' +
        '<div class="hs-viewport"><div class="hs-track" data-skew>' + stock.map(function (p) { return card(p, { reveal: false }); }).join('') +
        '<a class="hs-more" href="' + allLink + '"><span class="hs-more-in"><b>' + t(hasStock ? 'h.stockAll' : 'h.selAll') + '</b><i aria-hidden="true">→</i></span></a></div></div>' +
        '<div class="wrap stock-foot"><a class="link-o" href="' + allLink + '">' + t(hasStock ? 'h.stockAll' : 'h.selAll') + ' <span aria-hidden="true">→</span></a><span class="mono-note">' + t('p.pncNote') + '</span></div>' +
        '</section>' +

        '<section class="sec doors-sec" aria-labelledby="doors-t"><div class="wrap">' +
        '<div class="sec-head">' + eyebrow(t('h.doorsEyebrow')) + '<h2 class="h2" id="doors-t" data-split>' + t('h.doorsTitle') + '</h2></div>' +
        '<div class="doors">' + doors.map(function (d, i) {
          return '<a class="door" href="' + d[5] + '" data-reveal="door" data-tilt>' +
            '<span class="door-media">' + (d[1] ? '<img src="' + d[1] + '" alt="" loading="lazy">' : '<span class="ph ph-door"><span>' + t('p.photo') + ' · ' + t('d.autres.s') + '</span></span>') + '</span>' +
            (d[1] ? pnc() : '') +
            '<span class="door-n mono">0' + (i + 1) + '</span>' +
            '<span class="door-body"><span class="door-t">' + d[2] + '</span><span class="door-s">' + d[3] + '</span><span class="door-c">' + d[4] + ' <i aria-hidden="true">→</i></span></span>' +
            '<span class="door-line" aria-hidden="true"></span></a>';
        }).join('') + '</div></div></section>' +

        '<section class="mq" aria-hidden="true"><div class="mq-track" data-marquee>' + mqItems + '</div></section>' +

        '<section class="sec id-sec" aria-labelledby="id-t"><div class="wrap id-grid">' +
        '<div class="id-copy">' + eyebrow(t('it.eyebrow')) + '<h2 class="h2" id="id-t" data-split>' + t('it.title') + '</h2>' +
        '<p class="sec-lead" data-reveal>' + t('it.text') + '</p>' +
        '<ol class="id-steps" data-reveal="stagger"><li><b class="mono">P</b>' + t('it.s1') + '</li><li><b class="mono">A·B·C</b>' + t('it.s2') + '</li><li><b class="mono">L</b>' + t('it.s3') + '</li></ol>' +
        '<a class="btn btn-o" href="' + href('identifier', 'roadliner') + '" data-reveal data-magnetic><span>' + t('it.cta') + '</span></a></div>' +
        '<div class="id-draw" data-scrub-draw><div class="sheet-tag mono">' + c.guide.tabs.roadliner.views[0] + ' · CT 135-400 GD</div>' + DRAW.roadlinerBottom(EXAMPLE.roadliner, c.guide.labels) + '</div>' +
        '</div></section>' +

        commitments(false) +

        '<section class="sec trust-sec" aria-labelledby="trust-t"><div class="wrap">' +
        '<div class="sec-head">' + eyebrow(t('t.eyebrow')) + '<h2 class="h2" id="trust-t" data-split>' + t('t.title') + '</h2></div>' +
        '<div class="logos" data-reveal="stagger">' + [1, 2, 3, 4, 5, 6].map(function () { return '<span class="logo-slot mono">' + t('t.logo') + '</span>'; }).join('') + '</div>' +
        '<figure class="review" data-reveal><blockquote><span class="review-q" aria-hidden="true">“</span>' + t('t.review') + '</blockquote><figcaption class="mono-note">' + t('t.reviewNote') + '</figcaption></figure>' +
        '</div></section>' +

        ctaBlock();
    },
    mount: function (root) { mountQuickSearch(root); }
  };

  function ctaBlock(query) {
    return '<section class="cta" aria-labelledby="cta-t"><div class="cta-media" aria-hidden="true"><img src="' + siteImg('cta', 'dust.jpg') + '" alt="" loading="lazy" data-parallax="0.18"></div>' +
      '<div class="wrap cta-in">' + eyebrow(t('cta.eyebrow')) +
      '<h2 class="h1" id="cta-t" data-split>' + t('cta.title') + '</h2><p class="sec-lead" data-reveal>' + t('cta.text') + '</p>' +
      '<div class="btn-row" data-reveal><a class="btn btn-o btn-lg" href="' + href('contact', null, query) + '" data-magnetic><span>' + t('cta.btn') + '</span></a>' +
      '<a class="btn btn-line btn-lg" href="tel:' + VT.config.phoneHref + '"><span>' + t('cta.call') + ' · ' + VT.config.phone + '</span></a></div></div></section>';
  }

  /* catégories */
  var CAT = {
    chenilles: { filter: function (p) { return p.type === 'chenille'; }, chipAttr: 'engines' },
    patins: { filter: function (p) { return PAD_TYPES.indexOf(p.type) > -1; }, chipAttr: 'type' },
    autres: { filter: function (p) { return FAMILY[p.type] === 'autres'; }, chipAttr: 'type' },
    stock: { filter: function (p) { return p.stock || !!p.badge; }, chipAttr: 'family' }
  };
  function catView(id) {
    return {
      html: function (r) {
        var c = C().cats[id], cfg = CAT[id];
        var list = VT.products.filter(cfg.filter);
        var chips = id === 'stock' ? [['chenille', t('r.chenilles')], ['patins', t('r.patins')]] : c.subs;
        var state = stateFrom(r);
        var body = list.length ? filterBar(list, { state: state, chips: chips, chipsLabel: t('cat.engine'), chipAttr: cfg.chipAttr }) + gridHTML()
          : '<div class="noresult" data-reveal><div class="noresult-ic" aria-hidden="true">' + gearIcon() + '</div><h2 class="h3">' + t('st.empty') + '</h2><p>' + t('st.emptyText') + '</p>' +
            '<div class="btn-row"><a class="btn btn-o" href="' + href('chenilles') + '"><span>' + t('r.chenilles') + '</span></a><a class="btn btn-line" href="' + href('patins') + '"><span>' + t('r.patins') + '</span></a></div></div>';
        return '<section class="pg-hero cat-hero"><div class="pg-hero-media" aria-hidden="true"><img src="' + siteImg('cat-' + id, c.img) + '" alt="" data-parallax="0.12"></div>' +
          '<div class="wrap">' + crumbs([[t('r.' + id)]]) +
          '<h1 class="pg-title" data-split>' + t('r.' + id) + '</h1><p class="pg-lead" data-reveal>' + c.intro + '</p>' +
          (id === 'stock' ? '' : '<div class="cat-qs" data-reveal>' + quickSearch({ tab: id === 'patins' ? 'dims' : 'model', type: id === 'patins' ? 'patins' : 'chenille' }) + '</div>') +
          '</div>' + (id === 'autres' ? '' : pnc()) + '<i class="pg-line" aria-hidden="true"></i></section>' +
          '<section class="sec sec-tight"><div class="wrap">' + body + notFoundLine() +
          '</div></section>' + commitments(true) + ctaBlock();
      },
      mount: function (root, r) {
        mountQuickSearch(root);
        var st = stateFrom(r);
        mountFilters(root, { state: st, list: VT.products.filter(CAT[id].filter), chipAttr: CAT[id].chipAttr, onChange: function (f) { replaceUrl(href(id, f.sub || null, queryFrom(f))); } });
      }
    };
  }
  ['chenilles', 'patins', 'autres', 'stock'].forEach(function (id) { V[id] = catView(id); });

  /* fiche produit */
  function specRows(p) {
    var d = p.dims || {}, rows = [];
    var mm = function (v) { return num(v) + ' mm'; };
    // Une ligne n'apparaît que si toutes ses cotes sont renseignées dans le tableau
    var ok = function () { return Array.prototype.every.call(arguments, function (v) { return v != null && v !== ''; }); };
    var row = function (label, value, cond) { if (cond) rows.push([label, value]); };
    var j = function (vals, sep) { return vals.map(num).join(sep) + ' mm'; };
    if (p.type === 'chenille') {
      var gk = 'gd.' + d.g, gl = d.g ? (t(gk) === gk ? d.g : d.g + ' · ' + t(gk)) : t('sp.gTbc');
      rows = [[t('sp.width'), mm(d.w)], [t('sp.pitch'), mm(d.p)], [t('sp.links'), d.l], [t('sp.guide'), gl], [t('sp.matter'), t('sp.matterV')]];
    } else if (p.type === 'roadliner') {
      row(t('sp.desig'), p.desig, ok(p.desig)); row(t('sp.pitch'), mm(d.p), ok(d.p));
      row(t('sp.holes'), j([d.A, d.B, d.C], ' × '), ok(d.A, d.B, d.C)); row(t('sp.L'), mm(d.L), ok(d.L));
      row(t('sp.l'), mm(d.l), ok(d.l)); row(t('sp.h'), mm(d.h), ok(d.h));
      row(t('sp.bolts'), d.bolt + (d.n ? ' × ' + d.n : ''), ok(d.bolt)); rows.push([t('sp.matter'), t('sp.matterP')]);
    } else if (p.type === 'bolton') {
      row(t('sp.pitch'), mm(d.p), ok(d.p)); row(t('sp.tile'), mm(d.tw), ok(d.tw)); row(t('sp.A'), mm(d.A), ok(d.A));
      row(t('sp.BC'), j([d.B, d.C], ' / '), ok(d.B, d.C)); row(t('sp.DE'), j([d.D, d.E], ' / '), ok(d.D, d.E));
      row(t('sp.FG'), j([d.F, d.G], ' / '), ok(d.F, d.G)); row(t('sp.bolts'), d.bolt, ok(d.bolt));
      row(t('sp.size'), j([d.L, d.h, d.l], ' × '), ok(d.L, d.h, d.l));
    } else if (p.type === 'clipon') {
      row(t('sp.pitch'), mm(d.p), ok(d.p)); row(t('sp.tile'), mm(d.L), ok(d.L)); row(t('sp.W'), mm(d.W), ok(d.W));
      row(t('sp.H'), mm(d.H), ok(d.H)); row(t('sp.W1H1'), j([d.W1, d.H1], ' × '), ok(d.W1, d.H1)); rows.push([t('sp.matter'), t('sp.matterC')]);
    } else {
      rows = [[t('sp.engines'), uniq(enginesOf(p).map(function (e) { return t('e.' + e); })).join(', ') || '—'], [t('sp.range'), t('sp.rangeV')]];
    }
    if (p.note) rows.push([t('sp.note'), p.note]);
    if (p.cls) rows.push([t('sp.cls'), p.cls]);
    if (p.weight) rows.push([t('sp.weight'), num(p.weight) + ' kg']);
    return rows;
  }
  // Description saisie dans le back-office : une ligne vide sépare les paragraphes, anglais vide = français
  function descHTML(p) {
    var txt = p.desc && (p.desc[S.lang] || p.desc.fr || p.desc.en);
    if (!txt) return '';
    return '<div class="pr-desc" data-reveal>' + String(txt).split(/\n{2,}/).map(function (para) { return '<p>' + esc(para).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>';
  }
  // Tableau des machines : 12 lignes, puis « Voir les N machines »
  var TBL_ROWS = 12;
  function machinesTable(ms) {
    var withT = ms.some(function (m) { return m.t != null; });
    return '<table class="tbl" data-reveal="rows"><thead><tr><th>' + t('pr.thBrand') + '</th><th>' + t('pr.thModel') + '</th><th>' + t('pr.thType') + '</th>' +
      (withT ? '<th>' + t('pr.thT') + '</th>' : '') + '</tr></thead><tbody>' +
      ms.map(function (m, i) {
        return '<tr' + (i >= TBL_ROWS ? ' class="is-more" hidden' : '') + '><td>' + esc(m.brand) + '</td><td class="mono"><a href="' + href('search', null, { brand: m.brand, model: m.id }) + '">' + esc(m.model) + '</a></td><td>' + t('e.' + m.type) + '</td>' +
          (withT ? '<td class="mono">' + (m.t == null ? '—' : num(m.t) + ' t') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>' +
      (ms.length > TBL_ROWS ? '<button type="button" class="link-o tbl-more" data-tbl-more>' + t('pr.allMachines', { n: ms.length }) + ' ↓</button>' : '');
  }
  V.product = {
    html: function (r) {
      var p = P[r.param]; if (!p) return V['404'].html();
      var fam = FAMILY[p.type], catId = fam === 'chenille' ? 'chenilles' : fam;
      var draws = drawingsFor(p.type, p.dims || {});
      var ms = machinesOf(p);
      var related = VT.products.filter(function (x) { return x.id !== p.id && FAMILY[x.type] === fam; }).slice(0, 4);
      var cross = [].concat(p.old || [], p.oem || []);
      var guideTab = p.type === 'chenille' ? 'chenille' : (PAD_TYPES.indexOf(p.type) > -1 ? p.type : null);
      return '<section class="pr"><div class="wrap">' +
        crumbs([[t('r.' + catId), href(catId)], [pname(p)]]) +
        '<div class="pr-grid">' +
        '<div class="pr-media" data-reveal="clip">' +
        (draws.length ? '<div class="seg" role="tablist"><button type="button" role="tab" aria-selected="true" data-pv="photo">' + t('pr.photo') + '</button><button type="button" role="tab" aria-selected="false" data-pv="draw">' + t('pr.drawing') + '</button></div>' : '') +
        '<div class="pr-photo" data-pv-panel="photo">' + pimg(p) + badge(p) + '</div>' +
        (p.imgs && p.imgs.length > 1 ? '<div class="pr-thumbs" data-pv-panel="photo">' + p.imgs.map(function (f, i) {
          return '<button type="button" data-thumb="' + esc(imgSrc(f)) + '" aria-pressed="' + (i === 0) + '" aria-label="' + t('pr.photo') + ' ' + (i + 1) + '"><img src="' + esc(imgSrc(f)) + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>' : '') +
        (draws.length ? '<div class="pr-draw" data-pv-panel="draw" hidden>' + draws[0] + '</div>' : '') +
        '</div>' +
        '<div class="pr-info">' +
        '<p class="pcard-type" data-reveal="fade">' + t('ty.' + p.type) + '</p>' +
        '<h1 class="pr-title" data-split>' + pname(p) + '</h1>' +
        '<p class="pr-ref mono" data-reveal="fade">' + t('p.ref') + ' ' + esc(p.ref) + '</p>' +
        '<div data-reveal="fade">' + avail(p) + '</div>' + descHTML(p) +
        '<dl class="specs" data-reveal="stagger">' + specRows(p).map(function (row) { return '<div><dt>' + row[0] + '</dt><dd class="mono">' + esc(row[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '<div class="pr-buy" data-reveal>' +
        '<div class="qty" data-qty><button type="button" data-step="-1" aria-label="' + t('pr.dec') + '">−</button><input type="number" min="1" max="999" value="1" aria-label="' + t('pr.qty') + '"><button type="button" data-step="1" aria-label="' + t('pr.inc') + '">+</button></div>' +
        '<button class="btn btn-o btn-lg" type="button" data-add="' + p.id + '" data-add-qty data-magnetic><span>' + t('pr.addLong') + '</span></button>' +
        '<a class="btn btn-line btn-lg" href="tel:' + VT.config.phoneHref + '"><span>' + t('pr.call') + '</span></a></div>' +
        (PLATE_TYPES.indexOf(p.type) > -1 ? '<p class="pr-plate" data-reveal="fade">' + t('pr.plate') + '</p>' : '') +
        '<p class="price mono" data-reveal="fade">' + t('p.price') + '</p>' +
        '<ul class="pr-reassure" data-reveal="stagger"><li>' + t('pr.r1') + '</li><li>' + t('pr.r2') + '</li><li>' + t('pr.r3') + '</li></ul>' +
        (guideTab ? '<p class="pr-check" data-reveal="fade">' + t('pr.check') + ' <a class="link-o" href="' + href('identifier', guideTab) + '">' + t('pr.guide') + ' →</a></p>' : '') +
        '</div></div></div></section>' +

        (draws.length ? '<section class="sec sec-dark"><div class="wrap"><div class="sec-head sec-head-row"><div>' + eyebrow(t('pr.drawing')) + '<h2 class="h2" data-split>' + esc(p.desig || p.ref) + '</h2></div><p class="mono-note" data-reveal="fade">' + t('pr.drawNote') + '</p></div>' +
          '<div class="draw-pair">' + draws.map(function (svg, i) { return '<figure class="sheet-fig" data-reveal><figcaption class="sheet-tag mono">' + (C().guide.tabs[guideTab] ? C().guide.tabs[guideTab].views[i] : '') + '</figcaption>' + svg + '</figure>'; }).join('') + '</div></div></section>' : '') +

        '<section class="sec"><div class="wrap pr-tables">' +
        '<div><div class="sec-head">' + eyebrow(t('pr.machines')) + '<h2 class="h3" data-split>' + t('pr.machines') + ' · ' + ms.length + '</h2></div>' +
        (ms.length ? machinesTable(ms) : '<p class="muted" data-reveal>' + (p.cls ? t('sp.cls') + ' : ' + esc(p.cls) + '. ' : '') + t('pr.noMachines') + '</p>') +
        '</div>' +
        '<div><div class="sec-head">' + eyebrow(t('pr.cross')) + '<h2 class="h3" data-split>' + t('pr.cross') + '</h2></div>' +
        (cross.length ? '<ul class="xref" data-reveal="stagger">' + cross.map(function (x) { return '<li class="mono">' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="muted" data-reveal>' + t('pr.noCross') + '</p>') +
        '</div></div></section>' +

        (related.length ? '<section class="sec sec-tight"><div class="wrap"><div class="sec-head">' + eyebrow(t('pr.related')) + '<h2 class="h2" data-split>' + t('r.' + catId) + '</h2></div>' +
          '<div class="grid">' + related.map(function (x) { return card(x); }).join('') + '</div></div></section>' : '') +
        commitments(true);
    },
    mount: function (root, r) {
      var p = P[r.param]; if (!p) return;
      var qty = $('[data-qty]', root);
      if (qty) {
        var input = $('input', qty);
        qty.addEventListener('click', function (e) {
          var b = e.target.closest('[data-step]'); if (!b) return;
          input.value = Math.max(1, Math.min(999, (parseInt(input.value, 10) || 1) + Number(b.getAttribute('data-step'))));
          if (window.Motion) Motion.pop(input);
        });
      }
      var tm = $('[data-tbl-more]', root);
      if (tm) tm.addEventListener('click', function () {
        var rows = $$('tr.is-more', root); rows.forEach(function (tr) { tr.hidden = false; });
        tm.remove(); if (window.Motion) Motion.rowsIn(rows);
      });
      $$('[data-thumb]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var img = $('.pr-photo img', root); if (img) img.src = b.getAttribute('data-thumb');
          $$('[data-thumb]', root).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        });
      });
      $$('[data-pv]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-pv');
          $$('[data-pv]', root).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          $$('[data-pv-panel]', root).forEach(function (pn) {
            var on = pn.getAttribute('data-pv-panel') === v; pn.hidden = !on;
            if (on && window.Motion) { Motion.panelIn(pn); var svg = $('svg[data-draw]', pn); if (svg) Motion.draw(svg); }
          });
        });
      });
      setLd({
        '@context': 'https://schema.org', '@type': 'Product', name: pname(p), sku: p.ref, brand: { '@type': 'Brand', name: 'V-Track' },
        category: t('ty.' + p.type), image: p.img ? imgSrc(p.img) : undefined,
        additionalProperty: specRows(p).map(function (row) { return { '@type': 'PropertyValue', name: row[0], value: String(row[1]) }; }),
        isAccessoryOrSparePartFor: machinesOf(p).map(function (m) { return { '@type': 'Product', name: m.brand + ' ' + m.model }; })
      });
    }
  };

  /* recherche */
  function searchResult(r) {
    var q = r.query, res = { list: [], title: '', sub: '', pre: {} };
    if (q.q) { res.list = searchText(q.q); res.title = t('s.for') + ' « ' + esc(q.q) + ' »'; }
    else if (q.brand || q.model) {
      res.list = searchMachine(q.brand, q.model); var m = M[q.model];
      res.title = t('s.machine') + ' ' + esc(m ? m.brand + ' ' + m.model : q.brand); res.pre = { brand: q.brand, model: q.model };
      if (m) res.sub = t('e.' + m.type) + (m.t != null ? ' · ' + num(m.t) + ' t' : '');
    } else if (q.w || q.p || q.l) {
      res.list = searchDims(q.type || 'chenille', q.w, q.p, q.l);
      res.title = t('s.dims'); res.pre = { tab: 'dims', type: q.type, w: q.w, p: q.p, l: q.l };
      res.sub = [q.type === 'chenille' || !q.type ? t('ty.chenille') : t('ty.patins'), q.w && (t('qs.width') + ' ' + esc(q.w)), q.p && (t('qs.pitch') + ' ' + esc(q.p)), q.l && (t('qs.links') + ' ' + esc(q.l))].filter(Boolean).join(' · ');
    } else { res.list = VT.products.slice(); res.title = t('s.all'); }
    return res;
  }
  var SEARCH_CHIPS = function () { return [['chenille', t('r.chenilles')], ['patins', t('r.patins')], ['autres', t('r.autres')]]; };
  V.search = {
    html: function (r) {
      var q = r.query, s = searchResult(r);
      var contactQ = { q: q.q, brand: q.brand, model: q.model, type: q.type, w: q.w, p: q.p, l: q.l };
      return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.search')]]) +
        '<h1 class="pg-title pg-title-s" data-split>' + s.title + '</h1>' + (s.sub ? '<p class="pg-lead mono" data-reveal="fade">' + s.sub + '</p>' : '') +
        '<div class="cat-qs" data-reveal>' + quickSearch(s.pre) + '</div></div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec sec-tight"><div class="wrap">' +
        (s.list.length ? filterBar(s.list, { state: { sub: '', w: '', brand: '', t: '', stock: false }, chips: SEARCH_CHIPS(), chipAttr: 'family' }) + gridHTML()
          : '<div class="noresult" data-reveal><div class="noresult-ic" aria-hidden="true">' + gearIcon() + '</div><h2 class="h3">' + t('s.none') + '</h2><p>' + t('s.noneText') + '</p>' +
          '<a class="btn btn-o" href="' + href('contact', null, contactQ) + '" data-magnetic><span>' + t('s.ask') + '</span></a></div>') +
        notFoundLine(contactQ) + '</div></section>';
    },
    mount: function (root, r) {
      mountQuickSearch(root);
      mountFilters(root, { state: { sub: '', w: '', brand: '', t: '', stock: false }, list: searchResult(r).list, chipAttr: 'family' });
    }
  };

  /* guide d'identification */
  var GUIDE_TABS = ['chenille', 'roadliner', 'clipon', 'bolton'];
  var GUIDE_FIELDS = {
    chenille: [['w', 'W'], ['p', 'P'], ['l', 'N'], ['g', 'G']],
    roadliner: [['p', 'P'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['L', 'L'], ['l', 'l'], ['h', 'h']],
    clipon: [['p', 'P'], ['L', 'L'], ['W', 'W'], ['H', 'H'], ['W1', 'W1'], ['H1', 'H1']],
    bolton: [['p', 'P'], ['tw', 'T'], ['L', 'L'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'], ['h', 'h'], ['l', 'l']]
  };
  function sheetHTML(tab) {
    var g = C().guide, tb = g.tabs[tab], ex = EXAMPLE[tab];
    var draws = drawingsFor(tab, ex);
    var idx = GUIDE_TABS.indexOf(tab);
    return '<div class="sheet" data-sheet="' + tab + '">' +
      '<header class="sheet-hd"><h2 class="h3">' + idx + ' · ' + tb.label + '</h2><p>' + tb.lead + '</p></header>' +
      '<div class="sheet-grid"><div class="sheet-draws">' + draws.map(function (svg, i) { return '<figure class="sheet-fig"><figcaption class="sheet-tag mono">' + tb.views[i] + '</figcaption>' + svg + '</figure>'; }).join('') + '</div>' +
      '<aside class="sheet-side"><h3 class="mini-t">' + t('g.onMachine') + '</h3><ol class="steps">' + tb.steps.map(function (s) { return '<li><span>' + s + '</span></li>'; }).join('') + '</ol>' +
      '<dl class="legend">' + tb.legend.map(function (l) { return '<div data-hl="' + l[0].split(' ')[0].split('/')[0].trim() + '"><dt class="mono">' + l[0] + '</dt><dd>' + l[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="desig"><p class="desig-k">' + t('g.designation') + ' : ' + tb.desig[0] + '</p><p class="desig-v mono">' + tb.desig[1] + '</p><p class="desig-s">' + tb.desig[2] + '</p></div>' +
      '<p class="note">' + tb.note + '</p></aside></div>' +
      '<form class="measure" data-measure="' + tab + '"><div class="measure-hd"><h3 class="mini-t">' + t('g.measure') + '</h3><p>' + t('g.measureText') + '</p></div>' +
      '<div class="measure-fields">' + GUIDE_FIELDS[tab].map(function (f) {
        var v = ex[f[0]];
        return '<label class="mfield" data-for="' + f[1] + '"><span class="mono">' + (f[1] === 'N' ? t('qs.links') : f[1]) + '</span><input name="' + f[0] + '" data-key="' + f[1] + '" ' + (f[0] === 'g' ? '' : 'inputmode="decimal" ') + 'autocomplete="off" placeholder="' + num(v) + '"></label>';
      }).join('') + '</div>' +
      '<div class="measure-act"><button class="btn btn-o" type="button" data-measure-add data-magnetic><span>' + t('g.addCustom') + '</span></button>' +
      '<button class="btn btn-line" type="button" data-measure-search><span>' + t('g.searchDims') + '</span></button>' +
      '<a class="link-o" href="' + href('contact', null, { type: tab }) + '">' + t('g.notfound') + ' →</a></div></form></div>';
  }
  V.identifier = {
    html: function (r) {
      var g = C().guide, tab = GUIDE_TABS.indexOf(r.param) > -1 ? r.param : 'roadliner';
      return '<section class="pg-hero guide-hero"><div class="wrap">' + crumbs([[t('r.identifier')]]) +
        '<h1 class="pg-title" data-split>' + g.title + '</h1><p class="pg-lead" data-reveal>' + g.intro + '</p>' +
        '<div class="gtabs" role="tablist" data-reveal>' + GUIDE_TABS.map(function (k, i) {
          return '<button type="button" role="tab" class="gtab" data-gtab="' + k + '" aria-selected="' + (k === tab) + '"><span class="mono">0' + i + '</span>' + g.tabs[k].label + '</button>';
        }).join('') + '<span class="gtab-ind" aria-hidden="true"></span></div>' +
        '</div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec pitch-sec" data-pitch' + (tab === 'chenille' ? ' hidden' : '') + '><div class="wrap pitch-grid">' +
        '<div><h2 class="h3" data-split>' + t('g.pitchTitle') + '</h2><p class="sec-lead" data-reveal>' + g.pitch + '</p><button type="button" class="link-u" data-replay>' + t('g.replay') + ' ↻</button></div>' +
        '<div class="pitch-box" data-reveal>' + DRAW.pitch() + '</div></div></section>' +
        '<section class="sec sec-tight"><div class="wrap" data-sheet-wrap>' + sheetHTML(tab) + '</div></section>' + ctaBlock();
    },
    mount: function (root, r) {
      var wrap = $('[data-sheet-wrap]', root), tabs = $$('[data-gtab]', root), ind = $('.gtab-ind', root);
      function place() {
        var a = $('[data-gtab][aria-selected="true"]', root); if (!a || !ind) return;
        ind.style.width = a.offsetWidth + 'px'; ind.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
        ind.style.height = a.offsetHeight + 'px';
      }
      requestAnimationFrame(place);
      if (window.ResizeObserver) new ResizeObserver(place).observe($('.gtabs', root));
      else window.addEventListener('resize', place);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
      tabs.forEach(function (b) {
        b.addEventListener('click', function () {
          var tab = b.getAttribute('data-gtab');
          if (b.getAttribute('aria-selected') === 'true') return;
          tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); place();
          replaceUrl(href('identifier', tab));
          var pitch = $('[data-pitch]', root);
          var swap = function () {
            wrap.innerHTML = sheetHTML(tab); mountSheet(wrap);
            if (pitch) pitch.hidden = tab === 'chenille';
            if (window.Motion) { Motion.sheetIn(wrap); if (pitch && !pitch.hidden) Motion.pitch(pitch); }
          };
          if (window.Motion) Motion.sheetOut(wrap, swap); else swap();
        });
      });
      var rp = $('[data-replay]', root); if (rp) rp.addEventListener('click', function () { if (window.Motion) Motion.pitch($('[data-pitch]', root), true); });
      mountSheet(wrap);
    }
  };
  function mountSheet(wrap) {
    var form = $('[data-measure]', wrap); if (!form) return;
    var tab = form.getAttribute('data-measure');
    var svgs = $$('svg[data-draw]', wrap);
    $$('input', form).forEach(function (inp) {
      var k = inp.getAttribute('data-key');
      inp.addEventListener('input', function () {
        var v = inp.value.trim() || inp.placeholder;
        svgs.forEach(function (svg) { $$('[data-v="' + k + '"]', svg).forEach(function (ts) { ts.textContent = v; }); });
        highlight(k, true);
      });
      inp.addEventListener('focus', function () { highlight(k, true); });
      inp.addEventListener('blur', function () { highlight(k, false); });
    });
    $$('[data-hl]', wrap).forEach(function (row) {
      row.addEventListener('mouseenter', function () { highlight(row.getAttribute('data-hl'), true); });
      row.addEventListener('mouseleave', function () { highlight(row.getAttribute('data-hl'), false); });
    });
    function highlight(k, on) { svgs.forEach(function (svg) { $$('[data-dim="' + k + '"]', svg).forEach(function (g) { g.classList.toggle('is-hl', on); }); }); }
    function values() {
      var d = {}; $$('input', form).forEach(function (inp) { d[inp.getAttribute('data-key')] = inp.value.trim(); }); return d;
    }
    $('[data-measure-add]', form).addEventListener('click', function (e) {
      var d = values();
      if (!Object.keys(d).some(function (k) { return d[k]; })) { var first = $('input', form); first.focus(); if (window.Motion) Motion.shake(first.parentNode); return; }
      addCustom(tab, d, e.currentTarget);
    });
    $('[data-measure-search]', form).addEventListener('click', function () {
      var d = values();
      if (tab === 'chenille') location.hash = href('search', null, { type: 'chenille', w: d.W || 400, p: d.P || 72.5, l: d.N || '' });
      else if (tab === 'bolton') location.hash = href('search', null, { type: tab, w: d.T || EXAMPLE.bolton.tw, p: d.P || EXAMPLE.bolton.p });
      else location.hash = href('search', null, { type: tab, w: d.L || EXAMPLE[tab].L, p: d.P || EXAMPLE[tab].p });
    });
  }

  /* panier de devis */
  function stepsBar(n) {
    return '<ol class="qsteps" data-reveal="fade">' + [t('q.step1'), t('q.step2'), t('q.step3')].map(function (s, i) {
      return '<li class="' + (i < n ? 'is-done' : '') + (i === n ? ' is-on' : '') + '"><span class="mono">0' + (i + 1) + '</span>' + s + '</li>';
    }).join('') + '</ol>';
  }
  function lineHTML(i) {
    var p = !i.custom && P[i.id];
    var media = i.custom ? '<span class="ql-ic" aria-hidden="true">' + gearIcon() + '</span>' : (p ? pimg(p) : '');
    var title = i.custom ? t('q.custom') + ' · ' + t('ty.' + i.type) : (p ? '<a href="' + href('product', p.id) + '">' + pname(p) + '</a>' : esc(i.id));
    var meta = i.custom ? '<p class="ql-ref mono">' + esc(customLabel(i)) + '</p>' : (p ? '<p class="ql-ref mono">' + t('p.ref') + ' ' + esc(p.ref) + '</p>' + avail(p) : '');
    return '<li class="ql" data-line="' + i.id + '"><div class="ql-media">' + media + '</div><div class="ql-body"><p class="ql-t">' + title + '</p>' + meta + '</div>' +
      '<div class="ql-act"><div class="qty qty-s" data-qty><button type="button" data-step="-1" aria-label="' + t('pr.dec') + '">−</button><input type="number" min="1" max="999" value="' + i.qty + '" aria-label="' + t('pr.qty') + '"><button type="button" data-step="1" aria-label="' + t('pr.inc') + '">+</button></div>' +
      '<button type="button" class="ql-rm" data-rm="' + i.id + '" aria-label="' + t('q.remove') + '"><span aria-hidden="true">×</span><span class="ql-rm-t">' + t('q.remove') + '</span></button></div></li>';
  }
  function summaryHTML() {
    return '<h2 class="mini-t">' + t('q.summary') + '</h2><ul class="qsum-l"><li><span>' + t('q.items') + '</span><b class="mono">' + t('q.lines', { n: S.cart.length }) + '</b></li>' +
      '<li><span>' + t('pr.qty') + '</span><b class="mono">' + t('q.units', { n: cartUnits() }) + '</b></li><li><span>' + t('p.price') + '</span><b class="mono">—</b></li></ul>' +
      '<p class="qsum-lang mono">' + t('q.lang') + '</p>' +
      '<button class="btn btn-o btn-lg btn-block" type="submit" form="qform" data-magnetic><span>' + t('f.send') + '</span></button>' +
      '<p class="form-msg" data-form-msg role="alert" hidden></p>' +
      '<p class="qsum-saved">' + t('q.saved') + '</p><ul class="pr-reassure"><li>' + t('pr.r1') + '</li><li>' + t('pr.r3') + '</li></ul>';
  }
  function field(name, label, o) {
    o = o || {};
    var req = o.req ? ' required' : '', opt = o.req ? '' : ' <small>(' + t('f.optional') + ')</small>';
    var input = o.textarea ? '<textarea name="' + name + '" rows="4"' + req + '>' + esc(o.value || '') + '</textarea>'
      : o.select ? '<select name="' + name + '"' + req + '>' + o.select + '</select>'
        : '<input name="' + name + '" type="' + (o.type || 'text') + '"' + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' value="' + esc(o.value || '') + '"' + req + '>';
    return '<label class="ff' + (o.wide ? ' ff-wide' : '') + '"><span class="ff-l">' + label + opt + '</span>' + input + '<span class="ff-err" aria-live="polite"></span></label>';
  }
  function photosField() {
    return '<div class="ff ff-wide"><span class="ff-l">' + t('f.photos') + ' <small>(' + t('f.optional') + ')</small></span>' +
      '<label class="drop" data-drop><input type="file" name="photos" accept="image/*" multiple><span class="drop-ic" aria-hidden="true">+</span><span>' + t('f.photosHint') + '</span></label>' +
      '<div class="thumbs" data-thumbs></div></div>';
  }
  function consentFields() {
    var legal = href('legal');
    return '<label class="check check-l"><input type="checkbox" name="rgpd" required><span class="check-box" aria-hidden="true"></span><span>' + t('f.rgpd', { legal: legal }) + '</span><span class="ff-err" aria-live="polite"></span></label>' +
      '<label class="check check-l check-resp"><input type="checkbox" name="resp" required><span class="check-box" aria-hidden="true"></span><span>' + t('f.resp', { legal: legal }) + '</span><span class="ff-err" aria-live="polite"></span></label>';
  }
  function brandSelect(sel) {
    return '<option value="">—</option>' + brandsList().map(function (b) { return '<option' + (b === sel ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '<option>' + (S.lang === 'fr' ? 'Autre' : 'Other') + '</option>';
  }
  function plateField(i) {
    return '<div class="plate ff-wide" data-plate="' + i.id + '">' +
      field('plate-' + i.id, t('f.plate') + ' · ' + pname(P[i.id]), { req: true, value: i.plate }) +
      '<label class="check"><input type="checkbox" data-plate-unknown="' + i.id + '"' + (i.plateUnknown ? ' checked' : '') + '><span class="check-box" aria-hidden="true"></span><span>' + t('f.plateUnknown') + '</span></label></div>';
  }
  function platesFieldset() {
    var lines = S.cart.filter(needsPlate);
    if (!lines.length) return '';
    return '<fieldset data-plates><legend class="mini-t">' + t('q.plateT') + '</legend><p class="plate-hint">' + t('q.plateHint') + '</p>' +
      '<div class="ff-grid">' + lines.map(plateField).join('') + '</div></fieldset>';
  }
  // Pour choisir une platine compatible, Valmat a besoin de la marque et du modèle de la machine.
  function machineRequired(form, on) {
    ['brand', 'model'].forEach(function (name) {
      var el = form.elements[name], small = $('small', el.closest('.ff'));
      el.required = on;
      if (small) small.hidden = on;
    });
  }
  function mountPlates(root) {
    var form = $('#qform', root); if (!form) return;
    var lineOf = function (id) { return S.cart.filter(function (x) { return x.id === id; })[0]; };
    var sync = function (box) {
      var inp = form.elements['plate-' + box.getAttribute('data-plate-unknown')];
      if (box.checked) inp.dispatchEvent(new Event('input', { bubbles: true })); // efface l'erreur éventuelle
      inp.disabled = box.checked; inp.required = !box.checked;
    };
    $$('[data-plate-unknown]', form).forEach(sync);
    machineRequired(form, S.cart.some(needsPlate));
    form.addEventListener('input', function (e) {
      var name = e.target.name || '';
      if (name.indexOf('plate-') !== 0) return;
      var line = lineOf(name.slice(6));
      if (line) { line.plate = e.target.value; store.set('vt.quote', S.cart); }
    });
    form.addEventListener('change', function (e) {
      var box = e.target.closest('[data-plate-unknown]'); if (!box) return;
      var line = lineOf(box.getAttribute('data-plate-unknown'));
      if (line) { line.plateUnknown = box.checked; store.set('vt.quote', S.cart); }
      sync(box);
    });
  }
  function plateRemoved(root, id) {
    var form = $('#qform', root), block = $('[data-plate="' + id + '"]', root);
    if (block) block.remove();
    if (form && !S.cart.some(needsPlate)) {
      var set = $('[data-plates]', form);
      if (set) set.remove();
      machineRequired(form, false);
    }
  }
  V.devis = {
    html: function () {
      if (!S.cart.length) {
        return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.devis')]]) + '<h1 class="pg-title" data-split>' + t('q.title') + '</h1>' + stepsBar(0) + '</div></section>' +
          '<section class="sec sec-tight"><div class="wrap"><div class="noresult" data-reveal><div class="noresult-ic" aria-hidden="true">' + gearIcon() + '</div>' +
          '<h2 class="h3">' + t('q.empty') + '</h2><p>' + t('q.emptyText') + '</p><div class="btn-row"><a class="btn btn-o" href="' + href('chenilles') + '"><span>' + t('q.browse') + '</span></a>' +
          '<a class="btn btn-line" href="' + href('identifier') + '"><span>' + t('q.guides') + '</span></a></div></div></div></section>' + commitments(true);
      }
      return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.devis')]]) + '<h1 class="pg-title" data-split>' + t('q.title') + '</h1>' +
        '<p class="pg-lead" data-reveal>' + t('q.sub') + '</p>' + stepsBar(1) + '</div></section>' +
        '<section class="sec sec-tight"><div class="wrap quote-grid"><div class="quote-main">' +
        '<h2 class="mini-t">' + t('q.items') + '</h2><ul class="qlist" data-qlist>' + S.cart.map(lineHTML).join('') + '</ul>' +
        '<form class="qform" id="qform" data-form="quote" novalidate>' + platesFieldset() +
        '<fieldset><legend class="mini-t">' + t('q.form') + '</legend><div class="ff-grid">' +
        field('company', t('f.company'), { auto: 'organization' }) + field('name', t('f.name'), { req: true, auto: 'name' }) +
        field('email', t('f.email'), { req: true, type: 'email', auto: 'email' }) + field('phone', t('f.phone'), { req: true, type: 'tel', auto: 'tel' }) +
        field('zip', t('f.zip'), { auto: 'postal-code', mode: 'numeric' }) + '</div></fieldset>' +
        '<fieldset><legend class="mini-t">' + t('q.machine') + '</legend><div class="ff-grid">' +
        field('brand', t('f.brand'), { select: brandSelect() }) + field('model', t('f.model')) +
        field('count', t('f.count'), { type: 'number', mode: 'numeric', value: '1' }) +
        field('delay', t('f.delay'), { select: ['f.delay1', 'f.delay2', 'f.delay3', 'f.delay4'].map(function (k, i) { return '<option' + (i === 1 ? ' selected' : '') + '>' + t(k) + '</option>'; }).join('') }) +
        field('comment', t('f.comment'), { textarea: true, wide: true }) + photosField() + '</div></fieldset>' +
        '<div class="hp" aria-hidden="true"><label>' + t('f.hp') + '<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="consents">' + consentFields() + '</div>' + '<p class="form-msg" data-form-msg role="alert" hidden></p>' +
        '<button class="btn btn-o btn-lg qform-send" type="submit" data-magnetic><span>' + t('f.send') + '</span></button>' +
        '</form></div><aside class="quote-aside"><div class="qsum" data-qsum>' + summaryHTML() + '</div></aside></div></section>' + commitments(true);
    },
    mount: function (root) {
      var list = $('[data-qlist]', root);
      if (list) {
        list.addEventListener('click', function (e) {
          var b = e.target.closest('[data-step]');
          if (b) {
            var li = b.closest('[data-line]'), line = S.cart.filter(function (x) { return x.id === li.getAttribute('data-line'); })[0];
            var inp = $('input', li);
            line.qty = Math.max(1, Math.min(999, line.qty + Number(b.getAttribute('data-step'))));
            inp.value = line.qty; saveCart(); refreshSummary(root); if (window.Motion) Motion.pop(inp);
          }
          var rm = e.target.closest('[data-rm]');
          if (rm) {
            var id = rm.getAttribute('data-rm'), row = rm.closest('[data-line]');
            var removed = S.cart.filter(function (x) { return x.id === id; })[0], at = S.cart.indexOf(removed);
            S.cart = S.cart.filter(function (x) { return x.id !== id; }); saveCart();
            var after = function () {
              row.remove(); refreshSummary(root); plateRemoved(root, id);
              if (!S.cart.length) rerender();
            };
            if (window.Motion) Motion.collapse(row, after); else after();
            toast(t('tt.removed'), { label: S.lang === 'fr' ? 'Annuler' : 'Undo', onClick: function () { S.cart.splice(at, 0, removed); saveCart(); rerender(); } });
          }
        });
        list.addEventListener('change', function (e) {
          var inp = e.target.closest('input'); if (!inp) return;
          var li = inp.closest('[data-line]'), line = S.cart.filter(function (x) { return x.id === li.getAttribute('data-line'); })[0];
          line.qty = Math.max(1, Math.min(999, parseInt(inp.value, 10) || 1)); inp.value = line.qty; saveCart(); refreshSummary(root);
        });
      }
      mountForm(root, 'quote');
      mountPlates(root);
    }
  };
  function refreshSummary(root) { var s = $('[data-qsum]', root); if (s) s.innerHTML = summaryHTML(); }
  function rerender() { var r = parseHash(); render(r); if (window.Motion) Motion.enter($('#main'), r.route, {}); }

  /* Photo de téléphone (4 à 8 Mo) réduite avant l'envoi : côté le plus long 2000 px, JPEG. */
  function shrinkPhoto(f) {
    return new Promise(function (res) {
      var file = f.file;
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || !window.HTMLCanvasElement) { res(file); return; }
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 2000 / Math.max(w, h));
        if (k === 1 && file.size < 1.5e6) { res(file); return; }
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (!b) { res(file); return; }
          try { res(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })); } catch (e) { b.name = file.name; res(b); }
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { res(file); };
      img.src = f.url;
    });
  }
  /* Envoi à l'API. Sans serveur PHP (maquette statique), la demande est simulée comme avant. */
  function sendRequest(kind, data, files, t0) {
    data.delete('photos');
    data.set('kind', kind); data.set('lang', S.lang); data.set('t', String(Date.now() - t0));
    if (kind === 'quote') data.set('items', JSON.stringify(S.cart.map(function (i) {
      if (i.custom) return { custom: true, type: i.type, dims: i.dims, qty: i.qty };
      var o = { id: i.id, qty: i.qty, label: lineLabel(i) };
      if (needsPlate(i)) { o.plate = String(i.plate || '').trim(); o.plate_unknown = !!i.plateUnknown; }
      return o;
    })));
    var demo = function () { return { ok: true, demo: true }; };
    return Promise.all(files.map(shrinkPhoto)).then(function (list) {
      list.forEach(function (f) { data.append('photos[]', f, f.name || 'photo.jpg'); });
      return fetch(API + 'request.php', { method: 'POST', body: data, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    }).then(function (r) {
      if (VT.source !== 'api' && [404, 405, 501].indexOf(r.status) > -1) return demo();
      return r.json().catch(function () { return { ok: false, error: 'server' }; }).then(function (j) {
        if (r.ok && j.ok) return j;
        var err = new Error(j.error || 'server'); err.info = j; throw err;
      });
    }, function (netErr) {
      if (VT.source !== 'api') return demo();
      throw netErr;
    });
  }

  function mountForm(root, kind) {
    var form = $('[data-form]', root); if (!form) return;
    var files = [], t0 = Date.now();
    var drop = $('[data-drop]', form), thumbs = $('[data-thumbs]', form);
    function showThumbs() {
      thumbs.innerHTML = files.map(function (f, i) { return '<span class="thumb"><img src="' + f.url + '" alt=""><button type="button" data-unthumb="' + i + '" aria-label="' + t('q.remove') + '">×</button></span>'; }).join('');
      if (window.Motion) Motion.stagger($$('.thumb', thumbs));
    }
    if (drop) {
      var input = $('input[type="file"]', drop);
      var addFiles = function (list) {
        Array.prototype.forEach.call(list, function (f) { if (/^image\//.test(f.type) && files.length < 8) files.push({ name: f.name, url: URL.createObjectURL(f), file: f }); });
        showThumbs();
      };
      input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
      drop.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
      thumbs.addEventListener('click', function (e) { var b = e.target.closest('[data-unthumb]'); if (b) { files.splice(+b.getAttribute('data-unthumb'), 1); showThumbs(); } });
    }
    $$('input, textarea, select', form).forEach(function (el) {
      el.addEventListener('input', function () { clearErr(el); });
      el.addEventListener('change', function () { clearErr(el); });
    });
    function clearErr(el) { var w = el.closest('.ff, .check'); if (w) { w.classList.remove('is-err'); var e = $('.ff-err', w); if (e) e.textContent = ''; } }
    function setErr(el, msg) { var w = el.closest('.ff, .check'); if (!w) return; w.classList.add('is-err'); $('.ff-err', w).textContent = msg; }
    function formMsg(msg) {
      $$('[data-form-msg]', root).forEach(function (p) { p.innerHTML = msg || ''; p.hidden = !msg; });
      var first = $$('[data-form-msg]', root).filter(function (p) { return !p.hidden && p.offsetParent; })[0];
      if (msg && first) { if (window.Motion) Motion.scrollTo(first, -160); else first.scrollIntoView({ block: 'center' }); }
    }
    function focusBad(bad) {
      if (window.Motion) bad.forEach(function (el) { Motion.shake(el.closest('.ff, .check')); });
      bad[0].focus({ preventScroll: true }); if (window.Motion) Motion.scrollTo(bad[0].closest('.ff, .check'), -140); else bad[0].scrollIntoView({ block: 'center' });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formMsg('');
      var bad = [];
      $$('[required]', form).forEach(function (el) {
        var msg = '';
        if (el.type === 'checkbox') { if (!el.checked) msg = t('f.mustCheck'); }
        else if (!el.value.trim()) msg = t('f.required');
        else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) msg = t('f.invalidEmail');
        if (msg) { bad.push(el); setErr(el, msg); }
      });
      if (bad.length) { focusBad(bad); return; }
      var data = new FormData(form);
      var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
      var req = {
        kind: kind, num: 'VT-' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        name: String(data.get('name') || '').trim().split(' ')[0], email: String(data.get('email') || '').trim(), lang: S.lang,
        items: kind === 'quote' ? S.cart.map(function (i) { return { label: lineLabel(i) + (needsPlate(i) ? ' · ' + t('q.plateLabel') + ' ' + plateText(i) : ''), qty: i.qty }; }) : [],
        photos: files.length, at: d.toISOString()
      };
      if (data.get('website')) { done(); return; } // anti-spam : envoi ignoré
      var btns = $$('button[type="submit"], button[form]', root);
      var labels = btns.map(function (b) { var s = $('span', b); return s ? s.textContent : ''; });
      var busy = function (on) {
        btns.forEach(function (b, i) { b.disabled = on; b.classList.toggle('is-busy', on); var s = $('span', b); if (s) s.textContent = on ? t('f.sending') : labels[i]; });
      };
      busy(true);
      sendRequest(kind, data, files, t0).then(function (res) {
        if (res.num) req.num = res.num;
        req.sent = !res.demo;
        done();
      }).catch(function (err) {
        busy(false);
        var info = err.info || {}, phone = '<a href="tel:' + VT.config.phoneHref + '">' + VT.config.phone + '</a>';
        if (info.error === 'validation' && info.fields) {
          var codes = { required: t('f.required'), email: t('f.invalidEmail'), check: t('f.mustCheck') }, list = [];
          Object.keys(info.fields).forEach(function (k) { var el = form.elements[k]; if (el && el.closest) { setErr(el, codes[info.fields[k]] || t('f.required')); list.push(el); } });
          if (list.length) { focusBad(list); return; }
          formMsg(t('f.errFields'));
          return;
        }
        formMsg(info.error === 'rate' ? t('f.errRate', { phone: phone }) : info.error === 'too_large' ? t('f.errSize') : t('f.err', { phone: phone }));
      });
      function done() {
        session.set('vt.last', req);
        if (kind === 'quote') { S.cart = []; saveCart(); }
        location.hash = href('confirmation');
      }
    });
  }

  V.confirmation = {
    html: function () {
      var r = session.get('vt.last');
      var text = r ? (r.kind === 'info' ? t('ok.infoText', { num: r.num }) : t('ok.text', { num: r.num, email: esc(r.email) })) : '';
      if (r && r.kind !== 'info' && r.lang === 'en' && S.lang === 'fr') text = text.replace('en français', 'en anglais');
      return '<section class="ok"><div class="wrap ok-in">' + stepsBar(3) +
        '<div class="ok-mark" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="ok-c" cx="60" cy="60" r="52" pathLength="1"/><path class="ok-p" d="M38 62l15 15 30-34" pathLength="1"/></svg>' +
        '<span class="ok-burst">' + new Array(12).join('<i></i>') + '<i></i></span></div>' +
        '<p class="eyebrow">' + (r ? r.num : '') + '</p><h1 class="pg-title" data-split>' + t('ok.title') + '</h1>' +
        (r ? '<p class="pg-lead" data-reveal>' + t('ok.thanks', { name: esc(r.name) }) + ' ' + text + '</p>' : '') +
        (r && r.items.length ? '<ul class="ok-list" data-reveal="stagger">' + r.items.map(function (i) { return '<li><span>' + esc(i.label) + '</span><b class="mono">× ' + i.qty + '</b></li>'; }).join('') + '</ul>' : '') +
        '<div class="btn-row" data-reveal><a class="btn btn-o" href="' + href('home') + '"><span>' + t('ok.home') + '</span></a><a class="btn btn-line" href="' + href('chenilles') + '"><span>' + t('ok.more') + '</span></a></div>' +
        (r && r.sent ? '' : '<p class="mono-note" data-reveal="fade">' + t('ok.proto') + '</p>') + '</div></section>';
    }
  };

  V.contact = {
    html: function (r) {
      var q = r.query, m = M[q.model];
      var dims = [];
      if (q.type) dims.push(t('ty.' + (q.type === 'patins' ? 'patins' : q.type)));
      if (q.w) dims.push(t('qs.width') + ' ' + q.w); if (q.p) dims.push(t('qs.pitch') + ' ' + q.p); if (q.l) dims.push(t('qs.links') + ' ' + q.l);
      if (q.q) dims.push('« ' + q.q + ' »');
      var pref = dims.length || m || q.brand;
      return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.contact')]]) + '<h1 class="pg-title" data-split>' + t('ct.title') + '</h1>' +
        '<p class="pg-lead" data-reveal>' + t('ct.sub') + '</p></div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec sec-tight"><div class="wrap contact-grid">' +
        '<aside class="contact-side" data-reveal="stagger">' +
        '<a class="contact-card contact-phone" href="tel:' + VT.config.phoneHref + '"><span class="mini-t">' + t('ct.phone') + '</span><b class="mono">' + VT.config.phone + '</b></a>' +
        '<a class="contact-card" href="mailto:' + VT.config.email + '"><span class="mini-t">' + t('ct.email') + '</span><b class="mono">' + VT.config.email + '</b></a>' +
        '<div class="contact-card"><span class="mini-t">' + t('ct.hours') + '</span><span>' + t('ct.hoursV') + '</span></div>' +
        '<div class="contact-card"><span class="mini-t">' + t('ct.address') + '</span><span>' + t('ct.addressV') + '</span></div></aside>' +
        '<form class="qform" data-form="info" novalidate>' +
        (pref ? '<p class="prefill mono" data-reveal="fade">' + t('ct.prefilled') + '</p>' : '') +
        '<div class="ff-grid" data-reveal>' +
        field('company', t('f.company'), { auto: 'organization' }) + field('name', t('f.name'), { req: true, auto: 'name' }) +
        field('email', t('f.email'), { req: true, type: 'email', auto: 'email' }) + field('phone', t('f.phone'), { req: true, type: 'tel', auto: 'tel' }) +
        field('brand', t('f.brand'), { select: brandSelect(m ? m.brand : q.brand) }) + field('model', t('f.model'), { value: m ? m.model : '' }) +
        field('dims', t('f.dims'), { wide: true, value: dims.join(' · ') }) + photosField() +
        field('message', t('f.message'), { textarea: true, wide: true }) + '</div>' +
        '<div class="hp" aria-hidden="true"><label>' + t('f.hp') + '<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="consents" data-reveal><label class="check check-l"><input type="checkbox" name="rgpd" required><span class="check-box" aria-hidden="true"></span><span>' + t('f.rgpd', { legal: href('legal') }) + '</span><span class="ff-err" aria-live="polite"></span></label></div>' +
        '<p class="form-msg" data-form-msg role="alert" hidden></p>' +
        '<button class="btn btn-o btn-lg" type="submit" data-reveal data-magnetic><span>' + t('ct.send') + '</span></button></form>' +
        '</div></section>';
    },
    mount: function (root) { mountForm(root, 'info'); }
  };

  V.about = {
    html: function () {
      var a = C().about;
      return '<section class="pg-hero cat-hero"><div class="pg-hero-media" aria-hidden="true"><img src="' + siteImg('about', 'matiere.jpg') + '" alt="" data-parallax="0.12"></div><div class="wrap">' + crumbs([[t('r.about')]]) +
        '<h1 class="pg-title" data-split>' + a.title + '</h1><p class="pg-lead" data-reveal>' + a.lead + '</p></div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec"><div class="wrap about-grid">' + a.blocks.map(function (b, i) {
          return '<div class="about-b" data-reveal><span class="mono about-n">0' + (i + 1) + '</span><h2 class="h3">' + b[0] + '</h2><p>' + b[1] + '</p></div>';
        }).join('') + '</div></section>' +
        '<section class="sec sec-dark"><div class="wrap"><div class="values" data-reveal="stagger">' + a.values.map(function (v) {
          return '<div class="value"><h3 class="h3">' + v[0] + '</h3><p>' + v[1] + '</p></div>';
        }).join('') + '</div><div class="sisters" data-reveal><span class="mini-t">' + t('ft.sister') + '</span><b>V-Track</b><b>V-Tilt <small>' + t('ft.soon') + '</small></b><b>V-Drill <small>' + t('ft.soon') + '</small></b></div></div></section>' +
        commitments(false) + ctaBlock();
    }
  };

  V.conseils = {
    html: function () {
      var g = C().guide, faq = C().faq;
      return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.conseils')]]) + '<h1 class="pg-title" data-split>' + t('r.conseils') + '</h1></div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec sec-tight"><div class="wrap"><div class="sec-head">' + eyebrow(t('r.identifier')) + '<h2 class="h2" data-split>' + g.title + '</h2></div>' +
        '<div class="guides" data-reveal="stagger">' + GUIDE_TABS.map(function (k, i) {
          return '<a class="guide-card" href="' + href('identifier', k) + '"><span class="mono">0' + i + '</span><b>' + g.tabs[k].label + '</b><span>' + g.tabs[k].lead + '</span><i aria-hidden="true">→</i></a>';
        }).join('') + '</div></div></section>' +
        '<section class="sec"><div class="wrap faq-wrap"><div class="sec-head">' + eyebrow('FAQ') + '<h2 class="h2" data-split>' + (S.lang === 'fr' ? 'Questions fréquentes' : 'Frequently asked questions') + '</h2></div>' +
        '<div class="faq" data-reveal="stagger">' + faq.map(function (f) {
          return '<details class="faq-i"><summary><span>' + f[0] + '</span><i aria-hidden="true"></i></summary><div class="faq-a"><p>' + f[1] + '</p></div></details>';
        }).join('') + '</div></div></section>' + ctaBlock();
    },
    mount: function (root) {
      $$('details.faq-i', root).forEach(function (d) {
        var s = $('summary', d), a = $('.faq-a', d);
        s.addEventListener('click', function (e) { if (window.Motion) { e.preventDefault(); Motion.accordion(d, a); } });
      });
      setLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: C().faq.map(function (f) { return { '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } }; }) });
    }
  };

  V.legal = {
    html: function () {
      return '<section class="pg-hero pg-hero-s"><div class="wrap">' + crumbs([[t('r.legal')]]) + '<h1 class="pg-title" data-split>' + t('r.legal') + '</h1></div><i class="pg-line" aria-hidden="true"></i></section>' +
        '<section class="sec sec-tight"><div class="wrap legal">' + C().legal.map(function (l, i) {
          return '<section class="legal-b" data-reveal><span class="mono">0' + (i + 1) + '</span><h2 class="h3">' + l[0] + '</h2><p>' + l[1] + '</p></section>';
        }).join('') + '</div></section>';
    }
  };

  V['404'] = {
    html: function () {
      return '<section class="ok"><div class="wrap ok-in"><div class="noresult-ic big" aria-hidden="true">' + gearIcon() + '</div><p class="eyebrow">404</p>' +
        '<h1 class="pg-title" data-split>' + t('r.404') + '</h1><p class="pg-lead" data-reveal>' + t('nf.text') + '</p>' +
        '<div class="btn-row" data-reveal><a class="btn btn-o" href="' + href('home') + '"><span>' + t('nf.back') + '</span></a></div></div></section>';
    }
  };

  function gearIcon() {
    return '<svg viewBox="61 136 322 322"><path class="gi-g" fill-rule="evenodd" d="' + (window.VT_LOGO ? VT_LOGO.gearFull : '') + '"/><path class="gi-v" d="M190 246h30l12 60 12-60h30l-27 92h-30z"/></svg>';
  }
  function logoSVG(variant) {
    var L = window.VT_LOGO; if (!L) return 'V-TRACK';
    if (variant === 'icon') {
      return '<svg viewBox="61 136 322 322" aria-hidden="true"><path class="pl-gear pt-gear lg-gfull" fill-rule="evenodd" d="' + L.gearFull + '"/><path class="pl-vi lg-vi" d="M190 246h30l12 60 12-60h30l-27 92h-30z"/></svg>';
    }
    return '<svg class="vt-logo" viewBox="60 136 720 322" role="img" aria-label="V-Track">' +
      '<path class="lg-gear" d="' + L.gearOpen + '"/><path class="lg-belt" d="' + L.beltTop + '"/><path class="lg-belt" d="' + L.beltBot + '"/>' +
      '<text class="lg-v" x="188" y="338" textLength="82" lengthAdjust="spacingAndGlyphs">V</text>' +
      '<text class="lg-t" x="308" y="338" textLength="456" lengthAdjust="spacingAndGlyphs">TRACK</text></svg>';
  }

  /* ------------------------------------------------------------ recherche en-tête */
  function mountHeaderSearch() {
    var so = $('[data-so]'), input = $('[data-so-input]'), out = $('[data-so-results]'), form = $('[data-so-form]');
    var sel = -1;
    function open() {
      so.hidden = false; document.documentElement.classList.add('is-locked');
      if (window.Motion) Motion.searchIn(so); setTimeout(function () { input.focus(); }, 60);
      renderSug();
    }
    function close() {
      if (so.hidden) return;
      document.documentElement.classList.remove('is-locked');
      if (window.Motion) Motion.searchOut(so, function () { so.hidden = true; }); else so.hidden = true;
    }
    function renderSug() {
      var q = input.value.trim();
      if (!q) {
        out.innerHTML = '<p class="so-try"><span class="mini-t">' + t('so.try') + '</span>' + ['KX057', 'kx 57', '400x72.5x74', '400 72,5 74', 'TB260', '400HD', 'Takeuchy'].map(function (s) { return '<button type="button" class="chip" data-try="' + s + '">' + s + '</button>'; }).join('') + '</p>';
        return;
      }
      var ms = searchMachines(q), ps = searchText(q).slice(0, 6);
      if (!ms.length && !ps.length) {
        out.innerHTML = '<p class="so-none">' + t('so.none') + ' <a class="link-o" href="' + href('contact', null, { q: q }) + '">' + t('qs.contact') + ' →</a></p>'; return;
      }
      out.innerHTML = '<ul class="so-list" role="listbox">' +
        ms.map(function (m) { return '<li><a role="option" class="so-it so-m" href="' + href('search', null, { brand: m.brand, model: m.id }) + '"><span class="so-ic mono">' + m.brand.slice(0, 2).toUpperCase() + '</span><span><b>' + m.brand + ' ' + m.model + '</b><small>' + t('e.' + m.type) + ' · ' + num(m.t) + ' t · ' + t('s.machine').toLowerCase() + '</small></span><i aria-hidden="true">→</i></a></li>'; }).join('') +
        ps.map(function (p) { return '<li><a role="option" class="so-it" href="' + href('product', p.id) + '"><span class="so-th">' + pimg(p) + '</span><span><b>' + pname(p) + '</b><small class="mono">' + esc(p.ref) + ' · ' + (p.stock ? t('b.stock') : t('p.price')) + '</small></span><i aria-hidden="true">→</i></a></li>'; }).join('') +
        '</ul><a class="so-all link-o" href="' + href('search', null, { q: q }) + '">' + t('so.all') + ' →</a>';
      sel = -1;
      if (window.Motion) Motion.stagger($$('.so-it', out), 0.03);
    }
    $$('[data-open-search]').forEach(function (b) { b.addEventListener('click', open); });
    $$('[data-close-search]').forEach(function (b) { b.addEventListener('click', close); });
    input.addEventListener('input', renderSug);
    out.addEventListener('click', function (e) {
      var tr = e.target.closest('[data-try]'); if (tr) { input.value = tr.getAttribute('data-try'); renderSug(); input.focus(); return; }
      if (e.target.closest('a')) close();
    });
    input.addEventListener('keydown', function (e) {
      var items = $$('.so-it', out);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!items.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.classList.toggle('is-sel', i === sel); });
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var items = $$('.so-it', out);
      if (sel > -1 && items[sel]) { location.hash = items[sel].getAttribute('href'); close(); return; }
      if (input.value.trim()) { location.hash = href('search', null, { q: input.value.trim() }); close(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); closeMenu(); }
      if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement || {}).tagName)) { e.preventDefault(); open(); }
    });
    window.addEventListener('hashchange', close);
  }

  /* ------------------------------------------------------------ menu mobile */
  function openMenu() {
    var m = $('[data-mnav]'), b = $('[data-burger]');
    m.hidden = false; b.setAttribute('aria-expanded', 'true'); document.documentElement.classList.add('is-locked', 'menu-open');
    if (window.Motion) Motion.menuIn(m);
  }
  function closeMenu() {
    var m = $('[data-mnav]'), b = $('[data-burger]'); if (!m || m.hidden) return;
    b.setAttribute('aria-expanded', 'false'); document.documentElement.classList.remove('is-locked', 'menu-open');
    if (window.Motion) Motion.menuOut(m, function () { m.hidden = true; }); else m.hidden = true;
  }

  /* ------------------------------------------------------------ rendu */
  function applyStatic() {
    document.documentElement.lang = S.lang;
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    $$('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $$('[data-link]').forEach(function (el) {
      var parts = el.getAttribute('data-link').split(':'); el.setAttribute('href', href(parts[0], parts[1] || null));
    });
    $$('[data-phone]').forEach(function (el) { el.setAttribute('href', 'tel:' + VT.config.phoneHref); var s = $('[data-phone-t]', el); if (s) s.textContent = VT.config.phone; });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === S.lang)); });
  }
  function setLd(obj) {
    var el = $('#ld-page');
    if (!obj) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-page'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(obj);
  }
  function routeLabel(r) {
    if (r.route === 'product' && P[r.param]) return pname(P[r.param]);
    return t('r.' + r.route);
  }
  function render(r) {
    S.route = r;
    applyStatic();
    setLd(null);
    var view = V[r.route] || V['404'];
    var main = $('#main');
    main.innerHTML = view.html(r);
    main.setAttribute('data-route', r.route);
    document.body.setAttribute('data-route', r.route);
    document.title = r.route === 'home' ? t('meta.title') : routeLabel(r) + ' · V-Track';
    var md = $('meta[name="description"]'); if (md) md.setAttribute('content', t('meta.desc'));
    ['fr', 'en'].forEach(function (L) { var l = $('link[hreflang="' + L + '"]'); if (l) l.setAttribute('href', href(r.route, r.param, r.query, L)); });
    $$('.nav-a').forEach(function (a) {
      var id = a.getAttribute('data-link').split(':')[0];
      var on = id === r.route || (r.route === 'product' && P[r.param] && (FAMILY[P[r.param].type] === (id === 'chenilles' ? 'chenille' : id)));
      a.classList.toggle('is-on', !!on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (view.mount) view.mount(main, r);
    updateCount(false);
  }

  var busy = false, queued = false;
  function onRoute() {
    var r = parseHash();
    if (!r.lang) {
      S.lang = store.get('vt.lang', null) || ((navigator.language || '').slice(0, 2) === 'en' ? 'en' : 'fr');
      location.replace(href(r.route === '404' && location.hash.length > 2 ? '404' : (r.route === '404' ? 'home' : r.route), r.param, r.query));
      return;
    }
    if (busy) { queued = true; return; }
    busy = true;
    var first = S.first; S.first = false;
    closeMenu();
    S.lang = r.lang; store.set('vt.lang', S.lang);
    var go = function () {
      render(r);
      var finish = function () { busy = false; if (queued) { queued = false; onRoute(); } };
      if (window.Motion) {
        Motion.enter($('#main'), r.route, { first: first }).then(finish);
      } else { window.scrollTo(0, 0); finish(); }
    };
    if (!first && window.Motion) Motion.leave(routeLabel(r)).then(go);
    else go();
  }

  /* ------------------------------------------------------------ démarrage */
  function init() {
    document.documentElement.classList.add('js');
    $$('[data-logo]').forEach(function (el) { el.innerHTML = logoSVG(el.getAttribute('data-logo')); });
    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      if (add) {
        var q = 1;
        if (add.hasAttribute('data-add-qty')) { var qi = $('[data-qty] input', add.closest('.pr-info') || document); q = parseInt(qi && qi.value, 10) || 1; }
        var card = add.closest('.pcard'), src = card ? $('.pcard-media img', card) : $('.pr-photo img');
        addToCart(add.getAttribute('data-add'), q, src || add);
        return;
      }
      var lg = e.target.closest('[data-lang]');
      if (lg) {
        var L = lg.getAttribute('data-lang'); if (L === S.lang) return;
        var r = S.route || parseHash();
        location.hash = href(r.route, r.param, r.query, L);
        return;
      }
      if (e.target.closest('[data-burger]')) { var m = $('[data-mnav]'); if (m.hidden) openMenu(); else closeMenu(); return; }
      var ck = e.target.closest('[data-ck]');
      if (ck) { store.set('vt.cookies', ck.getAttribute('data-ck')); var bn = $('[data-cookies]'); if (window.Motion) Motion.cookiesOut(bn); else bn.hidden = true; return; }
      if (e.target.closest('[data-top]')) { e.preventDefault(); if (window.Motion) Motion.scrollTo(0); else window.scrollTo(0, 0); return; }
      var skip = e.target.closest('[data-skip]');
      if (skip) { e.preventDefault(); var mn = $('#main'); mn.setAttribute('tabindex', '-1'); mn.focus(); }
    });
    mountHeaderSearch();
    if (window.Motion) Motion.init();
    // Catalogue à jour depuis le back-office (pendant le préchargement), sinon celui de data.js
    loadCatalog().then(function () {
      window.addEventListener('hashchange', onRoute);
      onRoute();
    });
    if (!store.get('vt.cookies', null)) {
      var bn = $('[data-cookies]'); setTimeout(function () { bn.hidden = false; if (window.Motion) Motion.cookiesIn(bn); }, 2600);
    }
    // Langue du navigateur : proposition, jamais de redirection forcée
    if (!store.get('vt.langAsked', false) && S.lang === 'fr' && /^en/i.test(navigator.language || '')) {
      store.set('vt.langAsked', true);
      setTimeout(function () {
        toast(VT.i18n.en['tb.brand'].replace(/<[^>]+>/g, '') + ' — English version available.', { label: 'English', sticky: true, onClick: function () { var r = S.route; location.hash = href(r.route, r.param, r.query, 'en'); } });
      }, 3400);
    }
  }

  window.VTApp = { t: t, href: href, S: S, M: M, P: P, searchText: searchText };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
