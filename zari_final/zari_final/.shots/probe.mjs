const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find(t=>t.type==="page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pending=new Map();
ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id))pending.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Runtime.enable");
const ev = async (expression) => (await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
console.log(JSON.stringify(await ev(`(() => {
  const secs = [...document.querySelectorAll('section, [id]')].map(e => ({tag:e.tagName.toLowerCase(), id:e.id||null, cls:(e.className||'').toString().slice(0,60), top: Math.round(e.getBoundingClientRect().top + window.scrollY), h: Math.round(e.getBoundingClientRect().height)}));
  return {title: document.title, docHeight: Math.round(document.body.scrollHeight), url: location.href, secs};
})()`), null, 1));
ws.close();
