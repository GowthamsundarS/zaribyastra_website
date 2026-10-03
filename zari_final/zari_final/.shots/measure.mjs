// Scratch measurement helper — reports DOM rects for the navbar lockup and
// section offsets. Not part of the app.
const url = process.argv[2] ?? "http://localhost:5173/collection";
const expr = process.argv[3];

const t = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let i = 0;
const p = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && p.has(m.id)) p.get(m.id)(m.result ?? m);
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++i;
    p.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 3500));
const r = await send("Runtime.evaluate", {
  expression: expr,
  returnByValue: true,
  awaitPromise: true,
});
console.log(JSON.stringify(r.result.value ?? r, null, 2));
ws.close();
