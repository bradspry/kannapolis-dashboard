// Share-card pictures for every widget (called by etl/share_cards.py widget_shares). Drives headless Chrome over
// the DevTools protocol so each picture waits until the widget's maps have drawn (maps.js counts them in
// window.__mapsPending), which Chrome's plain --screenshot can't do.
//   node share_shots.mjs <chrome> <page url> <out dir> <file prefix date> <skip ids,comma> [workers]
// Prints JSON: { widgets: [{ id, title, tile, reason }], shots: { id: "share/w/<id>-<date>.jpg" } }
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [exe, page, outDir, date, skipArg = "", workersArg = "5"] = process.argv.slice(2);
const skip = new Set(skipArg.split(",").filter(Boolean));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), "kdash-cards-"));
const args = ["--headless=new", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--remote-debugging-port=0",
  `--user-data-dir=${prof}`, "--window-size=1200,630", "about:blank"];
if (process.env.GITHUB_ACTIONS) args.unshift("--no-sandbox");
const chrome = spawn(exe, args, { stdio: "ignore" });

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.result?.value;
  return { ws, send, ev };
}

// Each worker gets its own window: Chrome doesn't run animation frames in background tabs, and maps draw in them.
let browser = null;
async function open(port) {
  browser ||= await connect((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
  const { result } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const c = await connect(`ws://127.0.0.1:${port}/devtools/page/${result.targetId}`);
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  if (process.env.CARD_DEBUG) {
    c.ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      if (d.method === "Runtime.exceptionThrown") process.stderr.write(`page error: ${d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text}\n`);
      if (d.method === "Runtime.consoleAPICalled" && /warn|error/.test(d.params.type)) process.stderr.write(`console ${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)}\n`);
    });
    await c.send("Runtime.enable");
  }
  return c;
}

async function load(c, url) {
  await c.send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) { await sleep(250); if ((await c.ev("document.readyState")) === "complete") break; }
}

try {
  let port;
  for (let i = 0; i < 80 && !port; i++) {
    await sleep(250);
    const f = join(prof, "DevToolsActivePort");
    if (existsSync(f)) port = readFileSync(f, "utf8").split("\n")[0].trim();
  }
  if (!port) throw new Error("Chrome didn't start");
  const first = await open(port);
  await load(first, `${page}?cards`);
  let raw = null;
  for (let i = 0; i < 40 && !raw; i++) { raw = await first.ev(`document.getElementById("cards-meta")?.textContent || null`); if (!raw) await sleep(250); }
  const widgets = JSON.parse(raw || "[]");
  const only = new Set((process.env.CARD_ONLY || "").split(",").filter(Boolean)); // for testing: just these widgets
  const queue = widgets.filter((w) => !skip.has(w.id) && (!only.size || only.has(w.id))), shots = {};
  const worker = async (c) => {
    for (let w; (w = queue.shift()); ) {
      try {
        await load(c, `${page}?card=${encodeURIComponent(w.id)}`);
        // Maps start a moment after the page (some wait for their box to be laid out): wait until none has been
        // drawing for a full second, up to 30 s.
        let calm = 0;
        for (let i = 0; i < 120 && calm < 4; i++) { await sleep(250); calm = (await c.ev("window.__mapsPending || 0")) > 0 ? 0 : calm + 1; }
        await sleep(500); // images and fonts settle
        const shot = await c.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
        if (shot?.result?.data) {
          const name = `share/w/${w.id}-${date}.jpg`;
          writeFileSync(join(outDir, `${w.id}-${date}.jpg`), Buffer.from(shot.result.data, "base64"));
          shots[w.id] = name;
        }
      } catch (e) { process.stderr.write(`card ${w.id}: ${e.message}\n`); }
    }
    c.ws.close();
  };
  const pages = [first, ...(await Promise.all(Array.from({ length: Math.max(0, +workersArg - 1) }, () => open(port))))];
  await Promise.all(pages.map(worker));
  browser?.ws.close();
  process.stdout.write(JSON.stringify({ widgets, shots }));
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(prof, { recursive: true, force: true }); } catch { /* still closing */ }
}
