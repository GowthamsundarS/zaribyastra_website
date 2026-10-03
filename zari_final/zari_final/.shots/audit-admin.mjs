// Scratch audit: exercise every admin control and check its storefront effect.
// Not part of the app.
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

// Every probe is a statement block; must use `return`.
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
      const urlInput = () => form().querySelector('input[type=url]');
      const catSel = () => form().querySelector("select");
      const badges = (c) => [...c.querySelectorAll("span")].map(s => s.textContent.trim()).filter(t => /Off|New|Best/i.test(t));
      const priceOf = (c) => [...c.querySelectorAll("p")].map(p => p.innerText).find(t => t.includes("₹"));
      ${body}
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (m.result?.exceptionDetails)
    return "!! " + (m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
  return m.result?.result?.value;
};

// Poll until the probe returns a truthy value — the cold Vite dev server is
// slower than any fixed sleep.
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

const NAME = "Audit Test Abaya";
const ADMIN_READY = `return !!document.querySelector('input[type=password], h1') && !!document.querySelector("header");`;
const r = {};

// 0 — a rendered app at all
r.home_smoke = await go("http://localhost:5173/", `return document.querySelector("header")?.innerText.replace(/\\n+/g," ").slice(0,60) || null;`, "home");

// 1 — passcode gate
await go("http://localhost:5173/admin", `return !!document.querySelector('input[type=password]');`, "gate");
r.gate = await waitFor(
  `return document.querySelector('input[type=password]') ? "gate shown" : null;`,
  "gate"
);
await P(`setVal(document.querySelector("input[type=password]"), "wrong"); btn("Enter").click(); return 1;`);
r.bad_passcode = await waitFor(
  `return document.body.innerText.includes("Incorrect passcode") ? "rejected" : (document.querySelector('h1') ? "ACCEPTED WRONG CODE" : null);`,
  "bad passcode"
);
await P(`setVal(document.querySelector("input[type=password]"), "zari2026"); btn("Enter").click(); return 1;`);
r.login = await waitFor(
  `return document.body.innerText.includes("Admin Dashboard") ? "ok" : null;`,
  "login"
);

// 2 — add a product (every field, both flags)
const before = await P(`return (JSON.parse(localStorage.getItem("zari.catalog.v2")||"[]")).length;`);
await P(`btn("Add Product").click(); return 1;`);
await waitFor(`return document.querySelector('input[placeholder^="e.g. Salma"]') ? true : null;`, "add form");
r.add_form = await P(`
  setVal(document.querySelector('input[placeholder^="e.g. Salma"]'), ${JSON.stringify(NAME)});
  setVal(document.querySelector('textarea[placeholder^="A sentence"]'), "Created by the admin audit.");
  setVal(document.querySelector('input[placeholder="2999"]'), "1500");
  setVal(document.querySelector('input[placeholder="None"]'), "1200");
  setVal(urlInput(), "/45456844-bebf-4bf0-97ae-60a075ca50a8.jpg");
  setVal(catSel(), "Abayas");
  btn("New Arrival").click(); btn("Best Seller").click();
  return JSON.stringify({ formFound: !!form(), urlFound: !!urlInput(), cat: catSel().value });
`);
await waitFor(`return document.querySelector('input[placeholder^="e.g. Salma"]')?.value === ${JSON.stringify(NAME)} ? true : null;`, "typed name");
await P(`submitBtn("Add Product").click(); return 1;`);
r.add = await waitFor(
  `const list = JSON.parse(localStorage.getItem("zari.catalog.v2"));
   const p = list.find(x => x.name === ${JSON.stringify(NAME)});
   return p ? JSON.stringify({ n: list.length, was: ${before}, price: p.price, disc: p.discountPrice, cat: p.category, isNew: p.isNew, isBest: p.isBestSeller, hasSizes: "sizes" in p, img: p.image }) : null;`,
  "add stored"
);
r.stats = await waitFor(
  `const n = [...document.querySelectorAll("section p")].map(e=>e.innerText.trim()).filter(t=>/^\\d+$/.test(t));
   return n.length === 4 ? n.join(",") : null;`,
  "stats"
);

// 3 — storefront
await go("http://localhost:5173/collection", `return !!document.querySelector("article");`, "collection");
r.storefront_new = await waitFor(
  `const c = card(${JSON.stringify(NAME)});
   return c ? JSON.stringify({ badges: badges(c), struck: c.querySelector("s")?.innerText, price: priceOf(c), link: !!c.querySelector('a[href*="Audit"]') || "name-not-in-href" }) : null;`,
  "storefront new card"
);

// 4 — edit it (raise price, clear discount)
await go("http://localhost:5173/admin", `return row(${JSON.stringify(NAME)}) || null;`, "admin table");
await P(`row(${JSON.stringify(NAME)}).querySelector('button[aria-label^="Edit"]').click(); return 1;`);
await waitFor(`return document.querySelector('input[placeholder^="e.g. Salma"]')?.value === ${JSON.stringify(NAME)} ? true : null;`, "edit form");
r.edit_prefill = await P(`return JSON.stringify({ name: document.querySelector('input[placeholder^="e.g. Salma"]').value, price: document.querySelector('input[placeholder="2999"]').value, disc: document.querySelector('input[placeholder="None"]').value, newOn: btn("New Arrival").className.includes("bg-maroon") });`);
await P(`
  setVal(document.querySelector('input[placeholder="2999"]'), "1999");
  setVal(document.querySelector('input[placeholder="None"]'), "");
  submitBtn("Save Changes").click();
  return 1;
`);
r.edit_stored = await waitFor(
  `const p = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)});
   return p.price === 1999 ? JSON.stringify({ price: p.price, disc: p.discountPrice }) : null;`,
  "edit stored"
);
await go("http://localhost:5173/collection", `return card(${JSON.stringify(NAME)}) || null;`, "collection edited");
r.storefront_edited = await P(`
  const c = card(${JSON.stringify(NAME)});
  return JSON.stringify({ badges: badges(c), struck: c.querySelector("s")?.innerText, price: priceOf(c) });
`);

// 5 — flag toggles in the table
await go("http://localhost:5173/admin", `return row(${JSON.stringify(NAME)}) || null;`, "admin flags");
await P(`row(${JSON.stringify(NAME)}).querySelector('button[title="Toggle New Arrival"]').click(); return 1;`);
await waitFor(
  `const p = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)});
   return p.isNew === false ? true : null;`,
  "toggle isNew off"
);
await P(`row(${JSON.stringify(NAME)}).querySelector('button[title="Toggle Best Seller"]').click(); return 1;`);
await waitFor(
  `const p = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)});
   return p.isBestSeller === false ? true : null;`,
  "toggle best off"
);
r.flags_stored = await P(`
  const p = JSON.parse(localStorage.getItem("zari.catalog.v2")).find(x => x.name === ${JSON.stringify(NAME)});
  return JSON.stringify({ isNew: p.isNew, isBest: p.isBestSeller });
`);
await go("http://localhost:5173/collection", `return card(${JSON.stringify(NAME)}) || null;`, "collection flags");
r.storefront_flags = await P(`return JSON.stringify(badges(card(${JSON.stringify(NAME)})));`);

// 6 — cart then delete
await P(`const b = [...document.querySelectorAll("article button")].find(x => x.textContent.trim() === "Add to Cart" && x.closest("article").innerText.includes(${JSON.stringify(NAME)})); if (!b) return "NO BUTTON"; b.click(); return 1;`);
r.cart_line = await waitFor(
  `return location.pathname.includes("/cart") ? (document.querySelector("aside")?.innerText.match(/₹[\\d,]+/)?.[0] || null) : null;`,
  "cart page"
);
await go("http://localhost:5173/admin", `return row(${JSON.stringify(NAME)}) || null;`, "admin delete");
await P(`row(${JSON.stringify(NAME)}).querySelector('button[aria-label^="Delete"]').click(); return 1;`);
r.delete_modal = await waitFor(
  `return document.body.innerText.includes("Remove this piece?") ? "shown" : null;`,
  "delete modal"
);
await P(`btn("Delete").click(); return 1;`);
r.delete_stored = await waitFor(
  `return !JSON.parse(localStorage.getItem("zari.catalog.v2")).some(x => x.name === ${JSON.stringify(NAME)}) ? "removed" : null;`,
  "delete stored"
);
await go("http://localhost:5173/collection", `return document.body.innerText.includes("Collection") ? true : null;`, "collection after delete");
r.vanished_from_shop = await P(`return card(${JSON.stringify(NAME)}) ? "STILL ON COLLECTION" : "gone from storefront";`);
await go("http://localhost:5173/cart", `return document.querySelector("main") || null;`, "cart after delete");
r.cart_after_delete = await P(`return JSON.stringify({ body: document.body.innerText.includes("quietly empty") ? "empty state" : document.querySelector("main")?.innerText.slice(0,80), rawBag: localStorage.getItem("zari.bag.v1") });`);
r.header_badge_after_delete = await P(`return document.querySelector("header")?.innerText.replace(/\\n+/g," ").slice(0,80);`);

// 7 — collection cards panel
await go("http://localhost:5173/admin", `return document.querySelector('input[placeholder="e.g. The Burgundy Edit"]') || null;`, "collections panel");
await P(`
  const editors = [...document.querySelectorAll('input[placeholder="e.g. The Burgundy Edit"]')];
  setVal(editors[2], "Audit Silk Edit");
  const sels = [...document.querySelectorAll("select")];
  setVal(sels[2], "hana-open");
  return 1;
`);
r.card_edit = await waitFor(
  `const c = JSON.parse(localStorage.getItem("zari.collections.v1"));
   return c[2].name === "Audit Silk Edit" ? JSON.stringify(c.map(x => x.name + "->" + x.productId)) : null;`,
  "collection card stored"
);
await go("http://localhost:5173/", `return document.querySelector("article") || null;`, "home cards");
r.home_card = await P(`
  const c = card("Audit Silk Edit");
  return c ? JSON.stringify({ href: c.querySelector("a")?.getAttribute("href"), priceLine: priceOf(c), desc: c.innerText.includes("A sentence or two") }) : "MISSING ON HOME";
`);
await go("http://localhost:5173/admin", `return btn("Reset cards") || null;`, "admin reset");
await P(`window.__confirms = []; window.confirm = (m) => { window.__confirms.push(m); return true; }; return 1;`);
await P(`btn("Reset cards").click(); return 1;`);
r.reset_cards = await waitFor(
  `const c = JSON.parse(localStorage.getItem("zari.collections.v1") || "null");
   return window.__confirms.length && (!c || c[2].name !== "Audit Silk Edit") ? JSON.stringify({ asked: window.__confirms, names: c ? c.map(x=>x.name) : "cleared -> seed" }) : null;`,
  "reset cards"
);

// 7b — dangling link: collection card points at a deleted product
r.dangling_link = "not tested";

// 8 — orders stat
await go("http://localhost:5173/product/salma-leaf", `return btn("Buy Now") || null;`, "product page");
const ordersBefore = await P(`return (JSON.parse(localStorage.getItem("zari.orders.v1")||"[]")).length;`);
await P(`btn("Buy Now").click(); return 1;`);
r.order_recorded = await waitFor(
  `const raw = JSON.parse(localStorage.getItem("zari.orders.v1") || "[]");
   return raw.length > ${ordersBefore} ? JSON.stringify({ n: raw.length, last: raw[raw.length-1] }) : null;`,
  "order recorded"
);
await go("http://localhost:5173/admin", `return btn("Sign out") || null;`, "admin orders");
r.orders_stat = await P(`return JSON.stringify([...document.querySelectorAll("section p")].map(e=>e.innerText.trim()).filter(t=>/^\\d+$/.test(t)));`);

// 9 — persistence across reload + sign out
await P(`window.location.reload(); return 1;`);
r.after_reload = await waitFor(
  `return btn("Sign out") ? "session kept (sessionStorage)" : (document.querySelector('input[type=password]') ? "gate shown again" : null);`,
  "after reload"
);

console.log(JSON.stringify(r, null, 2));
ws.close();
process.exit(0);
