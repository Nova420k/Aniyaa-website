/* Aniyaa FX — complex transitions: entrance choreography, 3D tilt,
 * magnetic buttons, scroll + pointer parallax, cursor glow, animated
 * tab swaps, and curtain page transitions. Zero deps.
 */
(function () {
  "use strict";

  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function coarsePointer() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }
  function rafThrottle(fn) {
    var tick = false;
    return function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () { tick = false; fn(); });
    };
  }

  /* ---------- 1. Entrance choreography ---------- */
  function entrance() {
    // Stagger hero copy children + art so first paint feels directed.
    var hero = qs(".hero");
    if (hero) {
      var items = qsa(".hero-grid > div:first-child > *", hero);
      items.forEach(function (el, i) {
        if (!el.style.getPropertyValue("--delay")) {
          el.style.setProperty("--delay", Math.min(480, i * 75) + "ms");
        }
        el.setAttribute("data-hero-item", "");
      });
      var art = qsa(".hero-art, .hero-art *", hero);
      art.forEach(function (el) { el.setAttribute("data-hero-art", ""); });
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add("is-in");
      });
    });
  }

  /* ---------- 2. 3D tilt + glare ---------- */
  function tilt() {
    if (reduced() || coarsePointer()) return;
    var els = qsa(".card, .device, .qr-card, .release-card, .stats-row");
    if (!("requestAnimationFrame" in window)) return;
    els.forEach(function (el) {
      if (el.hasAttribute("data-tilt-off")) return;
      // Device already floats; tilt it gently, cards a bit more.
      var max = el.classList.contains("device") ? 6 : 7;
      var cur = { rx: 0, ry: 0, tx: 0, ty: 0 };
      var raf = 0;
      el.classList.add("tilt");

      function render() {
        raf = 0;
        cur.rx += (cur.tx - cur.rx) * 0.14;
        cur.ry += (cur.ty - cur.ry) * 0.14;
        if (Math.abs(cur.tx - cur.rx) < 0.02 && Math.abs(cur.ty - cur.ry) < 0.02) {
          cur.rx = cur.tx; cur.ry = cur.ty;
        }
        el.style.transform =
          "perspective(900px) rotateX(" + cur.rx.toFixed(2) + "deg)" +
          " rotateY(" + cur.ry.toFixed(2) + "deg)" +
          (el.classList.contains("card") && cur.tx === 0 && cur.ty === 0 ? "" : " translateZ(0)");
        if (cur.tx !== 0 || cur.ty !== 0 || cur.rx !== 0 || cur.ry !== 0) {
          raf = requestAnimationFrame(render);
        } else {
          el.style.transform = "";
        }
      }
      function kick() { if (!raf) raf = requestAnimationFrame(render); }

      el.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / Math.max(1, r.width);
        var py = (e.clientY - r.top) / Math.max(1, r.height);
        cur.ty = (px - 0.5) * max * 2;
        cur.tx = (0.5 - py) * max * 2;
        el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        kick();
      }, { passive: true });
      el.addEventListener("pointerleave", function () {
        cur.tx = 0; cur.ty = 0;
        kick();
      }, { passive: true });
    });
  }

  /* ---------- 3. Magnetic buttons ---------- */
  function magnetic() {
    if (reduced() || coarsePointer()) return;
    var btns = qsa(".hero-actions .btn, .cta-inner .btn");
    btns.forEach(function (btn) {
      var x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      btn.classList.add("magnetic");
      function render() {
        raf = 0;
        x += (tx - x) * 0.18; y += (ty - y) * 0.18;
        if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) { x = tx; y = ty; }
        btn.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px";
        if (tx !== 0 || ty !== 0 || x !== 0 || y !== 0) raf = requestAnimationFrame(render);
        else btn.style.translate = "";
      }
      function kick() { if (!raf) raf = requestAnimationFrame(render); }
      btn.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        var dist = Math.hypot(dx, dy);
        var R = 90;
        if (dist < R) {
          var s = (1 - dist / R) * 10;
          tx = (dx / (dist || 1)) * s;
          ty = (dy / (dist || 1)) * s;
        } else { tx = 0; ty = 0; }
        kick();
      }, { passive: true });
      btn.addEventListener("pointerleave", function () {
        tx = 0; ty = 0; kick();
      }, { passive: true });
    });
  }

  /* ---------- 4. Scroll + pointer parallax ---------- */
  function parallax() {
    var hero = qs(".hero");
    if (!hero || reduced()) return;
    var layers = [
      { el: qs(".orb-a", hero), f: 0.10 },
      { el: qs(".orb-b", hero), f: -0.08 },
      { el: qs(".float-a", hero), f: -0.05 },
      { el: qs(".float-b", hero), f: 0.07 },
      { el: qs(".mascot", hero), f: 0.12 },
      { el: qs(".device", hero), f: 0.04 }
    ].filter(function (l) { return l.el; });

    var mx = 0, my = 0, tmx = 0, tmy = 0;
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      tmx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5);
      tmy = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5);
    }, { passive: true });
    hero.addEventListener("pointerleave", function () { tmx = 0; tmy = 0; }, { passive: true });

    var sy = 0;
    function onScroll() { sy = window.scrollY || 0; }
    window.addEventListener("scroll", rafThrottle(onScroll), { passive: true });
    onScroll();

    (function loop() {
      mx += (tmx - mx) * 0.06;
      my += (tmy - my) * 0.06;
      var heroTop = hero.offsetTop || 0;
      var rel = Math.max(-400, Math.min(800, sy - heroTop));
      layers.forEach(function (l) {
        var px = (mx * 26 * (l.f * 10)).toFixed(1);
        var py = ((my * 22 * (l.f * 10)) + rel * l.f * 0.35).toFixed(1);
        l.el.style.translate = px + "px " + py + "px";
      });
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- 5. Cursor glow ---------- */
  function cursorGlow() {
    if (reduced() || coarsePointer()) return;
    var hero = qs(".hero");
    if (!hero) return;
    var dot = document.createElement("div");
    dot.className = "hero-cursor";
    dot.setAttribute("aria-hidden", "true");
    hero.appendChild(dot);
    var x = 0, y = 0, tx = 0, ty = 0, s = 1, ts = 1, raf = 0;
    function render() {
      raf = 0;
      x += (tx - x) * 0.16; y += (ty - y) * 0.16; s += (ts - s) * 0.16;
      dot.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + s.toFixed(2) + ")";
      if (Math.abs(tx - x) > 0.2 || Math.abs(ty - y) > 0.2 || Math.abs(ts - s) > 0.01) {
        raf = requestAnimationFrame(render);
      }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(render); }
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      kick();
    }, { passive: true });
    qsa("a, button", hero).forEach(function (el) {
      el.addEventListener("pointerenter", function () { ts = 2.1; kick(); }, { passive: true });
      el.addEventListener("pointerleave", function () { ts = 1; kick(); }, { passive: true });
    });
  }

  /* ---------- 6. Animated tab swaps ---------- */
  function tabs() {
    var panels = qsa("[data-feature-panel]");
    if (!panels.length) return;
    panels.forEach(function (p) { p.classList.add("fx-panel"); });
    var obs = new MutationObserver(function () {
      panels.forEach(function (p) {
        if (p.classList.contains("is-active") && !p.hasAttribute("data-fx-in")) {
          p.setAttribute("data-fx-in", "");
          p.classList.remove("fx-enter");
          void p.offsetWidth; // restart animation
          p.classList.add("fx-enter");
          setTimeout(function () { p.removeAttribute("data-fx-in"); }, 500);
        }
      });
    });
    panels.forEach(function (p) {
      obs.observe(p, { attributes: true, attributeFilter: ["class", "hidden"] });
    });
  }

  /* ---------- 7. Subtle page transitions (no blocking overlay) ---------- */
  function curtain() {
    // Native cross-document transitions where supported (Chrome 126+):
    // CSS `@view-transition { navigation: auto }` handles the crossfade.
    // Here we only add a fast 160ms fade/rise/blur-out for browsers
    // without it. No overlay, no spinner, no long block.
    if (reduced()) return;
    var leaving = false;
    document.addEventListener("click", function (e) {
      if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || a.hasAttribute("download") || a.target === "_blank") return;
      var url;
      try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && (url.hash || url.search === location.search)) return; // same-page anchor
      if (url.href === location.href) return;
      // If the browser will do a native view transition, don't delay at all.
      if (document.startViewTransition) return;
      e.preventDefault();
      leaving = true;
      document.body.classList.add("is-leaving");
      setTimeout(function () { location.href = url.href; }, 170);
    });
  }

  function init() {
    entrance();
    tilt();
    magnetic();
    parallax();
    cursorGlow();
    tabs();
    curtain();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
