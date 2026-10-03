import fs from "node:fs";
const url=process.argv[2], shot=process.argv[3];
const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url});
await new Promise(r=>setTimeout(r,2500));
await ev(`(async()=>{const i=[...document.images];i.forEach(x=>x.loading='eager');await Promise.all(i.map(x=>x.complete?1:new Promise(r=>{x.onload=x.onerror=r;})));return 1})()`);
const max=await ev("document.body.scrollHeight-innerHeight");
const rows=[];
for(let s=6200;s<=+max;s+=200){
  await ev(`window.scrollTo(0,${s});1`);
  const v=await ev(`new Promise(r=>setTimeout(()=>{
    const cs=[...document.querySelectorAll('.scroll-stack-card')].map(c=>c.getBoundingClientRect());
    const f=document.getElementById('contact').getBoundingClientRect();
    r(JSON.stringify({s:Math.round(scrollY),
      cardBottom:Math.round(Math.max(...cs.map(c=>c.bottom))),
      footTop:Math.round(f.top)}));},350))`);
  rows.push(JSON.parse(v));
}
console.log("scroll | lowestCardBottom | footerTop | gap(empty px)");
for(const r of rows){
  const gap = r.cardBottom<=0 ? r.footTop : null;
  console.log(String(r.s).padStart(5), "|", String(r.cardBottom).padStart(6), "|", String(r.footTop).padStart(6), "|", gap===null?"-":String(gap).padStart(6));
}
if(shot){const d=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(shot,Buffer.from((d.result??d).data,"base64"));}
ws.close();
