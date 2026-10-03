// Scratch capture helper: drives headless Chrome over CDP to shoot the live dev
// server at scroll offsets / clip regions. Not part of the app.
import fs from "node:fs";
import path from "node:path";

const OUT = process.cwd();
const URL_ = process.argv[2] ?? "http://localhost:5173/";
const shots = JSON.parse(process.argv[3] ?? "[]");

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url: URL_ });
await sleep(3500);

for (const s of shots) {
  if (s.wheel) {
    for (let i = 0; i < s.wheel.steps; i++) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: 720, y: 450, deltaX: 0, deltaY: s.wheel.by,
      });
      await sleep(s.wheel.settle ?? 260);
    }
    await sleep(s.wheel.after ?? 900);
  }
  const { result } = await send("Page.captureScreenshot", {
    format: "png",
    clip: s.clip
      ? { ...s.clip, scale: s.clip.scale ?? 1 }
      : undefined,
    captureBeyondViewport: !!s.clip,
  });
  fs.writeFileSync(path.join(OUT, s.name), Buffer.from(result.data, "base64"));
  console.log("shot", s.name, "scrollY=", (await send("Runtime.evaluate", {
    expression: "Math.round(window.scrollY)", returnByValue: true,
  })).result?.value);
}
ws.close();
