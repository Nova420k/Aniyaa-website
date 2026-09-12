(function () {
  const cfg = window.ANIYAA || {};
  const cacheKey = "aniyaa-latest-release-v1";
  const starsKey = "aniyaa-repo-stars-v1";
  const cacheMs = 10 * 60 * 1000;

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatCount(n) {
    if (n == null) return "";
    try {
      return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
    } catch {
      return String(n);
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(iso));
    } catch {
      return String(iso).slice(0, 10);
    }
  }

  function pickApk(release) {
    const assets = (release && release.assets) || [];
    return (
      assets.find((a) => /aniyaa.*\.apk$/i.test(a.name)) ||
      assets.find((a) => /\.apk$/i.test(a.name)) ||
      null
    );
  }

  function fallbackRelease() {
    return {
      tag: cfg.fallbackTag || "v2.2.0",
      name: cfg.fallbackTag || "v2.2.0",
      url: cfg.fallbackApk || "https://github.com/Nova420k/Aniyaa/releases/latest",
      htmlUrl: cfg.releasesUrl || "https://github.com/Nova420k/Aniyaa/releases",
      sizeLabel: "",
      dateLabel: "",
      downloads: 0,
      publishedAt: "",
      stale: true,
    };
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data) return null;
      const age = Date.now() - (parsed.savedAt || 0);
      return { data: parsed.data, fresh: age <= cacheMs };
    } catch {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
      try {
        sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
      } catch { /* ignore */ }
    }
  }

  async function fetchJson(url, retries) {
    let lastErr = null;
    for (let attempt = 0; attempt <= (retries == null ? 1 : retries); attempt += 1) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
        if (res.status === 403) throw new Error("rate-limited");
        if (!res.ok) throw new Error("release fetch failed: " + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr || new Error("fetch failed");
  }

  function toReleaseData(json) {
    const apk = pickApk(json);
    const downloads = (json.assets || []).reduce((sum, a) => sum + (a.download_count || 0), 0);
    return {
      tag: json.tag_name || cfg.fallbackTag,
      name: json.name || json.tag_name,
      url: apk ? apk.browser_download_url : cfg.fallbackApk,
      htmlUrl: json.html_url || cfg.releasesUrl,
      sizeLabel: apk ? formatBytes(apk.size) : "",
      dateLabel: formatDate(json.published_at),
      downloads,
      publishedAt: json.published_at || "",
      stale: false,
    };
  }

  async function fetchLatest() {
    const cached = readCache(cacheKey);
    if (cached && cached.fresh) return cached.data;

    const endpoint = `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}/releases/latest`;
    const json = await fetchJson(endpoint, 1);
    const data = toReleaseData(json);
    writeCache(cacheKey, data);
    return data;
  }

  async function revalidateInBackground() {
    try {
      const endpoint = `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}/releases/latest`;
      const json = await fetchJson(endpoint, 0);
      const data = toReleaseData(json);
      writeCache(cacheKey, data);
      apply(data);
    } catch { /* keep stale UI */ }
  }

  async function fetchStars() {
    const cached = readCache(starsKey);
    if (cached && cached.fresh) return cached.data;
    try {
      const json = await fetchJson(
        `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}`,
        0
      );
      const data = { stars: json.stargazers_count || 0 };
      writeCache(starsKey, data);
      return data;
    } catch {
      return cached ? cached.data : { stars: 0 };
    }
  }

  function apply(release) {
    window.AniyaaRelease.current = release;
    document.querySelectorAll("[data-release-href]").forEach((el) => {
      el.setAttribute("href", release.url);
    });
    document.querySelectorAll("[data-release-url-text]").forEach((el) => {
      el.textContent = release.url;
    });
    document.querySelectorAll("[data-copy]").forEach((el) => {
      if (el.getAttribute("data-copy") === "APK_URL" || el.hasAttribute("data-copy-apk")) {
        el.setAttribute("data-copy", release.url);
      }
    });
    document.querySelectorAll("[data-release-page]").forEach((el) => {
      el.setAttribute("href", release.htmlUrl);
    });
    document.querySelectorAll("[data-release-tag]").forEach((el) => {
      el.textContent = release.tag;
    });
    document.querySelectorAll("[data-release-size]").forEach((el) => {
      if (release.sizeLabel) el.textContent = release.sizeLabel;
    });
    document.querySelectorAll("[data-release-date]").forEach((el) => {
      if (release.dateLabel) el.textContent = release.dateLabel;
    });
    document.querySelectorAll("[data-release-downloads]").forEach((el) => {
      if (release.downloads) el.textContent = formatCount(release.downloads) + " downloads";
    });

    const qrImg = document.querySelector("[data-release-qr]");
    if (qrImg) {
      const qrUrl =
        "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
        encodeURIComponent(release.url);
      if (qrImg.getAttribute("src") !== qrUrl) {
        qrImg.addEventListener(
          "error",
          () => {
            const fallback = document.querySelector("[data-qr-fallback]");
            if (fallback) fallback.hidden = false;
            qrImg.style.display = "none";
          },
          { once: true }
        );
        qrImg.src = qrUrl;
        qrImg.style.display = "";
      }
      qrImg.alt = `QR code for Aniyaa ${release.tag}`;
    }

    document.dispatchEvent(new CustomEvent("aniyaa:release", { detail: release }));
  }

  function applyStars(stars) {
    if (!stars) return;
    document.querySelectorAll("[data-github-stars]").forEach((el) => {
      el.textContent = formatCount(stars);
    });
  }

  window.AniyaaRelease = {
    formatBytes,
    formatDate,
    formatCount,
    fetchLatest,
    fallbackRelease,
    current: fallbackRelease(),
  };

  document.addEventListener("DOMContentLoaded", () => {
    const cached = readCache(cacheKey);
    if (cached) {
      apply(cached.data);
      if (!cached.fresh) revalidateInBackground();
      else {
        // Stale-while-revalidate: refresh quietly after paint.
        setTimeout(revalidateInBackground, 4000);
      }
    } else {
      apply(fallbackRelease());
      fetchLatest()
        .then(apply)
        .catch(() => apply(fallbackRelease()));
    }
    fetchStars().then((s) => applyStars(s.stars));
  });
})();
