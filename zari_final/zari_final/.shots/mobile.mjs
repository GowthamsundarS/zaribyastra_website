import fs from "node:fs";
const [,,URL_,W,H,SCROLL,SHOT]=process.argv;
const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:+W,height:+H,deviceScaleFactor:2,mobile:true});
await send("Page.navigate",{url:URL_});
await new Promise(r=>setTimeout(r,2500));
await send("Runtime.evaluate",{expression:`window.scrollTo(0,${+SCROLL});1`,returnByValue:true});
await new Promise(r=>setTimeout(r,1200));
const r=await send("Runtime.evaluate",{expression:`JSON.stringify((()=>{
 const cards=[...document.querySelectorAll('.scroll-stack-card')];
 return {scrollY:Math.round(scrollY),docH:document.body.scrollHeight,vh:innerHeight,
  cardH:cards.map(c=>Math.round(c.getBoundingClientRect().height)),
  cardTop:cards.map(c=>Math.round(c.getBoundingClientRect().top)),
  clipped:cards.map(c=>{const b=c.getBoundingClientRect();const link=c.querySelector("a");const h=c.querySelector("h3").getBoundingClientRect();return (link?link.getBoundingClientRect().bottom:b.bottom)>b.bottom-2||h.top<b.top+2;})
 };})())`,returnByValue:true});
console.log(r.result.result.value);
const d=await send("Page.captureScreenshot",{format:"png"});
fs.writeFileSync(SHOT,Buffer.from((d.result??d).data,"base64"));
console.log("shot",SHOT);
ws.close();
