// Read-only CDP handshake: never open/activate/navigate a tab.
const url=process.argv[2];
try{
 const r=await fetch(new URL('/json/version',url),{signal:AbortSignal.timeout(2500)});
 if(!r.ok)throw Error('version-unavailable');const version=await r.json();
 const result=await new Promise(resolve=>{
  const ws=new WebSocket(version.webSocketDebuggerUrl);let done=false;
  const finish=ok=>{if(done)return;done=true;clearTimeout(timer);ws.close();resolve(ok);};
  const timer=setTimeout(()=>finish(false),2500);
  ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Browser.getVersion'})));
  ws.addEventListener('error',()=>finish(false));ws.addEventListener('close',()=>finish(false));
  ws.addEventListener('message',e=>{try{const d=JSON.parse(String(e.data));if(d.id===1)finish(Boolean(d.result?.product));}catch{finish(false);}});
 });
 console.log(JSON.stringify({ok:result}));process.exit(result?0:1);
}catch{console.log(JSON.stringify({ok:false}));process.exit(1);}
