const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m.result??m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async e=>(await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true})).result?.result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:process.argv[2]??"http://localhost:5174/"});
await new Promise(r=>setTimeout(r,3500));
console.log(await ev(`(()=>{
 const cards=[...document.querySelectorAll('.scroll-stack-card')];
 const end=document.querySelector('.scroll-stack-end');
 const sec=document.getElementById('collections');
 return JSON.stringify({
  docH:document.body.scrollHeight, innerH:innerHeight,
  secTop:Math.round(sec.getBoundingClientRect().top+scrollY),
  secH:Math.round(sec.getBoundingClientRect().height),
  endTop:Math.round(end.getBoundingClientRect().top+scrollY),
  cardTops:cards.map(c=>Math.round(c.getBoundingClientRect().top+scrollY)),
  cardH:cards.map(c=>Math.round(c.getBoundingClientRect().height)),
  footerTop:Math.round(document.getElementById('contact').getBoundingClientRect().top+scrollY)
 },null,1)}))()`));
ws.close();
