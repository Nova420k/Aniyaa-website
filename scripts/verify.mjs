/**
 * Static verification for the Aniyaa website.
 * No framework, no deps — run with: node scripts/verify.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

let failures = 0;
let checks = 0;

function pass(msg) {
  checks += 1;
  console.log(`  ok   ${msg}`);
}
function fail(msg) {
  checks += 1;
  failures += 1;
  console.log(`  FAIL ${msg}`);
}
function check(cond, msg) {
  if (cond) pass(msg);
  else fail(msg);
}
function section(title) {
  console.log(`\n${title}`);
}

const htmlFiles = [
  "index.html",
  "faq.html",
  "download.html",
  "changelog.html",
  "privacy.html",
  "license.html",
  "404.html",
];
const jsFiles = ["js/config.js", "js/theme.js", "js/theme-preload.js", "js/release.js", "js/site.js", "js/changelog.js", "js/fx.js", "js/particles.js"];

section("Encoding integrity");
for (const file of [...htmlFiles, "css/styles.css", ...jsFiles]) {
  if (!existsSync(file)) {
    fail(`${file} exists`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  check(!src.includes("\uFFFD"), `${file} has no mojibake / replacement chars`);
}

section("Mobile meta");
for (const file of htmlFiles) {
  const src = readFileSync(file, "utf8");
  check(/<meta name="viewport"[^>]*viewport-fit=cover/.test(src), `${file} uses viewport-fit=cover`);
  check(/<html lang="[a-z-]+"/.test(src), `${file} declares lang`);
}

section("Accessibility hooks");
for (const file of htmlFiles) {
  const src = readFileSync(file, "utf8");
  check(/<title>[^<]+<\/title>/.test(src), `${file} has a non-empty title`);
  check(/class="skip-link"/.test(src), `${file} has a skip link`);
  check(src.includes("data-scroll-progress"), `${file} mounts the scroll progress bar`);
  check(src.includes("data-toast-stack"), `${file} mounts the toast region`);
  const imgs = src.match(/<img\b[^>]*>/g) || [];
  const missingAlt = imgs.filter((tag) => !/\balt=/.test(tag));
  check(missingAlt.length === 0, `${file} images all declare alt (${imgs.length} img)`);
}

section("JS hooks used by site.js exist in markup");
const siteJs = readFileSync("js/site.js", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const faqHtml = readFileSync("faq.html", "utf8");
const hooks = [
  ["data-theme-toggle", indexHtml],
  ["data-drawer-toggle", indexHtml],
  ["data-drawer-scrim", indexHtml],
  ["data-feature-tab", indexHtml],
  ["data-feature-panel", indexHtml],
  ["data-faq-item", faqHtml],
  ["data-faq-search", faqHtml],
  ["data-scroll-top", indexHtml],
  ["data-year", indexHtml],
];
for (const [hook, markup] of hooks) {
  check(siteJs.includes(hook) && markup.includes(hook), `${hook} is both used and rendered`);
}

section("JS syntax");
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    pass(`${file} parses`);
  } catch (err) {
    fail(`${file} parses: ${String(err.stderr || err).split("\n")[0]}`);
  }
}

section("CSS sanity");
const css = readFileSync("css/styles.css", "utf8");
const opens = (css.match(/\{/g) || []).length;
const closes = (css.match(/\}/g) || []).length;
check(opens === closes, `braces balanced (${opens}/${closes})`);
// Every material symbol referenced in markup must be in the icon_names list.
const iconList = (css.match(/icon_names=([a-z0-9_,]+)/) || [])[1] || "";
const allowed = new Set(iconList.split(",").filter(Boolean));
const used = new Set();
for (const file of htmlFiles) {
  const src = readFileSync(file, "utf8");
  const re = /<span class="material-symbols-rounded[^"]*"[^>]*>([a-z0-9_]+)<\/span>/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
}
const dynamic = new Set([
  "close", "check_circle", "link", "search_off", "cloud_off", "star", "send",
  "download", "calendar_month", "bolt", "file_download_off", "settings",
  "history", "bookmark", "18_up_rating", "smartphone", "expand_more",
]);
const missing = [...used].filter((n) => !allowed.has(n));
check(missing.length === 0, `all ${used.size} static icons are in the font subset (missing: ${missing.join(", ") || "none"})`);

section("Build inputs");
const prep = readFileSync("scripts/prepare-site.mjs", "utf8");
for (const file of htmlFiles) {
  check(prep.includes(`"${file}"`), `prepare-site.mjs ships ${file}`);
}
check(prep.includes('"sitemap.xml"'), "prepare-site.mjs ships sitemap.xml");

section("Sitemap targets exist");
const sitemap = readFileSync("sitemap.xml", "utf8");
const paths = [...sitemap.matchAll(/<loc>https:\/\/aniyaa\.pages\.dev\/([^<]*)<\/loc>/g)].map((m) => m[1]);
check(paths.length >= 6, `sitemap lists ${paths.length} urls`);
for (const p of paths) {
  const target = p === "" ? "index.html" : `${p}.html`;
  check(existsSync(target), `sitemap /${p} -> ${target}`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
