const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:process.argv[2]||"http://localhost:5174/"});
await new Promise(r=>setTimeout(r,2500));
// force eager loading and wait for every image
await send("Runtime.evaluate",{expression:`(async()=>{
  const imgs=[...document.images]; imgs.forEach(i=>{i.loading='eager'; if(i.complete===false) i.src=i.src;});
  await Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;})));
  return 1;})()`,awaitPromise:true,returnByValue:true});
await new Promise(r=>setTimeout(r,1500));
const expr=`JSON.stringify((()=>{
 const cards=[...document.querySelectorAll('.scroll-stack-card')];
 const sec=document.getElementById('collections');
 const end=document.querySelector('.scroll-stack-end');
 const top=e=>Math.round(e.getBoundingClientRect().top+scrollY);
 return {docH:document.body.scrollHeight,
   imgs: [...document.querySelectorAll('.scroll-stack-card img')].map(i=>i.naturalWidth+'x'+i.naturalHeight+' css:'+Math.round(i.getBoundingClientRect().height)),
   cardOffsetH: cards.map(c=>c.offsetHeight),
   cardDocTop: cards.map(c=>top(c)),
   endDocTop: top(end), secTop: top(sec),
   footerTop: top(document.getElementById('contact'))
 };})())`;
const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true});
console.log(JSON.stringify(r.result??r.exceptionDetails,null,1));
ws.close();
