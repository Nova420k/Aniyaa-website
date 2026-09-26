/**
 * Measures the effect of the mobile performance profile.
 *
 *  1. requestAnimationFrame call rate with the hero in view. The particle
 *     field throttles to ~30fps on touch, so a phone profile should show
 *     roughly half the rAF rate of a mouse profile on the same page.
 *  2. The particle canvas backing-store size, proving the DPR cap applies.
 *  3. rAF rate after scrolling the hero out of view, proving the particle
 *     loop and the parallax loop both idle instead of spinning forever.
 *
 * Usage: node scripts/perf.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) { console.error("no browser"); process.exit(1); }

const PORT = 9500 + Math.floor(Math.random() * 200);
const profile = `C:\\Users\\goura\\AppData\\Local\\Temp\\opencode\\perf-${PORT}`;
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank",
], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
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

// Count actual drawn frames (the particle loop calls clearRect exactly once
// per frame it renders). Counting requestAnimationFrame *requests* would not
// work: the throttle still requests a frame every tick and just returns early.
const DRAW_COUNTER = `
  window.__drawCount = 0;
  const proto = CanvasRenderingContext2D.prototype;
  const __clear = proto.clearRect;
  proto.clearRect = function () { window.__drawCount++; return __clear.apply(this, arguments); };
  window.__drawReset = function () { window.__drawCount = 0; };
  window.__drawRead = function () { return window.__drawCount; };
`;

const PROFILES = [
  { name: "phone-390 (touch)", w: 390, h: 844, dpr: 3, touch: true },
  { name: "desktop-1440 (mouse)", w: 1440, h: 900, dpr: 1, touch: false },
];

const results = [];
for (const prof of PROFILES) {
  const { result: t } = await send("Target.createTarget", { url: "about:blank" });
  const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  const S = a.sessionId;
  await send("Page.enable", {}, S);
  await send("Runtime.enable", {}, S);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: DRAW_COUNTER }, S);
  await send("Emulation.setDeviceMetricsOverride", { width: prof.w, height: prof.h, deviceScaleFactor: prof.dpr, mobile: prof.touch }, S);
  await send("Emulation.setTouchEmulationEnabled", { enabled: prof.touch, maxTouchPoints: prof.touch ? 5 : 1 }, S);
  await send("Page.navigate", { url: `file:///${process.cwd().replace(/\\/g, "/")}/index.html` }, S);
  await sleep(2500);

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, S);
    return r.result?.result?.value;
  };

  const parallaxState = () => ev(`(() => {
    const out = [];
    for (const s of [".orb-a", ".orb-b", ".float-a", ".float-b", ".mascot", ".device"]) {
      const el = document.querySelector(s);
      out.push(el ? el.style.translate || "" : "");
    }
    return out;
  })()`);

  // --- hero in view ---
  await ev(`window.__drawReset()`);
  await sleep(2000);
  const heroFps = (await ev(`window.__drawRead()`)) / 2;

  const canvas = await ev(`(() => {
    const c = document.querySelector("canvas[data-particles]");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { cssW: Math.round(r.width), backingW: c.width, cssH: Math.round(r.height), backingH: c.height };
  })()`);

  // Scroll parallax must still work: layers should gain a translate offset.
  const beforeScroll = await parallaxState();
  await ev(`window.scrollBy(0, 400)`);
  await sleep(500);
  const afterScroll = await parallaxState();
  const parallaxMoved = beforeScroll.filter((v, i) => v !== afterScroll[i]).length;

  // Pointer tracking: a mouse move should shift layers on desktop only.
  const beforePointer = await parallaxState();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(prof.w * 0.2), y: Math.round(prof.h * 0.5) }, S);
  await sleep(400);
  const afterPointer = await parallaxState();
  const pointerMoved = beforePointer.filter((v, i) => v !== afterPointer[i]).length;

  // --- hero scrolled away: loops should idle ---
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(900);
  await ev(`window.__drawReset()`);
  await sleep(2000);
  const awayFps = (await ev(`window.__drawRead()`)) / 2;

  results.push({ prof, heroFps, awayFps, canvas, parallaxMoved, pointerMoved });
  console.log(`\n=== ${prof.name} ===`);
  console.log(`  drawn frames/s, hero in view : ${heroFps.toFixed(1)}`);
  console.log(`  drawn frames/s, hero off-screen: ${awayFps.toFixed(1)}`);
  if (canvas) {
    const ratio = canvas.backingW / canvas.cssW;
    console.log(`  particle canvas: css ${canvas.cssW}x${canvas.cssH}, backing ${canvas.backingW}x${canvas.backingH} (${ratio.toFixed(2)}x DPR, devicePixelRatio ${prof.dpr})`);
  } else {
    console.log("  particle canvas: absent");
  }
  console.log(`  parallax layers moved by scroll: ${parallaxMoved}/6`);
  console.log(`  parallax layers moved by pointer: ${pointerMoved}/6`);

  await send("Target.closeTarget", { targetId: t.targetId });
}

const phone = results.find((r) => r.prof.touch);
const desk = results.find((r) => !r.prof.touch);
console.log(`\n${"=".repeat(60)}`);
let bad = 0;
const check = (c, m) => { if (!c) { bad++; console.log("  ISSUE " + m); } else console.log("  ok   " + m); };

check(phone.heroFps > 12 && phone.heroFps < desk.heroFps * 0.75,
  `touch throttles the particle field to ~30fps (${phone.heroFps.toFixed(0)} drawn/s vs mouse ${desk.heroFps.toFixed(0)}/s)`);
check(phone.canvas && phone.canvas.backingW / phone.canvas.cssW <= 1.3, `phone particle DPR capped at 1.25 (${(phone.canvas.backingW / phone.canvas.cssW).toFixed(2)}x)`);
check(phone.awayFps < 3, `hero loops fully idle once off-screen (${phone.awayFps.toFixed(1)} drawn/s)`);
check(phone.parallaxMoved > 0, `scroll parallax still active on touch (${phone.parallaxMoved}/6 layers)`);
check(phone.pointerMoved === 0, `pointer tracking skipped on touch (${phone.pointerMoved}/6 layers reacted)`);
check(desk.pointerMoved > 0, `pointer tracking active for mouse (${desk.pointerMoved}/6 layers)`);

console.log(bad === 0 ? "\nPERF OK" : `\nPERF: ${bad} issue(s)`);
cleanup();
process.exit(bad === 0 ? 0 : 1);
