import fs from "node:fs";
const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)return console.log("EXC",r.exceptionDetails.exception?.description||"");return r.result?.result?.value;};
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send("Page.navigate",{url:"http://localhost:5174/collection?hap=1"});
await new Promise(r=>setTimeout(r,3000));
// instrument vibrate before any click
await ev(`(()=>{window.__vib=[];
  const proto = Object.getPrototypeOf(navigator) === Object.prototype ? Object.getPrototypeOf(navigator) : Navigator.prototype;
  try { Object.defineProperty(Navigator.prototype,'vibrate',{configurable:true,writable:true,value:(x)=>{window.__vib.push(x);return true;}}); } catch(e) { window.__vibErr=String(e); }
  return typeof navigator.vibrate;})()`);
const clickText = async (txt) => {
  const box = await ev(`(()=>{const want=${JSON.stringify(txt)}.toUpperCase();
    const els=[...document.querySelectorAll('button,a')];
    const el=els.find(e=>(e.innerText||'').trim().toUpperCase()===want)||els.find(e=>(e.innerText||'').trim().toUpperCase().includes(want));
    if(!el)return null; el.scrollIntoView({block:'center'});
    const r=el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,t:el.innerText.trim()});})()`);
  if(!box){console.log("NO BUTTON:",txt);return;}
  await new Promise(r=>setTimeout(r,500));
  const b=JSON.parse(box);
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:b.x,y:b.y,button:"left",clickCount:1});
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:b.x,y:b.y,button:"left",clickCount:1});
  await new Promise(r=>setTimeout(r,900));
  console.log("clicked:",b.t);
};
console.log("vibrate type:", await ev("typeof navigator.vibrate"), await ev("window.__vibErr||''"));
await clickText("Best Sellers");
console.log("after filter, vibrate calls:", await ev("JSON.stringify(window.__vib)"));
await ev("window.__vib=[];1");
await clickText("ADD TO CART");
console.log("after add-to-cart, vibrate calls:", await ev("JSON.stringify(window.__vib)"));
console.log("url now:", await ev("location.pathname"));
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:"http://localhost:5174/?hap=2"});
await new Promise(r=>setTimeout(r,2500));
await ev("window.scrollTo(0,document.body.scrollHeight);1");
await new Promise(r=>setTimeout(r,1200));
console.log("FOOTER:", await ev(`JSON.stringify({tel:(document.querySelector('a[href^="tel:"]')||{}).textContent, telHref:(document.querySelector('a[href^="tel:"]')||{}).href, wa:(document.querySelector('a[href*="wa.me"]')||{}).href})`));
fs.writeFileSync("haptic-footer.png", Buffer.from(((await send("Page.captureScreenshot",{format:"png"})).result||{}).data||"","base64"));
ws.close();
