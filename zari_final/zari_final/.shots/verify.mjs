import fs from "node:fs";
const url = process.argv[2], scroll = +(process.argv[3]||0), shot = process.argv[4];
const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url});
await new Promise(r=>setTimeout(r,2500));
await send("Runtime.evaluate",{expression:`(async()=>{const imgs=[...document.images];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;})));return 1})()`,awaitPromise:true});
await send("Runtime.evaluate",{expression:`window.scrollTo(0,${scroll});1`,returnByValue:true});
await new Promise(r=>setTimeout(r,1200));
const r=await send("Runtime.evaluate",{expression:`JSON.stringify((()=>{
 const cards=[...document.querySelectorAll('.scroll-stack-card')];
 return {scrollY:Math.round(scrollY),innerH:innerHeight,
  cards:cards.map(c=>{const b=c.getBoundingClientRect();const h=c.querySelector('h3');const hb=h?h.getBoundingClientRect():null;
   return {top:Math.round(b.top),h:Math.round(b.height),bottom:Math.round(b.bottom),
     title:h?h.textContent.trim().slice(0,22):null,
     titleBottom:hb?Math.round(hb.bottom):null,
     titleClipped: hb? (hb.bottom>b.bottom-4 || hb.top<b.top+4):null, textOverflow: (function(){var d=c.querySelector("h3").parentElement; return Math.round(d.scrollHeight)+" vs "+Math.round(d.clientHeight);})()};}),
 };})())`,returnByValue:true});
console.log(JSON.stringify(JSON.parse(r.result.result.value),null,1));
if(shot){const d=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(shot,Buffer.from((d.result??d).data,"base64"));console.log("shot",shot);}
ws.close();
