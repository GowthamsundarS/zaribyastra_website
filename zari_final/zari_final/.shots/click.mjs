import fs from "node:fs";
const [,, URL_, CLICK_TEXT, SHOT, DUMP] = process.argv;
const t = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const ws = new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let n=0; const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&p.has(m.id))p.get(m.id)(m.result??m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ev=async expression=>(await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:URL_});
await sleep(3000);
if (DUMP) console.log("BEFORE:", await ev(DUMP));
const box = await ev(`(()=>{
  const want=${JSON.stringify(CLICK_TEXT)}.toUpperCase();
  const els=[...document.querySelectorAll('button,a')];
  const el=els.find(e=>(e.innerText||'').trim().toUpperCase()===want) || els.find(e=>(e.innerText||'').trim().toUpperCase().includes(want));
  if(!el) return null;
  el.scrollIntoView({block:'center'});
  const r=el.getBoundingClientRect();
  return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,text:el.innerText.trim(),href:el.getAttribute('href')});
})()`);
if(!box){ console.log("NO ELEMENT MATCHING:", CLICK_TEXT); process.exit(2); }
await sleep(600);
const b=JSON.parse(box);
await send("Input.dispatchMouseEvent",{type:"mousePressed",x:b.x,y:b.y,button:"left",clickCount:1});
await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:b.y?b.x:b.x,y:b.y,button:"left",clickCount:1});
console.log("clicked:", b.text, b.href||"", "@", Math.round(b.x), Math.round(b.y));
await sleep(1800);
console.log("after url:", await ev("location.pathname"));
if (DUMP) console.log("AFTER:", await ev(DUMP));
if (SHOT){ const d=await send("Page.captureScreenshot",{format:"png"}); fs.writeFileSync(SHOT, Buffer.from((d.result??d).data,"base64")); console.log("shot", SHOT); }
ws.close();
