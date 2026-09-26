/**
 * Device-accurate layout probe + screenshots using the Chrome DevTools
 * Protocol. Unlike `--window-size` (which headless clamps to >=500px), this
 * applies real device metrics, touch emulation and media emulation.
 *
 * Usage: node scripts/devices.mjs [--shots] [--pages=a.html,b.html]
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) {
  console.error("Chrome/Edge not found");
  process.exit(1);
}

const args = process.argv.slice(2);
const wantShots = args.includes("--shots");
const wantDark = args.includes("--dark");
const darkTag = wantDark ? "-dark" : "";
const scrollTo = Number((args.find((a) => a.startsWith("--scroll=")) || "").replace("--scroll=", "")) || 0;
const pagesArg = (args.find((a) => a.startsWith("--pages=")) || "").replace("--pages=", "");
const pages = pagesArg ? pagesArg.split(",") : ["index.html"];
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "");
const shotDir = "C:\\Users\\goura\\AppData\\Local\\Temp\\opencode\\shots";
if (wantShots) mkdirSync(shotDir, { recursive: true });

/** Device matrix. touch=true => pointer:coarse + hover:none, like a real handset. */
const DEVICES = [
  { name: "phone-360", w: 360, h: 780, dpr: 3, touch: true },
  { name: "phone-390", w: 390, h: 844, dpr: 3, touch: true },
  { name: "phone-430", w: 430, h: 932, dpr: 3, touch: true },
  { name: "tablet-768", w: 768, h: 1024, dpr: 2, touch: true },
  { name: "tablet-1024", w: 1024, h: 768, dpr: 2, touch: true },
  { name: "phone-land", w: 844, h: 390, dpr: 3, touch: true },
  { name: "desktop-1440", w: 1440, h: 900, dpr: 1, touch: false },
];
const targets = only ? DEVICES.filter((d) => only.split(",").includes(d.name)) : DEVICES;

const PORT = 9333 + Math.floor(Math.random() * 400);
const profile = `C:\\Users\\goura\\AppData\\Local\\Temp\\opencode\\cdp-${PORT}`;
mkdirSync(profile, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

function cleanup() {
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

// Wait for the debugging endpoint.
let wsBase = null;
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    const json = await res.json();
    wsBase = json.webSocketDebuggerUrl;
    break;
  } catch {
    await sleep(250);
  }
}
if (!wsBase) {
  console.error("Chrome DevTools endpoint never came up");
  cleanup();
  process.exit(1);
}

/** Minimal CDP client over the browser endpoint, using the page target. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
        else resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  once(method, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting ${method}`)), timeout);
      this.on(method, (p) => { clearTimeout(t); resolve(p); });
    });
  }
}

const boot = new WebSocket(wsBase);
await new Promise((res, rej) => {
  boot.addEventListener("open", res, { once: true });
  boot.addEventListener("error", rej, { once: true });
});
const cdp = new CDP(boot);

const PROBE = `(() => {
  const d = document;
  const q = (s) => d.querySelector(s);
  const cs = (s, p) => { const el = q(s); return el ? getComputedStyle(el)[p] : "MISSING"; };
  const bw = (s) => { const el = q(s); return el ? Math.round(el.getBoundingClientRect().width) : null; };
  const overflowing = [];
  for (const el of d.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs2 = getComputedStyle(el);
    if (cs2.position === "fixed" || cs2.visibility === "hidden") continue;
    // The drawer panel is parked off-canvas by design (translateX(100%)).
    if (el.closest("[data-drawer]")) continue;
    if (r.right > d.documentElement.clientWidth + 1.5) {
      overflowing.push({
        el: (el.className || el.tagName).toString().slice(0, 46),
        right: Math.round(r.right),
      });
    }
  }
  const taps = [];
  for (const el of d.querySelectorAll("a[href], button:not([disabled])")) {
    // offsetWidth/Height, not getBoundingClientRect: cards that have not
    // finished their reveal animation are mid scale(.985), which would
    // report a phantom 43px target.
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w === 0 || h === 0) continue;
    const cs2 = getComputedStyle(el);
    if (cs2.visibility === "hidden" || cs2.display === "inline") continue;
    if (el.closest("[data-drawer]")) continue;
    if (h < 44 || w < 44) {
      taps.push({ el: (el.className || el.tagName).toString().slice(0, 40), w, h });
    }
  }
  return {
    iw: window.innerWidth,
    ih: window.innerHeight,
    clientW: d.documentElement.clientWidth,
    scrollW: d.documentElement.scrollWidth,
    docH: d.documentElement.scrollHeight,
    mq: {
      p380: matchMedia("(max-width: 380px)").matches,
      p700: matchMedia("(max-width: 700px)").matches,
      p760: matchMedia("(max-width: 760px)").matches,
      p920: matchMedia("(max-width: 920px)").matches,
      p1024: matchMedia("(max-width: 1024px)").matches,
      land: matchMedia("(orientation: landscape) and (max-height: 560px)").matches,
      hoverNone: matchMedia("(hover: none)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
      reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    heroCols: cs(".hero-grid", "gridTemplateColumns"),
    heroArtMinH: cs(".hero-art", "minHeight"),
    deviceAnim: cs(".device", "animationName"),
    deviceW: cs(".device", "width"),
    deviceScreenMinH: cs(".device-screen", "minHeight"),
    navLinks: cs(".nav-links", "display"),
    menuBtn: cs(".menu-btn", "display"),
    drawer: cs(".drawer", "display"),
    h1: cs("h1", "fontSize"),
    sectionPad: cs(".section", "paddingTop"),
    cardsCols: cs(".cards", "gridTemplateColumns"),
    statsCols: cs(".stats-row", "gridTemplateColumns"),
    iconBtn: cs(".icon-btn", "width") + "x" + cs(".icon-btn", "height"),
    tabH: cs(".tab", "minHeight"),
    scrollTopBox: cs(".scroll-top", "bottom"),
    particles: !!q("canvas[data-particles]"),
    particleOpacity: cs(".particles", "opacity"),
    overflow: overflowing.slice(0, 8),
    smallTaps: taps.slice(0, 10),
    smallTapCount: taps.length,
  };
})()`;

const EXPECT = (r) => {
  const p = [];
  const present = (v) => v && v !== "MISSING";
  // The landscape tier intentionally returns the hero to two columns.
  const heroShouldStack = r.mq.p1024 && !r.mq.land;
  if (r.scrollW > r.clientW + 1) {
    p.push(`H-OVERFLOW scrollW ${r.scrollW} > clientW ${r.clientW}; culprits: ${r.overflow.map((o) => `${o.el}@${o.right}`).join(", ") || "none found"}`);
  }
  if (heroShouldStack && present(r.heroCols) && r.heroCols.split(" ").filter(Boolean).length > 1) {
    p.push(`hero-grid should be 1 column under 1024px, got "${r.heroCols}"`);
  }
  // Inner pages have no hero device mockup; only assert where it exists.
  if (present(r.deviceAnim)) {
    if (r.mq.p700 && r.deviceAnim !== "none") p.push(`phone: .device animation should be none, got "${r.deviceAnim}"`);
    if (r.mq.land && r.deviceAnim !== "none") p.push(`landscape phone: .device animation should be none, got "${r.deviceAnim}"`);
  }
  if (present(r.heroArtMinH) && r.mq.p700 && r.heroArtMinH !== "0px") {
    p.push(`phone: .hero-art min-height should be 0, got ${r.heroArtMinH}`);
  }
  if (r.mq.p920 && r.navLinks !== "none") p.push(`<=920px: .nav-links should be hidden, got ${r.navLinks}`);
  if (r.mq.p920 && r.menuBtn === "none") p.push(`<=920px: .menu-btn must be visible`);
  if (r.mq.p920 && r.drawer === "none") p.push(`<=920px: .drawer must be enabled`);
  if (!r.mq.p920 && r.menuBtn !== "none") p.push(`>920px: .menu-btn should be hidden`);
  if (r.mq.hoverNone && r.smallTapCount > 0) {
    p.push(`${r.smallTapCount} touch target(s) under 44px: ${r.smallTaps.map((t) => `${t.el}(${t.w}x${t.h})`).join(", ")}`);
  }
  return p;
};

const base = `file:///${process.cwd().replace(/\\/g, "/")}`;
let totalProblems = 0;
const rows = [];

for (const dev of targets) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const S = sessionId;

  await cdp.send("Page.enable", {}, S);
  await cdp.send("Runtime.enable", {}, S);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: dev.w, height: dev.h, deviceScaleFactor: dev.dpr, mobile: dev.touch,
    screenWidth: dev.w, screenHeight: dev.h,
  }, S);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: dev.touch, maxTouchPoints: dev.touch ? 5 : 1 }, S);
  if (dev.touch) {
    await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }, S);
  }
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: wantDark ? "dark" : "light" }],
  }, S);

  for (const page of pages) {
    const url = `${base}/${page}`;
    const loaded = cdp.once("Page.loadEventFired", 30000);
    await cdp.send("Page.navigate", { url }, S);
    await loaded.catch(() => {});
    // Let fonts, the release fetch and entrance animations settle.
    await sleep(1400);
    // Fonts are remote; without them every measurement is a fallback metric.
    try {
      await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true }, S);
    } catch {}

    const { result } = await cdp.send("Runtime.evaluate", {
      expression: PROBE, returnByValue: true, awaitPromise: false,
    }, S);
    const r = result.value;
    const problems = EXPECT(r);
    totalProblems += problems.length;
    rows.push({ dev: dev.name, page, r, problems });

    console.log(`\n=== ${dev.name} (${dev.w}x${dev.h} @${dev.dpr}x${dev.touch ? " touch" : " mouse"}) :: ${page} ===`);
    console.log(
      `    viewport ${r.iw}x${r.ih}  client ${r.clientW}  scroll ${r.scrollW}x${r.docH}  ` +
      `mq[380:${r.mq.p380 ? "y" : "n"} 700:${r.mq.p700 ? "y" : "n"} 920:${r.mq.p920 ? "y" : "n"} 1024:${r.mq.p1024 ? "y" : "n"} land:${r.mq.land ? "y" : "n"}]`
    );
    console.log(
      `    hero-cols ${r.heroCols}  cards ${r.cardsCols}  stats ${r.statsCols}\n` +
      `    h1 ${r.h1}  section-pad ${r.sectionPad}  nav[links:${r.navLinks} menu:${r.menuBtn} drawer:${r.drawer}]\n` +
      `    device ${r.deviceW} anim:${r.deviceAnim} screen-min-h:${r.deviceScreenMinH}  hero-art-min-h ${r.heroArtMinH}\n` +
      `    icon-btn ${r.iconBtn}  tab-min-h ${r.tabH}  scroll-top bottom ${r.scrollTopBox}  particles:${r.particles ? r.particleOpacity : "none"}`
    );
    if (r.overflow.length) console.log(`    overflow: ${r.overflow.map((o) => `${o.el}@${o.right}`).join(", ")}`);
    console.log(problems.length ? `    PROBLEMS:\n      - ${problems.join("\n      - ")}` : "    ok");

    if (wantShots) {
      // Force reveal animations to their end state so a full-page capture is
      // not full of elements that are legitimately still opacity:0 below the fold.
      if (args.includes("--reveal")) {
        await cdp.send("Runtime.evaluate", {
          expression: `document.querySelectorAll("[data-reveal]").forEach(e => e.classList.add("is-visible"))`,
        }, S);
        await sleep(500);
      }
      if (scrollTo > 0) {
        await cdp.send("Runtime.evaluate", { expression: `window.scrollTo(0, ${scrollTo})` }, S);
        await sleep(700);
      }
      const shotOpts = { format: "png", fromSurface: true };
      if (!args.includes("--vp")) shotOpts.captureBeyondViewport = true;
      const shot = await cdp.send("Page.captureScreenshot", shotOpts, S);
      const tag = [scrollTo ? `s${scrollTo}` : null, args.includes("--vp") ? "vp" : null].filter(Boolean).join("");
      const out = `${shotDir}\\${dev.name}__${page.replace(".html", "")}${darkTag}${tag ? "__" + tag : ""}.png`;
      writeFileSync(out, Buffer.from(shot.data, "base64"));
      console.log(`    shot -> ${out}`);
    }
  }
  await cdp.send("Target.closeTarget", { targetId });
}

console.log(`\n${"=".repeat(64)}`);
console.log(totalProblems === 0 ? "LAYOUT OK across all device profiles" : `${totalProblems} layout problem(s) found`);
if (wantShots) console.log(`screenshots in ${shotDir}`);
cleanup();
process.exit(totalProblems === 0 ? 0 : 1);
