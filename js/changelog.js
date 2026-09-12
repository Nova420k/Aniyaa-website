(function () {
  const cfg = window.ANIYAA || {};

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineFormat(text) {
    let html = escapeHtml(text);
    html = html
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<em>$2</em>");
    // Full URLs
    html = html.replace(
      /https:\/\/github\.com\/[^\s<)]+/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
    );
    // Repo shorthand #123 -> link to issues
    const issuesBase = (cfg.issuesUrl || "https://github.com/Nova420k/Aniyaa/issues").replace(/\/$/, "");
    html = html.replace(/(^|\s)#(\d{1,5})\b/g, `$1<a href="${issuesBase}/$2" target="_blank" rel="noopener">#$2</a>`);
    return html;
  }

  function renderMarkdown(md) {
    if (!md || !md.trim()) {
      return '<p class="muted">No release notes were published for this version.</p>';
    }
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let list = null;
    let ordered = null;
    let inCode = false;
    let codeBuf = [];

    function closeLists() {
      if (list) {
        out.push(`<ul class="change-list">${list.join("")}</ul>`);
        list = null;
      }
      if (ordered) {
        out.push(`<ol class="change-list">${ordered.join("")}</ol>`);
        ordered = null;
      }
    }

    lines.forEach((line) => {
      const t = line.trim();
      if (/^```/.test(t)) {
        if (inCode) {
          out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
          codeBuf = [];
          inCode = false;
        } else {
          closeLists();
          inCode = true;
        }
        return;
      }
      if (inCode) {
        codeBuf.push(line);
        return;
      }
      if (!t) {
        closeLists();
        return;
      }
      const heading = t.match(/^#{1,3}\s+(.*)$/);
      if (heading) {
        closeLists();
        out.push(`<h3>${inlineFormat(heading[1])}</h3>`);
        return;
      }
      const bullet = t.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        if (!list) list = [];
        if (ordered) {
          out.push(`<ol class="change-list">${ordered.join("")}</ol>`);
          ordered = null;
        }
        list.push(`<li>${inlineFormat(bullet[1])}</li>`);
        return;
      }
      const num = t.match(/^\d+[.)]\s+(.*)$/);
      if (num) {
        if (!ordered) ordered = [];
        if (list) {
          out.push(`<ul class="change-list">${list.join("")}</ul>`);
          list = null;
        }
        ordered.push(`<li>${inlineFormat(num[1])}</li>`);
        return;
      }
      closeLists();
      out.push(`<p>${inlineFormat(t)}</p>`);
    });
    closeLists();
    if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
    return out.join("") || '<p class="muted">No release notes were published for this version.</p>';
  }

  function skeletonHtml() {
    let s = "";
    for (let i = 0; i < 3; i += 1) {
      s += `<div class="skeleton" aria-hidden="true">
        <div class="skeleton-bar" style="width:42%"></div>
        <div class="skeleton-bar" style="width:88%"></div>
        <div class="skeleton-bar" style="width:70%"></div>
      </div>`;
    }
    return s;
  }

  function observeReveals(root) {
    const els = root.querySelectorAll("[data-reveal]");
    if (!window.IntersectionObserver) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
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
    els.forEach((el) => io.observe(el));
  }

  let allReleases = [];

  function assetPills(r) {
    const assets = r.assets || [];
    if (!assets.length) return "";
    const fmt = window.AniyaaRelease || null;
    return `<div class="release-assets">` + assets.slice(0, 4).map((a) => {
      const size = a.size && fmt ? fmt.formatBytes(a.size) : "";
      const count = a.download_count ? ` · ${a.download_count.toLocaleString()}` : "";
      return `<a class="asset-pill" href="${a.browser_download_url}" rel="noopener">
        <span class="material-symbols-rounded" aria-hidden="true">download</span>
        ${escapeHtml(a.name)}${size ? ` · ${escapeHtml(size)}` : ""}${escapeHtml(count)}
      </a>`;
    }).join("") + `</div>`;
  }

  function render(root, query) {
    const q = (query || "").trim().toLowerCase();
    const items = allReleases.filter((r) => !r.draft);
    const filtered = !q
      ? items
      : items.filter((r) =>
          `${r.name || ""} ${r.tag_name || ""} ${r.body || ""}`.toLowerCase().includes(q)
        );

    const countEl = document.querySelector("[data-changelog-count]");
    if (countEl) {
      countEl.textContent = q
        ? `${filtered.length} of ${items.length} releases`
        : `${items.length} releases`;
    }

    if (!filtered.length) {
      root.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">search_off</span>
          <h2>No releases matched</h2>
          <p>Try a shorter word like “fix”, “theme”, or a version number.</p>
          <button class="btn btn-ghost" type="button" data-changelog-reset>Clear search</button>
        </div>`;
      const reset = root.querySelector("[data-changelog-reset]");
      if (reset) {
        reset.addEventListener("click", () => {
          const input = document.querySelector("[data-changelog-search]");
          if (input) {
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
          }
        });
      }
      return;
    }

    const fmt = window.AniyaaRelease;
    root.innerHTML = filtered
      .map((r, i) => {
        const date = fmt ? fmt.formatDate(r.published_at) : (r.published_at || "").slice(0, 10);
        const apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name));
        const size = apk && fmt ? fmt.formatBytes(apk.size) : "";
        const isLatest = i === 0 && !q && !r.prerelease;
        return `
          <article class="release-card" id="release-${escapeHtml((r.tag_name || "").replace(/[^a-z0-9]+/gi, "-"))}" data-reveal style="--delay:${Math.min(i, 6) * 60}ms">
            <header class="release-card-head">
              <div>
                <a class="release-title" href="${r.html_url}" target="_blank" rel="noopener">${escapeHtml(r.name || r.tag_name)}</a>
                <p class="release-meta">
                  <span class="material-symbols-rounded">calendar_month</span>
                  ${escapeHtml(date)}
                  ${size ? ` · ${escapeHtml(size)}` : ""}
                  ${isLatest ? ' · <span class="pill" style="background:color-mix(in srgb, var(--ok) 16%, transparent);color:var(--ok)">Latest</span>' : ""}
                  ${r.prerelease ? ' · <span class="pill pill-warn">Pre-release</span>' : ""}
                </p>
              </div>
              <div class="release-actions">
                ${
                  apk
                    ? `<a class="btn btn-ghost" href="${apk.browser_download_url}">
                        <span class="material-symbols-rounded">download</span>
                        APK
                      </a>`
                    : ""
                }
                <button class="icon-btn icon-btn-sm" type="button" data-copy="${r.html_url}" aria-label="Copy link to ${escapeHtml(r.tag_name || "release")}">
                  <span class="material-symbols-rounded">link</span>
                </button>
              </div>
            </header>
            <div class="release-body">${renderMarkdown(r.body || "")}</div>
            ${assetPills(r)}
          </article>
        `;
      })
      .join("");
    observeReveals(root);
    // Reveal immediately-visible cards without waiting for scroll.
    root.querySelectorAll("[data-reveal]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add("is-visible");
    });
  }

  async function load() {
    const root = document.querySelector("[data-changelog]");
    if (!root) return;
    root.innerHTML = skeletonHtml();

    const input = document.querySelector("[data-changelog-search]");
    const clear = document.querySelector("[data-changelog-clear]");
    const wireSearch = () => {
      if (!input) return;
      input.addEventListener("input", () => {
        if (clear) clear.hidden = !input.value;
        render(root, input.value);
      });
      if (clear) {
        clear.addEventListener("click", () => {
          input.value = "";
          clear.hidden = true;
          render(root, "");
          input.focus();
        });
      }
    };

    try {
      const res = await fetch(
        `https://api.github.com/repos/${cfg.githubUser}/${cfg.githubRepo}/releases?per_page=20`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) throw new Error("failed");
      const releases = await res.json();
      if (!Array.isArray(releases) || !releases.length) throw new Error("empty");
      allReleases = releases;
      render(root, input ? input.value : "");
      wireSearch();
    } catch {
      root.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">cloud_off</span>
          <h2>Could not load releases</h2>
          <p>GitHub may be rate-limiting this connection. Open the releases page instead.</p>
          <p style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-primary" href="${cfg.releasesUrl}" target="_blank" rel="noopener">View on GitHub</a>
            <button class="btn btn-ghost" type="button" data-changelog-retry>Try again</button>
          </p>
        </div>
      `;
      const retry = root.querySelector("[data-changelog-retry]");
      if (retry) retry.addEventListener("click", load);
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
