// Read the rendered publish button in its closed shadow root, then send a real pointer click.
export async function clickPublish(page){
 const host=page.locator('xhs-publish-btn');
 if(await host.count()!==1||await host.getAttribute('submit-text')!=='发布'||await host.getAttribute('submit-disabled')!=='false'||await host.getAttribute('submit-loading')==='true')throw new Error('发布按钮尚未就绪');
 const cdp=await page.context().newCDPSession(page);
 try{
  const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});let found;
  const visit=(n,inside=false)=>{inside||=n.localName==='xhs-publish-btn';if(inside&&n.localName==='button'&&n.children?.map(x=>x.nodeValue).join('')==='发布')found=n;for(const x of [...n.children||[],...n.shadowRoots||[]])visit(x,inside);};visit(root);
  if(!found)throw new Error('无法定位发布按钮');
  const attrs=Object.fromEntries(Array.from({length:found.attributes.length/2},(_,i)=>found.attributes.slice(i*2,i*2+2)));
  if('disabled' in attrs||attrs['aria-disabled']==='true')throw new Error('发布按钮禁用');
  const {model}=await cdp.send('DOM.getBoxModel',{nodeId:found.nodeId});const q=model.content,x=(q[0]+q[2]+q[4]+q[6])/4,y=(q[1]+q[3]+q[5]+q[7])/4;
  if(!await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='XHS-PUBLISH-BTN',{x,y}))throw new Error('发布按钮被遮挡');
  await page.mouse.click(x,y);
 }finally{await cdp.detach();}
}
