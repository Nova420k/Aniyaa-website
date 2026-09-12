(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ---------- Toast ---------- */
  function ensureToastStack() {
    let stack = qs("[data-toast-stack]");
    if (stack) return stack;
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("data-toast-stack", "");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
    return stack;
  }

  function toast(message, icon) {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    const iconName = icon || "check_circle";
    el.innerHTML =
      '<span class="material-symbols-rounded" aria-hidden="true">' +
      iconName +
      "</span><span></span>";
    el.lastChild.textContent = message;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 250);
    }, 2400);
    while (stack.children.length > 3) stack.firstChild.remove();
  }
  window.AniyaaToast = toast;

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function initCopyButtons() {
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      let text = btn.getAttribute("data-copy") || "";
      const targetSel = btn.getAttribute("data-copy-target");
      if (!text && targetSel) {
        const target = qs(targetSel);
        if (target) text = target.textContent.trim();
      }
      if (text === "APK_URL") {
        text =
          (window.AniyaaRelease && window.AniyaaRelease.current && window.AniyaaRelease.current.url) ||
          (window.ANIYAA && window.ANIYAA.fallbackApk) ||
          "";
      }
      if (!text && btn.hasAttribute("data-copy-href")) {
        text = btn.getAttribute("href") || window.location.href;
      }
      if (!text) return;
      const ok = await copyText(text);
      toast(ok ? "Copied to clipboard" : "Copy failed — long-press to copy", ok ? "check_circle" : "close");
      const label = qs("[data-copy-label]", btn);
      if (label && ok) {
        const original = label.textContent;
        label.textContent = "Copied";
        setTimeout(() => {
          label.textContent = original;
        }, 1600);
      }
    });
  }

  function initThemeToggle() {
    const btn = qs("[data-theme-toggle]");
    if (!btn || !window.AniyaaTheme) return;

    function syncMeta(theme) {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) return;
      meta.setAttribute("content", theme === "dark" ? "#120f18" : "#6750A4");
    }

    function sync() {
      const dark = window.AniyaaTheme.current() === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      syncMeta(dark ? "dark" : "light");
    }

    btn.addEventListener("click", () => window.AniyaaTheme.toggle());
    document.addEventListener("aniyaa:theme", (e) => {
      syncMeta(e.detail);
      sync();
    });
    sync();
  }

  function initDrawer() {
    const toggle = qs("[data-drawer-toggle]");
    const drawer = qs("[data-drawer]");
    const scrim = qs("[data-drawer-scrim]");
    if (!toggle || !drawer) return;
    const panel = qs(".drawer-panel", drawer);
    let lastFocus = null;

    function focusables() {
      if (!panel) return [];
      return qsa('a[href], button:not([disabled])', panel).filter((el) => !el.hidden);
    }

    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      document.body.classList.add("drawer-open");
      const first = focusables()[0];
      if (first) setTimeout(() => first.focus(), 60);
    }
    function close(restore) {
      if (!drawer.classList.contains("is-open")) return;
      drawer.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      document.body.classList.remove("drawer-open");
      if (restore !== false && lastFocus && lastFocus.focus) {
        try { lastFocus.focus(); } catch { /* noop */ }
      }
    }

    toggle.addEventListener("click", () => {
      drawer.classList.contains("is-open") ? close() : open();
    });
    if (scrim) scrim.addEventListener("click", () => close());
    qsa("[data-drawer] a").forEach((link) => link.addEventListener("click", () => close(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && drawer.classList.contains("is-open")) {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  function scrollToTarget(target) {
    const nav = qs(".nav");
    const offset = nav ? nav.getBoundingClientRect().height + 10 : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (!id || id === "#" || id.length < 2) return;
        // Let FAQ deep-links be handled by FAQ logic (it also scrolls).
        if (id.indexOf("#faq-") === 0) return;
        const target = document.getElementById(id.slice(1));
        if (!target) return;
        e.preventDefault();
        scrollToTarget(target);
        try { history.replaceState(null, "", id); } catch { /* noop */ }
      });
    });
  }

  function initReveal() {
    const items = qsa("[data-reveal]");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  function initFeatureTabs() {
    const tabs = qsa("[data-feature-tab]");
    const panels = qsa("[data-feature-panel]");
    if (!tabs.length) return;

    function activate(name, focus) {
      tabs.forEach((tab) => {
        const on = tab.getAttribute("data-feature-tab") === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.setAttribute("tabindex", on ? "0" : "-1");
        if (on && focus) tab.focus();
      });
      panels.forEach((panel) => {
        const on = panel.getAttribute("data-feature-panel") === name;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      });
      try {
        const url = new URL(window.location.href);
        url.hash = "features-" + name;
        history.replaceState(null, "", url);
      } catch { /* noop */ }
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => activate(tab.getAttribute("data-feature-tab")));
      tab.addEventListener("keydown", (e) => {
        let next = -1;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next >= 0) {
          e.preventDefault();
          activate(tabs[next].getAttribute("data-feature-tab"), true);
        }
      });
    });

    const hash = (window.location.hash || "").replace("#", "");
    if (hash.indexOf("features-") === 0) {
      const name = hash.slice("features-".length);
      if (tabs.some((t) => t.getAttribute("data-feature-tab") === name)) activate(name);
    }
  }

  function setPanel(item, open, animate) {
    const btn = qs("[data-faq-button]", item);
    const panel = qs("[data-faq-panel]", item);
    if (!btn || !panel) return;
    item.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!animate || prefersReducedMotion()) {
      panel.style.maxHeight = open ? "none" : "0px";
      return;
    }
    if (open) {
      panel.style.maxHeight = panel.scrollHeight + "px";
      const done = () => {
        if (item.classList.contains("is-open")) panel.style.maxHeight = "none";
        panel.removeEventListener("transitionend", done);
      };
      panel.addEventListener("transitionend", done);
    } else {
      panel.style.maxHeight = panel.scrollHeight + "px";
      requestAnimationFrame(() => {
        panel.style.maxHeight = "0px";
      });
    }
  }

  function initFaq() {
    const items = qsa("[data-faq-item]");
    if (!items.length) return;

    items.forEach((item, i) => {
      if (!item.id) item.id = "faq-" + (i + 1);
      const btn = qs("[data-faq-button]", item);
      const panel = qs("[data-faq-panel]", item);
      if (!btn || !panel) return;
      if (!btn.hasAttribute("aria-controls")) btn.setAttribute("aria-controls", item.id + "-panel");
      panel.id = item.id + "-panel";
      // Auto-add a "copy link" button so every FAQ entry is deep-linkable,
      // even on pages whose HTML predates the feature.
      let linkBtn = qs("[data-faq-link]", item);
      if (!linkBtn) {
        linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.className = "faq-link-btn";
        linkBtn.setAttribute("data-faq-link", "");
        linkBtn.setAttribute("aria-label", "Copy link to this answer");
        linkBtn.title = "Copy link";
        linkBtn.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">link</span>';
        const expandIcon = qs("[data-faq-button] > .material-symbols-rounded:last-child", item);
        if (expandIcon) btn.insertBefore(linkBtn, expandIcon);
        else btn.appendChild(linkBtn);
      }
      btn.addEventListener("click", () => {
        const open = !item.classList.contains("is-open");
        setPanel(item, open, true);
        if (open) {
          try { history.replaceState(null, "", "#" + item.id); } catch { /* noop */ }
        }
      });
      if (linkBtn) {
        linkBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const url = window.location.origin + window.location.pathname + "#" + item.id;
          const ok = await copyText(url);
          toast(ok ? "FAQ link copied" : "Copy failed", ok ? "link" : "close");
          if (ok) {
            try { history.replaceState(null, "", "#" + item.id); } catch { /* noop */ }
          }
        });
      }
    });

    // Deep-link: #faq-3 opens + highlights.
    function openFromHash() {
      const hash = window.location.hash;
      if (!hash || hash.indexOf("#faq-") !== 0) return;
      const target = document.getElementById(hash.slice(1));
      if (!target || !target.hasAttribute("data-faq-item")) return;
      setPanel(target, true, false);
      target.classList.add("is-highlighted");
      setTimeout(() => scrollToTarget(target), 60);
      setTimeout(() => target.classList.remove("is-highlighted"), 2200);
    }
    window.addEventListener("hashchange", openFromHash);
    // Delay slightly so layout + fonts settle before measuring scroll.
    setTimeout(openFromHash, 80);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlightText(root, query) {
    // Clear previous marks.
    qsa("mark", root).forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
    if (!query) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(q)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && /^(SCRIPT|STYLE|MARK)$/.test(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const idx = node.nodeValue.toLowerCase().indexOf(q);
      if (idx < 0) return;
      const before = node.nodeValue.slice(0, idx);
      const match = node.nodeValue.slice(idx, idx + q.length);
      const after = node.nodeValue.slice(idx + q.length);
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      const mark = document.createElement("mark");
      mark.textContent = match;
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function initFaqFilter() {
    const input = qs("[data-faq-search]");
    if (!input) return;
    const items = qsa("[data-faq-item]");
    const empty = qs("[data-faq-empty]");
    const clear = qs("[data-faq-clear]");
    const count = qs("[data-faq-count]");

    function run() {
      const q = input.value.trim().toLowerCase();
      if (clear) clear.hidden = !q;
      let shown = 0;
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        const match = !q || text.includes(q);
        item.hidden = !match;
        if (match) {
          shown += 1;
          highlightText(item, q);
          // Auto-expand matches while searching, collapse back when cleared.
          if (q) setPanel(item, true, false);
          else setPanel(item, false, false);
        }
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) {
        count.textContent = q ? shown + " of " + items.length + " shown" : items.length + " questions";
      }
      // Re-open deep-linked item after clearing.
      if (!q && window.location.hash.indexOf("#faq-") === 0) {
        const t = document.getElementById(window.location.hash.slice(1));
        if (t && t.hasAttribute("data-faq-item")) setPanel(t, true, false);
      }
    }

    input.addEventListener("input", run);
    if (clear) {
      clear.addEventListener("click", () => {
        input.value = "";
        input.focus();
        run();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        const r = input.getBoundingClientRect();
        if (r.width > 0) {
          e.preventDefault();
          input.focus();
        }
      }
    });
    run();
  }

  function initNavScroll() {
    const nav = qs(".nav");
    if (!nav) return;
    function sync() {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    }
    window.addEventListener("scroll", sync, { passive: true });
    sync();
  }

  function initScrollProgress() {
    const bar = qs("[data-scroll-progress]");
    if (!bar) return;
    function sync() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  }

  function initScrollTop() {
    const btn = qs("[data-scroll-top]");
    if (!btn) return;
    function sync() {
      btn.classList.toggle("is-visible", window.scrollY > 480);
    }
    window.addEventListener("scroll", sync, { passive: true });
    btn.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })
    );
    sync();
  }

  function initSectionSpy() {
    const links = qsa('.nav-links a[href^="#"]');
    if (!links.length || !("IntersectionObserver" in window)) return;
    const map = new Map();
    links.forEach((a) => {
      const id = (a.getAttribute("href") || "").slice(1);
      if (id) map.set(id, a);
    });
    if (!map.size) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          map.forEach((a) => a.classList.remove("is-current"));
          const link = map.get(entry.target.id);
          if (link) link.classList.add("is-current");
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    map.forEach((_, id) => {
      const sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }

  function initPlatformHint() {
    const hint = qs("[data-platform-hint]");
    if (!hint) return;
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
    const label = qs("[data-platform-label]", hint);
    if (isAndroid) {
      if (label) label.textContent = "You're on Android — tap Download APK, then open the file to install.";
    } else if (isMobile) {
      if (label) label.textContent = "You're on a phone — open this page on your Android device or scan the QR code.";
    } else {
      if (label) label.textContent = "You're on desktop — scan the QR code with your Android phone to grab the APK.";
    }
    hint.classList.add("is-visible");
    void isMobile;
  }

  function initYear() {
    qsa("[data-year]").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureToastStack();
    initThemeToggle();
    initDrawer();
    initNavScroll();
    initScrollProgress();
    initSmoothScroll();
    initReveal();
    initFeatureTabs();
    initFaq();
    initFaqFilter();
    initScrollTop();
    initSectionSpy();
    initPlatformHint();
    initCopyButtons();
    initYear();
  });
})();
