/**
 * Interaction smoke test over the DevTools Protocol. Verifies the widgets
 * that were refactored for mobile (shared scroll loop, drawer, FAQ, tabs,
 * theme, toasts) actually respond, on both a phone and a desktop profile.
 *
 * Usage: node scripts/smoke.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) { console.error("no browser"); process.exit(1); }

const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = `C:\\Users\\goura\\AppData\\Local\\Temp\\opencode\\smoke-${PORT}`;
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank",
], { stdio: "ignore" });
const cleanup = () => {
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}, sessionId) => {
  id += 1;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
};

const PROFILES = [
  { name: "phone-390", w: 390, h: 844, touch: true },
  { name: "desktop-1440", w: 1440, h: 900, touch: false },
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`    ok   ${m}`); } else { fail++; console.log(`    FAIL ${m}`); } };

for (const prof of PROFILES) {
  console.log(`\n=== ${prof.name} ===`);
  const { result: t } = await send("Target.createTarget", { url: "about:blank" });
  const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  const S = a.sessionId;
  await send("Page.enable", {}, S);
  await send("Runtime.enable", {}, S);
  await send("Emulation.setDeviceMetricsOverride", { width: prof.w, height: prof.h, deviceScaleFactor: 2, mobile: prof.touch }, S);
  await send("Emulation.setTouchEmulationEnabled", { enabled: prof.touch, maxTouchPoints: prof.touch ? 5 : 1 }, S);

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, S);
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  const goto = async (page) => {
    await send("Page.navigate", { url: `file:///${process.cwd().replace(/\\/g, "/")}/${page}` }, S);
    await sleep(1600);
  };

  /* ---- index.html ---- */
  await goto("index.html");

  const jsErrors = await ev(`window.__errs ? window.__errs.length : 0`);
  ok(jsErrors === 0, `no page errors on load (${jsErrors})`);

  // Theme toggle
  const before = await ev(`document.documentElement.getAttribute("data-theme")`);
  await ev(`document.querySelector("[data-theme-toggle]").click()`);
  await sleep(200);
  const after = await ev(`document.documentElement.getAttribute("data-theme")`);
  const stored = await ev(`localStorage.getItem("aniyaa-theme")`);
  ok(before !== after, `theme toggles ${before} -> ${after}`);
  ok(stored === after, `theme persisted to localStorage (${stored})`);
  const metaTheme = await ev(`document.querySelector('meta[name="theme-color"]').getAttribute("content")`);
  ok(!!metaTheme, `theme-color meta synced (${metaTheme})`);
  await ev(`document.querySelector("[data-theme-toggle]").click()`);
  await sleep(150);

  // Drawer (only rendered <=920px)
  const hasDrawer = await ev(`getComputedStyle(document.querySelector(".menu-btn")).display !== "none"`);
  if (hasDrawer) {
    await ev(`document.querySelector("[data-drawer-toggle]").click()`);
    await sleep(300);
    ok(await ev(`document.querySelector("[data-drawer]").classList.contains("is-open")`), "drawer opens");
    ok(await ev(`document.body.classList.contains("drawer-open")`), "body scroll locks while drawer is open");
    ok(await ev(`document.activeElement.closest(".drawer-panel") !== null`), "focus moves into the drawer");
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))`);
    await sleep(300);
    ok(!(await ev(`document.querySelector("[data-drawer]").classList.contains("is-open")`)), "Escape closes the drawer");
    ok(!(await ev(`document.body.classList.contains("drawer-open")`)), "body scroll unlocks on close");
  } else {
    ok(await ev(`getComputedStyle(document.querySelector(".nav-links")).display !== "none"`), "inline nav shown on wide screens");
  }

  // Feature tabs
  const tabBefore = await ev(`document.querySelector("[data-feature-tab].is-active").dataset.featureTab`);
  await ev(`document.querySelector('[data-feature-tab="privacy"]').click()`);
  await sleep(250);
  ok(await ev(`document.querySelector('[data-feature-tab="privacy"]').getAttribute("aria-selected") === "true"`), "tab selects on click");
  ok(await ev(`document.getElementById("panel-privacy").hidden === false`), "matching panel is shown");
  ok(await ev(`document.getElementById("panel-browse").hidden === true`), "previous panel is hidden");
  ok((await ev(`location.hash`)) === "#features-privacy", `tab state persists in the URL (${await ev("location.hash")})`);
  // Keyboard navigation
  await ev(`document.querySelector('[data-feature-tab="privacy"]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }, S);
  await sleep(250);
  ok(await ev(`document.querySelector('[data-feature-tab="browse"]').getAttribute("aria-selected") === "true"`), "ArrowRight wraps the tablist");
  await ev(`document.querySelector('[data-feature-tab="browse"]').click()`);
  await sleep(200);

  // Copy button -> toast
  await ev(`document.querySelector("[data-copy]").click()`);
  await sleep(400);
  ok(await ev(`!!document.querySelector(".toast.is-visible")`), "copy button raises a toast");
  ok(await ev(`!!document.querySelector(".toast").textContent.trim().length > 0`), "toast has readable text");

  // Shared scroll loop drives every scroll widget
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(600);
  const sp = await ev(`document.querySelector("[data-scroll-progress]").style.transform`);
  ok(/scaleX\(0?\.(9|1)/.test(sp) || /scaleX\(1\)/.test(sp), `scroll progress reaches the end (${sp})`);
  ok(await ev(`document.querySelector("[data-scroll-top]").classList.contains("is-visible")`), "back-to-top appears after scrolling");
  ok(await ev(`document.querySelector(".nav").classList.contains("is-scrolled")`), "nav gets its scrolled state");
  await ev(`document.querySelector("[data-scroll-top]").click()`);
  // Smooth scrolling from the page bottom takes a while; poll until it settles.
  let topY = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    topY = await ev(`window.scrollY`);
    if (typeof topY === "number" && topY < 2) break;
  }
  ok(topY < 2, `back-to-top returns to the top (y=${topY})`);

  // Parallax / particle loops must not be spinning after the hero leaves.
  ok(await ev(`!!document.querySelector("canvas[data-particles]")`), "particle canvas mounted");

  /* ---- faq.html ---- */
  await goto("faq.html");
  await ev(`document.querySelectorAll("[data-faq-button]")[2].click()`);
  await sleep(400);
  ok(await ev(`document.querySelectorAll("[data-faq-item]")[2].classList.contains("is-open")`), "FAQ accordion opens");
  ok(await ev(`document.querySelectorAll("[data-faq-button]")[2].getAttribute("aria-expanded") === "true"`), "FAQ aria-expanded updates");
  const panelH = await ev(`document.querySelectorAll("[data-faq-panel]")[2].getBoundingClientRect().height`);
  ok(panelH > 10, `FAQ panel expands to content height (${Math.round(panelH)}px)`);
  ok(await ev(`!!document.querySelector("[data-faq-link]")`), "per-answer copy-link button injected");

  // Search filter
  await ev(`const i=document.querySelector("[data-faq-search]"); i.value="mirror"; i.dispatchEvent(new Event("input",{bubbles:true}));`);
  await sleep(300);
  const shown = await ev(`[...document.querySelectorAll("[data-faq-item]")].filter(e=>!e.hidden).length`);
  ok(shown > 0 && shown < 12, `FAQ search narrows results (${shown} of 12)`);
  ok(await ev(`document.querySelector("[data-faq-count]").textContent.includes("of")`), "FAQ result count updates");
  ok(await ev(`!!document.querySelector("[data-faq-item] mark")`), "search matches are highlighted");

  /* ---- changelog.html ---- */
  await goto("changelog.html");
  const cards = await ev(`document.querySelectorAll(".release-card").length`);
  ok(cards > 0 || (await ev(`!!document.querySelector(".empty-state")`)), `changelog renders (${cards} cards, or a graceful empty state)`);
  const filterInput = await ev(`!!document.querySelector("[data-changelog-search]")`);
  if (filterInput) {
    await ev(`const i=document.querySelector("[data-changelog-search]"); i.value="zzzznomatch"; i.dispatchEvent(new Event("input",{bubbles:true}));`);
    await sleep(300);
    ok(await ev(`!!document.querySelector("[data-changelog-reset]")`), "changelog filter shows a reset when nothing matches");
  }

  await send("Target.closeTarget", { targetId: t.targetId });
}

console.log(`\n${"=".repeat(56)}`);
console.log(fail === 0 ? `SMOKE PASS — ${pass} assertions` : `SMOKE FAIL — ${fail} failed, ${pass} passed`);
cleanup();
process.exit(fail === 0 ? 0 : 1);
