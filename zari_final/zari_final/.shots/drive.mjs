import fs from "node:fs";
const URL_ = process.argv[2] ?? "http://localhost:5173/";
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
const shots=JSON.parse(process.argv[3]??"[]");
for(const s of shots){
  if(s.scrollTo!==undefined) await ev(`window.scrollTo(0,${s.scrollTo});true`);
  if(s.wheel) for(let k=0;k<s.wheel.steps;k++){
    await send("Input.dispatchMouseEvent",{type:"mouseWheel",x:720,y:450,deltaX:0,deltaY:s.wheel.by});
    await sleep(s.wheel.settle??120);
  }
  if(s.click) {
    const box = await ev(`(()=>{const a=document.querySelector(${JSON.stringify(s.click)});if(!a)return null;const r=a.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`);
    if(!box){console.log("MISS",s.click);continue;}
    const {x,y}=JSON.parse(box);
    await send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});
    await send("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1});
    console.log("click",s.click,"@",Math.round(x),Math.round(y));
  }
  await sleep(s.wait??1200);
  if(s.shot){
    const d=await send("Page.captureScreenshot",{format:"png"});
    const b64 = d.result?.data ?? d.data; if(!b64){console.log("SHOTFAIL",JSON.stringify(d).slice(0,300));continue;} fs.writeFileSync(s.shot, Buffer.from(b64,"base64"));
    console.log("shot",s.shot,"scrollY=",await ev("Math.round(window.scrollY)"),"url=",await ev("location.pathname"));
  }
  if(s.dump) console.log("DUMP",s.dump,"=>",JSON.stringify(await ev(s.dump)));
}
ws.close();
