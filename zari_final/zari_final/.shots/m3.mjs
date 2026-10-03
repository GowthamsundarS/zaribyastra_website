const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:process.argv[2]||"http://localhost:5174/"});
await new Promise(r=>setTimeout(r,4000));
const expr=`JSON.stringify((()=>{
 const inner=document.querySelector('.scroll-stack-inner');
 const cs=getComputedStyle(inner);
 const cards=[...document.querySelectorAll('.scroll-stack-card')];
 const end=document.querySelector('.scroll-stack-end');
 return {
  hasSupport: CSS.supports('selector(:has(*))'),
  padding: cs.paddingTop+' / '+cs.paddingBottom+' / '+cs.paddingLeft,
  innerH: Math.round(inner.getBoundingClientRect().height),
  scrollerOverflow: getComputedStyle(document.querySelector('.scroll-stack-scroller')).overflowY,
  endOffsetTop: end.offsetTop,
  cards: cards.map(c=>({offsetTop:c.offsetTop, offsetH:c.offsetHeight, mb:c.style.marginBottom, tr:c.style.transform}))
 };})())`;
const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true});
console.log(JSON.stringify(r.result??r.exceptionDetails,null,1));
ws.close();
