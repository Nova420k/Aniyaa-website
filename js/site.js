(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function initThemeToggle() {
    const btn = qs("[data-theme-toggle]");
    if (!btn || !window.AniyaaTheme) return;

    function sync() {
      const dark = window.AniyaaTheme.current() === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }

    btn.addEventListener("click", () => window.AniyaaTheme.toggle());
    document.addEventListener("aniyaa:theme", sync);
    sync();
  }

  function initDrawer() {
    const toggle = qs("[data-drawer-toggle]");
    const drawer = qs("[data-drawer]");
    const scrim = qs("[data-drawer-scrim]");
    if (!toggle || !drawer) return;

    function open() {
      drawer.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("drawer-open");
    }
    function close() {
      drawer.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("drawer-open");
    }

    toggle.addEventListener("click", () => {
      drawer.classList.contains("is-open") ? close() : open();
    });
    if (scrim) scrim.addEventListener("click", close);
    qsa("[data-drawer] a").forEach((link) => link.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = qs(id);
        if (!target) return;
        e.preventDefault();
        const nav = qs(".nav");
        const offset = nav ? nav.getBoundingClientRect().height + 8 : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
      });
    });
  }

  function initReveal() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = qsa("[data-reveal]");
    if (reduce) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    if (!("IntersectionObserver" in window)) {
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

    function activate(name) {
      tabs.forEach((tab) => {
        const on = tab.getAttribute("data-feature-tab") === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach((panel) => {
        const on = panel.getAttribute("data-feature-panel") === name;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab.getAttribute("data-feature-tab")));
    });
  }

  function initFaq() {
    qsa("[data-faq-item]").forEach((item) => {
      const btn = qs("[data-faq-button]", item);
      const panel = qs("[data-faq-panel]", item);
      if (!btn || !panel) return;
      btn.addEventListener("click", () => {
        const open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          panel.style.maxHeight = panel.scrollHeight + "px";
        } else {
          panel.style.maxHeight = "0px";
        }
      });
    });
  }

  function initFaqFilter() {
    const input = qs("[data-faq-search]");
    if (!input) return;
    const items = qsa("[data-faq-item]");
    const empty = qs("[data-faq-empty]");
    const clear = qs("[data-faq-clear]");

    function run() {
      const q = input.value.trim().toLowerCase();
      if (clear) clear.hidden = !q;
      let shown = 0;
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        const match = !q || text.includes(q);
        item.hidden = !match;
        if (match) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
    }

    input.addEventListener("input", run);
    if (clear) {
      clear.addEventListener("click", () => {
        input.value = "";
        input.focus();
        run();
      });
    }
  }

  function initScrollTop() {
    const btn = qs("[data-scroll-top]");
    if (!btn) return;
    function sync() {
      btn.classList.toggle("is-visible", window.scrollY > 480);
    }
    window.addEventListener("scroll", sync, { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    sync();
  }

  function initYear() {
    qsa("[data-year]").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initDrawer();
    initSmoothScroll();
    initReveal();
    initFeatureTabs();
    initFaq();
    initFaqFilter();
    initScrollTop();
    initYear();
  });
})();
