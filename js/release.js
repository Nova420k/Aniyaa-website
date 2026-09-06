(function () {
  const cfg = window.ANIYAA;
  const cacheKey = "aniyaa-latest-release";
  const cacheMs = 10 * 60 * 1000;

  function formatBytes(bytes) {
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

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  }

  function pickApk(release) {
    const assets = release.assets || [];
    return (
      assets.find((a) => /aniyaa.*\.apk$/i.test(a.name)) ||
      assets.find((a) => /\.apk$/i.test(a.name)) ||
      null
    );
  }

  function fallbackRelease() {
    return {
      tag: cfg.fallbackTag,
      name: cfg.fallbackTag,
      url: cfg.fallbackApk,
      htmlUrl: `${cfg.releasesUrl}/tag/${cfg.fallbackTag}`,
      sizeLabel: "",
      dateLabel: "",
      publishedAt: "",
    };
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.savedAt > cacheMs) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
      /* ignore */
    }
  }

  async function fetchLatest() {
    const cached = readCache();
    if (cached) return cached;

    const endpoint = `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}/releases/latest`;
    const res = await fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("release fetch failed");
    const json = await res.json();
    const apk = pickApk(json);
    const data = {
      tag: json.tag_name || cfg.fallbackTag,
      name: json.name || json.tag_name,
      url: apk ? apk.browser_download_url : cfg.fallbackApk,
      htmlUrl: json.html_url || cfg.releasesUrl,
      sizeLabel: apk ? formatBytes(apk.size) : "",
      dateLabel: formatDate(json.published_at),
      publishedAt: json.published_at || "",
    };
    writeCache(data);
    return data;
  }

  function apply(release) {
    document.querySelectorAll("[data-release-href]").forEach((el) => {
      el.setAttribute("href", release.url);
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

    const qrImg = document.querySelector("[data-release-qr]");
    if (qrImg) {
      const qrUrl =
        "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
        encodeURIComponent(release.url);
      qrImg.src = qrUrl;
      qrImg.alt = `QR code for Aniyaa ${release.tag}`;
    }

    document.dispatchEvent(new CustomEvent("aniyaa:release", { detail: release }));
  }

  window.AniyaaRelease = {
    formatBytes,
    formatDate,
    fetchLatest,
    fallbackRelease,
  };

  document.addEventListener("DOMContentLoaded", () => {
    apply(fallbackRelease());
    fetchLatest()
      .then(apply)
      .catch(() => apply(fallbackRelease()));
  });
})();
