// Scratch audit 2: edge cases — category, invalid discount, dangling card link,
// collection filters, oversized upload guard.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const P = async (body) => {
  const m = await send("Runtime.evaluate", {
    expression: `(() => {
      const setVal = (el, v) => {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
          : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      };
      const btn = (text) => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === text);
      const submitBtn = (text) => [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === text).pop();
      const row = (name) => [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes(name));
      const card = (name) => [...document.querySelectorAll("article")].find(a => a.innerText.includes(name));
      const form = () => [...document.querySelectorAll("section")].find(s => s.querySelector('input[placeholder^="e.g. Salma"]'));
      const catSel = () => form().querySelector("select");
      ${body}
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (m.result?.exceptionDetails)
    return "!! " + (m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
  return m.result?.result?.value;
};
const waitFor = async (body, label, timeout = 30000) => {
  const t0 = Date.now();
  let last = null;
  for (;;) {
    const v = await P(body);
    if (typeof v === "string" && v.startsWith("!!")) return v;
    if (v) return v;
    last = v;
    if (Date.now() - t0 > timeout) return "TIMEOUT:" + label;
    await sleep(250);
  }
};
const go = async (url, ready, label) => {
  await send("Page.navigate", { url });
  await sleep(600);
  return waitFor(ready, label + " load");
};
const login = async () => {
  await go("http://localhost:5173/admin", `return document.querySelector('input[type=password]') || btn("Sign out") || null;`, "admin");
  const already = await P(`return btn("Sign out") ? "yes" : null;`);
  if (already) return;
  await P(`setVal(document.querySelector("input[type=password]"), "zari2026"); btn("Enter").click(); return 1;`);
  await waitFor(`return document.body.innerText.includes("Admin Dashboard") ? true : null;`, "login");
};

const NAME = "Edge Abaya";
const r = {};

await login();

// A — add with an INVALID discount (>= price) and a non-Abaya category
await P(`btn("Add Product").click(); return 1;`);
await waitFor(`return form() ? true : null;`, "form");
await P(`
  setVal(document.querySelector('input[placeholder^="e.g. Salma"]'), ${JSON.stringify(NAME)});
  setVal(document.querySelector('input[placeholder="2999"]'), "1000");
  setVal(document.querySelector('input[placeholder="None"]'), "1400");
  return 1;
`);
await waitFor(`return catSel() ? true : null;`, "cat select");
await P(`
  const cats = [...catSel().options].map(o => o.value);
  setVal(catSel(), cats.find(c => c !== "Abayas"));
  return JSON.stringify(cats);
`);
r.categories = await waitFor(`return [...catSel().options].length ? JSON.stringify([...catSel().options].map(o=>o.value)) : null;`, "options");
await P(`submitBtn("Add Product").click(); return 1;`);
r.invalid_discount = await waitFor(
  `const p = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)});
   return p ? JSON.stringify({ price: p.price, disc: p.discountPrice, cat: p.category, id: p.id }) : null;`,
  "stored"
);

// B — storefront must show no discount artefacts
await go("http://localhost:5173/collection", `return card(${JSON.stringify(NAME)}) || null;`, "collection");
r.no_discount_ui = await P(`
  const c = card(${JSON.stringify(NAME)});
  return JSON.stringify({ struck: !!c.querySelector("s"), offBadge: c.innerText.includes("Off"), price: [...c.querySelectorAll("p")].map(p=>p.innerText).find(t=>t.includes("₹")) });
`);

// C — category filter on the Collection page
r.filter_tabs = await P(`return [...document.querySelectorAll("button")].map(b=>b.textContent.trim()).filter(t=>/^(All|Abayas|New Arrivals|Best Sellers|Premium)/.test(t)).join(",");`);
const CAT = await P(`return JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)}).category;`);
await P(`const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()===${JSON.stringify(CAT)}); if(!b) return "NO TAB"; b.click(); return 1;`);
await sleep(1200);
r.filter_by_category = await P(`
  const names = [...document.querySelectorAll("article")].map(a => a.querySelector("h3")?.innerText);
  return JSON.stringify({ includes: names.includes(${JSON.stringify(NAME)}), n: names.length, url: location.pathname + location.search });
`);

// D — dangling collection card: link a card to this product, then delete it
await login();
await P(`
  const sels = [...document.querySelectorAll("select")];
  const id = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)}).id;
  setVal(sels[0], id);
  return 1;
`);
await waitFor(`return JSON.parse(localStorage.getItem("zari.collections.v1"))[0].productId === JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)}).id ? true : null;`, "card linked");
await P(`row(${JSON.stringify(NAME)}).querySelector('button[aria-label^="Delete"]').click(); return 1;`);
await waitFor(`return document.body.innerText.includes("Remove this piece?") ? true : null;`, "modal");
await P(`btn("Delete").click(); return 1;`);
await waitFor(`return !JSON.parse(localStorage.getItem("zari.catalog.v2")).some(x => x.name === ${JSON.stringify(NAME)}) ? true : null;`, "deleted");
r.dangling_admin = await P(`
  const sels = [...document.querySelectorAll("select")];
  return JSON.stringify({ firstSelectText: sels[0].selectedOptions[0]?.innerText, value: sels[0].value });
`);
await go("http://localhost:5173/", `return document.querySelector("article") || null;`, "home");
r.dangling_home = await P(`
  const c = document.querySelectorAll("article")[0];
  const link = c?.querySelector("a");
  return JSON.stringify({ title: c?.querySelector("h3")?.innerText, href: link?.getAttribute("href") });
`);
const HREF = await P(`return document.querySelector("article")?.querySelector("a")?.getAttribute("href");`);
await go("http://localhost:5173" + HREF, `return document.body.innerText.trim().length > 40 ? true : null;`, "dangling product");
r.dangling_product_page = await P(`return document.body.innerText.replace(/\\n+/g," ").slice(0,110);`);

// E — oversized upload guard (product form)
await login();
await P(`btn("Add Product").click(); return 1;`);
await waitFor(`return form() ? true : null;`, "form 2");
r.oversize = await P(`
  const input = form().querySelector('input[type=file]');
  const big = new File([new Uint8Array(1_300_000)], "big.jpg", { type: "image/jpeg" });
  Object.defineProperty(input, "files", { value: [big], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return "dispatched";
`);
await sleep(1200);
const draft = await waitFor(
  `const p = JSON.parse(localStorage.getItem("zari.catalog.v2")||"[]").some(x=>x.name==="Big Test");
   return document.body.innerText.includes("too large for the browser store") ? "warned" : (p ? "ACCEPTED" : null);`,
  "oversize warning"
);
r.oversize = draft;

// F — cleanup
await P(`
  const list = JSON.parse(localStorage.getItem("zari.catalog.v2")||"[]");
  localStorage.setItem("zari.catalog.v2", JSON.stringify(list.filter(x => x.name === ${JSON.stringify(NAME)} ? false : true)));
  localStorage.removeItem("zari.collections.v1");
  return "cleaned";
`);

console.log(JSON.stringify(r, null, 2));
ws.close();
process.exit(0);
