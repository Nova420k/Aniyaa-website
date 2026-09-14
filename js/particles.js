/* Aniyaa particle field — complex 2D physics for the hero.
 * Forces per particle: curl-ish drift field + weak center pull + mouse
 * gravity well + click shockwaves + short-range repulsion + link springs.
 * Rendered as additive glow sprites + constellation links. Zero deps.
 * Respects prefers-reduced-motion, pauses off-screen / hidden tab.
 */
(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  // Pre-rendered glow sprites per hue bucket (fast drawImage, no shadowBlur).
  var spriteCache = {};
  function glowSprite(hue, sat, light) {
    var key = hue + "|" + sat + "|" + light;
    if (spriteCache[key]) return spriteCache[key];
    var s = 64;
    var c = document.createElement("canvas");
    c.width = s; c.height = s;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "hsla(" + hue + "," + sat + "%," + light + "%,1)");
    grad.addColorStop(0.25, "hsla(" + hue + "," + sat + "%," + light + "%,.85)");
    grad.addColorStop(0.55, "hsla(" + hue + "," + sat + "%," + light + "%,.28)");
    grad.addColorStop(1, "hsla(" + hue + "," + sat + "%," + light + "%,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    spriteCache[key] = c;
    return c;
  }

  function makeField(hero, canvas) {
    var ctx = canvas.getContext("2d", { alpha: true });
    var W = 0, H = 0, DPR = 1;
    var parts = [];
    var waves = []; // shockwave rings {x,y,r,alpha}
    var mouse = { x: -9999, y: -9999, down: false, inHero: false };
    var raf = 0, running = false, visible = true;
    var t0 = performance.now();
    var theme = currentTheme();

    function palette() {
      // [hue, sat, light] buckets, theme-aware
      if (theme === "dark") {
        return [
          [262, 90, 72], [288, 85, 68], [330, 90, 70],
          [205, 90, 68], [265, 70, 80]
        ];
      }
      return [
        [258, 85, 58], [282, 80, 55], [335, 80, 60],
        [210, 85, 55], [20, 90, 62]
      ];
    }

    function targetCount() {
      var area = Math.max(1, W * H);
      var n = Math.round(area / 15000);
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      var small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) < 700;
      if (coarse || small) n = Math.min(n, 42);
      n = Math.max(28, Math.min(n, 115));
      // Low-memory guard
      if (navigator.deviceMemory && navigator.deviceMemory <= 3) n = Math.min(n, 55);
      return n;
    }

    function resize() {
      var rect = hero.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 1.75);
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed(targetCount());
    }

    function seed(n) {
      var pal = palette();
      // Preserve existing particles where possible (no pop on resize/theme).
      if (parts.length > n) parts.length = n;
      while (parts.length < n) {
        var bucket = pal[(Math.random() * pal.length) | 0];
        parts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          r: 1.1 + Math.random() * 2.6,
          depth: 0.45 + Math.random() * 0.55, // parallax depth
          hue: bucket[0] + (Math.random() * 14 - 7),
          sat: bucket[1], light: bucket[2],
          tw: Math.random() * Math.PI * 2, // twinkle phase
          tws: 0.008 + Math.random() * 0.02
        });
      }
      parts.forEach(function (p) {
        p.x = Math.min(Math.max(p.x, 0), W);
        p.y = Math.min(Math.max(p.y, 0), H);
      });
    }

    function burst(x, y, power) {
      var n = 10 + ((Math.random() * 8) | 0);
      var pal = palette();
      for (var i = 0; i < n; i++) {
        if (parts.length > 150) break;
        var a = Math.random() * Math.PI * 2;
        var sp = (1.2 + Math.random() * 3.2) * (power || 1);
        var bucket = pal[(Math.random() * pal.length) | 0];
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: 1.2 + Math.random() * 2.4,
          depth: 0.6 + Math.random() * 0.4,
          hue: bucket[0], sat: bucket[1], light: bucket[2],
          tw: Math.random() * 6.28, tws: 0.02
        });
      }
      waves.push({ x: x, y: y, r: 6, alpha: 0.55 });
      if (waves.length > 6) waves.shift();
      // Trim back to target over time via natural fade below.
    }

    function step(now) {
      if (!running) return;
      var dt = Math.min(50, now - (step._last || now)) || 16.6;
      step._last = now;
      var k = dt / 16.6; // frame-normalized
      var t = (now - t0) * 0.001;
      var LINK = 132, LINK2 = LINK * LINK;
      var MR = 190; // mouse well radius

      ctx.clearRect(0, 0, W, H);

      // --- physics ---
      var cx = W * 0.5, cy = H * 0.42;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        // curl-ish drift field
        var ax = Math.sin(p.y * 0.004 + t * 0.7) * 0.012 + Math.cos(p.y * 0.0013 - t * 0.4) * 0.006;
        var ay = Math.cos(p.x * 0.0035 - t * 0.6) * 0.012 + Math.sin(p.x * 0.0011 + t * 0.35) * 0.006;
        // weak center pull (orbit feel)
        ax += (cx - p.x) * 0.000012;
        ay += (cy - p.y) * 0.000012;

        // mouse gravity well: gentle attract, strong repel while pressed
        if (mouse.inHero) {
          var mdx = mouse.x - p.x, mdy = mouse.y - p.y;
          var md2 = mdx * mdx + mdy * mdy;
          if (md2 < MR * MR && md2 > 4) {
            var md = Math.sqrt(md2);
            var fall = 1 - md / MR; // 0..1
            var dir = mouse.down ? -1 : 1;
            var f = dir * fall * fall * 0.09 * p.depth;
            ax += (mdx / md) * f;
            ay += (mdy / md) * f;
          }
        }

        p.vx += ax * k; p.vy += ay * k;
        // damping + speed clamp (depth-scaled)
        p.vx *= 0.994; p.vy *= 0.994;
        var sp = Math.hypot(p.vx, p.vy);
        var max = 1.6 * p.depth + 0.4;
        if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }

        p.x += p.vx * k; p.y += p.vy * k;
        p.tw += p.tws * k;

        // soft-bounce walls
        if (p.x < -12) { p.x = -12; p.vx = Math.abs(p.vx) * 0.9; }
        else if (p.x > W + 12) { p.x = W + 12; p.vx = -Math.abs(p.vx) * 0.9; }
        if (p.y < -12) { p.y = -12; p.vy = Math.abs(p.vy) * 0.9; }
        else if (p.y > H + 12) { p.y = H + 12; p.vy = -Math.abs(p.vy) * 0.9; }
      }

      // short-range pairwise repulsion (keeps field organic, capped pairs)
      for (var a = 0; a < parts.length; a++) {
        var pa = parts[a];
        for (var b = a + 1; b < parts.length; b++) {
          var pb = parts[b];
          var dx = pb.x - pa.x, dy = pb.y - pa.y;
          if (dx > 46 || dx < -46 || dy > 46 || dy < -46) continue;
          var d2 = dx * dx + dy * dy;
          if (d2 > 0.01 && d2 < 2025) { // <45px
            var d = Math.sqrt(d2);
            var push = ((45 - d) / 45) * 0.02;
            var nx = dx / d, ny = dy / d;
            pa.vx -= nx * push; pa.vy -= ny * push;
            pb.vx += nx * push; pb.vy += ny * push;
          }
        }
      }

      // --- render links ---
      ctx.lineWidth = 1;
      var linkAlpha = theme === "dark" ? 0.34 : 0.26;
      for (var m = 0; m < parts.length; m++) {
        var pm = parts[m];
        for (var n2 = m + 1; n2 < parts.length; n2++) {
          var pn = parts[n2];
          var ddx = pn.x - pm.x;
          if (ddx > LINK || ddx < -LINK) continue;
          var ddy = pn.y - pm.y;
          if (ddy > LINK || ddy < -LINK) continue;
          var dd2 = ddx * ddx + ddy * ddy;
          if (dd2 > LINK2) continue;
          var al = (1 - Math.sqrt(dd2) / LINK) * linkAlpha;
          ctx.strokeStyle = theme === "dark"
            ? "rgba(178,142,255," + al.toFixed(3) + ")"
            : "rgba(109,58,255," + al.toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(pm.x, pm.y);
          ctx.lineTo(pn.x, pn.y);
          ctx.stroke();
        }
      }

      // --- shockwave rings ---
      for (var w = waves.length - 1; w >= 0; w--) {
        var wave = waves[w];
        wave.r += 3.4 * k;
        wave.alpha *= Math.pow(0.94, k);
        if (wave.alpha < 0.02 || wave.r > 320) { waves.splice(w, 1); continue; }
        ctx.strokeStyle = theme === "dark"
          ? "rgba(240,171,252," + wave.alpha.toFixed(3) + ")"
          : "rgba(217,70,160," + wave.alpha.toFixed(3) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, 6.2832);
        ctx.stroke();
      }

      // --- particles (additive glow) ---
      ctx.globalCompositeOperation = theme === "dark" ? "lighter" : "source-over";
      for (var q = 0; q < parts.length; q++) {
        var pt = parts[q];
        var twinkle = 0.72 + 0.28 * Math.sin(pt.tw);
        var size = pt.r * 2 * 3.2 * twinkle;
        var spr = glowSprite(Math.round(pt.hue), pt.sat, pt.light);
        ctx.globalAlpha = (theme === "dark" ? 0.9 : 0.75) * twinkle;
        ctx.drawImage(spr, pt.x - size / 2, pt.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Trim burst overflow back toward target count.
      var target = targetCount();
      if (parts.length > target + 30) parts.splice(0, parts.length - (target + 30));

      raf = requestAnimationFrame(step);
    }

    function start() {
      if (running || !visible || document.hidden) return;
      running = true; step._last = 0;
      raf = requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function renderStatic() {
      // One calm frame for reduced-motion users.
      stop();
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = theme === "dark" ? 0.5 : 0.4;
      parts.forEach(function (p) {
        var spr = glowSprite(Math.round(p.hue), p.sat, p.light);
        var size = p.r * 2 * 3;
        ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
      });
      ctx.globalAlpha = 1;
    }

    // --- events ---
    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    hero.addEventListener("pointermove", function (e) {
      var l = toLocal(e);
      mouse.x = l.x; mouse.y = l.y; mouse.inHero = true;
    }, { passive: true });
    hero.addEventListener("pointerleave", function () {
      mouse.inHero = false; mouse.down = false;
      mouse.x = -9999; mouse.y = -9999;
    }, { passive: true });
    hero.addEventListener("pointerdown", function (e) {
      var l = toLocal(e);
      mouse.down = true;
      burst(l.x, l.y, 1);
    }, { passive: true });
    window.addEventListener("pointerup", function () { mouse.down = false; }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (!prefersReducedMotion()) start();
    });

    document.addEventListener("aniyaa:theme", function (e) {
      theme = e.detail === "dark" ? "dark" : "light";
      seed(parts.length); // recolor in place
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(function () { resize(); if (prefersReducedMotion()) renderStatic(); }).observe(hero);
    } else {
      window.addEventListener("resize", resize);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) { if (!prefersReducedMotion()) start(); }
        else stop();
      }, { threshold: 0.02 }).observe(hero);
    }

    resize();
    if (prefersReducedMotion()) renderStatic();
    else start();

    return { burst: burst, resize: resize };
  }

  function init() {
    var heroes = Array.prototype.slice.call(document.querySelectorAll(".hero"));
    if (!heroes.length) return;
    heroes.forEach(function (hero) {
      if (hero.hasAttribute("data-particles-off")) return;
      var cs = window.getComputedStyle(hero);
      if (cs.position === "static") hero.style.position = "relative";
      var canvas = hero.querySelector("canvas[data-particles]");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.setAttribute("data-particles", "");
        canvas.setAttribute("aria-hidden", "true");
        hero.insertBefore(canvas, hero.firstChild);
      }
      canvas.classList.add("particles");
      try { makeField(hero, canvas); } catch (err) { /* never break page */ }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
