(function () {
  const cfg = window.ANIYAA;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkifyGithub(html) {
    return html.replace(
      /https:\/\/github\.com\/[^\s<]+/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
    );
  }

  function renderMarkdown(md) {
    if (!md || !md.trim()) {
      return '<p class="muted">No release notes were published for this version.</p>';
    }
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let list = null;

    function closeList() {
      if (list) {
        out.push(`<ul class="change-list">${list.join("")}</ul>`);
        list = null;
      }
    }

    lines.forEach((line) => {
      const t = line.trim();
      if (!t) {
        closeList();
        return;
      }
      const heading = t.match(/^#{1,3}\s+(.*)$/);
      if (heading) {
        closeList();
        out.push(`<h3>${linkifyGithub(escapeHtml(heading[1]))}</h3>`);
        return;
      }
      const bullet = t.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        if (!list) list = [];
        let item = escapeHtml(bullet[1]).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        item = linkifyGithub(item);
        list.push(`<li>${item}</li>`);
        return;
      }
      closeList();
      let p = escapeHtml(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      p = linkifyGithub(p);
      out.push(`<p>${p}</p>`);
    });
    closeList();
    return out.join("") || '<p class="muted">No release notes were published for this version.</p>';
  }

  async function load() {
    const root = document.querySelector("[data-changelog]");
    if (!root) return;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}/releases?per_page=20`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) throw new Error("failed");
      const releases = await res.json();
      if (!Array.isArray(releases) || !releases.length) throw new Error("empty");

      root.innerHTML = releases
        .filter((r) => !r.draft)
        .map((r, i) => {
          const date = window.AniyaaRelease
            ? window.AniyaaRelease.formatDate(r.published_at)
            : (r.published_at || "").slice(0, 10);
          const apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name));
          const size = apk && window.AniyaaRelease ? window.AniyaaRelease.formatBytes(apk.size) : "";
          return `
            <article class="release-card" data-reveal style="--delay:${Math.min(i, 6) * 60}ms">
              <header class="release-card-head">
                <div>
                  <a class="release-title" href="${r.html_url}" target="_blank" rel="noopener">${escapeHtml(r.name || r.tag_name)}</a>
                  <p class="release-meta">
                    <span class="material-symbols-rounded">calendar_month</span>
                    ${escapeHtml(date)}
                    ${size ? ` · ${escapeHtml(size)}` : ""}
                    ${r.prerelease ? ' · <span class="pill pill-warn">Pre-release</span>' : ""}
                  </p>
                </div>
                ${
                  apk
                    ? `<a class="btn btn-ghost" href="${apk.browser_download_url}">
                        <span class="material-symbols-rounded">download</span>
                        APK
                      </a>`
                    : ""
                }
              </header>
              <div class="release-body">${renderMarkdown(r.body || "")}</div>
            </article>
          `;
        })
        .join("");

      if (window.IntersectionObserver) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                io.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.08 }
        );
        root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
      }
    } catch {
      root.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">cloud_off</span>
          <h2>Could not load releases</h2>
          <p>GitHub may be rate-limiting this connection. Open the releases page instead.</p>
          <a class="btn btn-primary" href="${cfg.releasesUrl}" target="_blank" rel="noopener">View on GitHub</a>
        </div>
      `;
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
