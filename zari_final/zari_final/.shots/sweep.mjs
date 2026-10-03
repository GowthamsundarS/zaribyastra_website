const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:"http://localhost:5174/?sweep=1"});
await new Promise(r=>setTimeout(r,3000));
const geo=JSON.parse((await send("Runtime.evaluate",{expression:`JSON.stringify({docH:document.body.scrollHeight,vh:innerHeight,
 endTop:Math.round(document.querySelector('.scroll-stack-end').getBoundingClientRect().top+scrollY),
 card4:Math.round(document.querySelectorAll('.scroll-stack-card')[3].getBoundingClientRect().top+scrollY),
 foot:Math.round(document.getElementById('contact').getBoundingClientRect().top+scrollY)})`,returnByValue:true})).result.value);
const raw=await send("Runtime.evaluate",{expression:"1+1",returnByValue:true});console.log("RAWPROBE",JSON.stringify(raw));console.log("GEORAW",JSON.stringify(await send("Runtime.evaluate",{expression:`JSON.stringify({docH:document.body.scrollHeight,cards:document.querySelectorAll(".scroll-stack-card").length})`,returnByValue:true})));console.log("GEO",geo);
for(const s of [6000,6500,7000,7200,7400,7600,7800,8000,geo.docH-900]){
  const r=await send("Runtime.evaluate",{expression:`window.scrollTo(0,${s});new Promise(res=>setTimeout(()=>{
    const c=document.querySelectorAll('.scroll-stack-card')[3].getBoundingClientRect();
    res(JSON.stringify({want:${s},got:Math.round(scrollY),card4Top:Math.round(c.top),card4Bottom:Math.round(c.bottom)}));},450))`,awaitPromise:true,returnByValue:true});
  console.log(r.result.result.value);
}
ws.close();
