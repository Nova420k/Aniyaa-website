(function () {
  const STORAGE_KEY = "aniyaa-theme";

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function storedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function resolveTheme(stored) {
    if (stored === "light" || stored === "dark") return stored;
    return systemPrefersDark() ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }

  window.AniyaaTheme = {
    get stored() {
      return storedTheme();
    },
    current() {
      return resolveTheme(storedTheme());
    },
    set(theme) {
      const next = theme === "dark" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode */
      }
      applyTheme(next);
      document.dispatchEvent(new CustomEvent("aniyaa:theme", { detail: next }));
    },
    toggle() {
      this.set(this.current() === "dark" ? "light" : "dark");
    },
  };

  applyTheme(resolveTheme(storedTheme()));

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!storedTheme()) applyTheme(resolveTheme(null));
    });
  }
})();
