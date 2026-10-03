import fs from "node:fs";
const url=process.argv[2], scroll=+(process.argv[3]||0), shot=process.argv[4];
const t=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);let n=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id))p.get(m.id)(m);};
const send=(method,params={})=>new Promise(r=>{const i=++n;p.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async(expression)=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.error)return console.log("EVALERR",JSON.stringify(r.error));return r.result?.result?.value;};
await send("Page.enable");await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url});
await new Promise(r=>setTimeout(r,2500));
await ev(`(async()=>{const i=[...document.images];i.forEach(x=>x.loading='eager');await Promise.all(i.map(x=>x.complete?1:new Promise(r=>{x.onload=x.onerror=r;})));return 1})()`);
console.log(await ev(`(()=>{const cards=[...document.querySelectorAll('.scroll-stack-card')];const end=document.querySelector('.scroll-stack-end');
 const top=e=>Math.round(e.getBoundingClientRect().top+scrollY);
 const cs=getComputedStyle(document.querySelector('.scroll-stack-inner'));
 return JSON.stringify({vh:innerHeight,docH:document.body.scrollHeight,maxScroll:document.body.scrollHeight-innerHeight,
  innerPadBottom:cs.paddingBottom, endTop:top(end), cardDocTops:cards.map(top), cardH:cards.map(c=>Math.round(c.offsetHeight)),
  footTop:top(document.getElementById('contact')),
  predictedPinEnd:Math.round(top(end)-innerHeight/2)},null,1)})()`));
await ev(`window.scrollTo(0,${scroll});1`);
await new Promise(r=>setTimeout(r,900));
console.log("AT SCROLL",scroll,await ev(`(()=>{const c=[...document.querySelectorAll('.scroll-stack-card')];
 return JSON.stringify({actualScroll:Math.round(scrollY),tops:c.map(x=>Math.round(x.getBoundingClientRect().top)),bottoms:c.map(x=>Math.round(x.getBoundingClientRect().bottom))})})()`));
if(shot){const d=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(shot,Buffer.from((d.result??d).data,"base64"));console.log("shot",shot);}
ws.close();
