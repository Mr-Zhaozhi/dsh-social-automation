import {randomUUID} from 'node:crypto';
import {renderSharedContext,sharedContext} from './shared-context.mjs?v=life1';
import {meteredStream} from './model-usage.mjs';
export function parseModelJSON(value){
 const text=String(value).trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
 try{return JSON.parse(text);}catch{}
 // Some providers repeat the complete block after streaming its deltas.
 // Accept only identical complete JSON objects, never conflicting decisions.
 const values=[];let start=0,depth=0,quoted=false,escaped=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0){values.push(JSON.parse(text.slice(start,i+1).trim()));start=i+1;}}}
 if(values.length&&text.slice(start).trim()===''&&values.every(v=>JSON.stringify(v)===JSON.stringify(values[0])))return values[0];
 throw new Error('模型没有返回唯一完整的 JSON 决策');
}
export async function modelJSON(ctx,system,data,{tokens=500,timeout=30000,session='huohuo-companion',context,images=[],recordUsage,useSharedContext=true}={}){
 const selection=ctx.agentDefaultModel.currentSelection();if(!selection?.provider||!selection?.model)throw new Error('模型尚未就绪');
 const signal=AbortSignal.timeout(timeout),info=await ctx.llm.resolveModelInfo(selection.provider,selection.model,signal),options=info?.reasoning?.efforts?.some(e=>e.id==='off')?{reasoningEffort:'off'}:{};
 const imageParts=[];for(const frame of images.slice(0,3)){if(!/^image\/(jpeg|png|webp)$/.test(frame.mimeType)||typeof frame.data!=='string'||Buffer.byteLength(frame.data,'base64')>2_000_000)throw new Error('入站画面无效');imageParts.push({type:'image',attachment:await ctx.get('attachments').saveImage({data:Buffer.from(frame.data,'base64'),mediaType:frame.mimeType,name:'incoming-work.jpg'})});}
 let text='',finish;const blocks=new Map();
 const route=context||sharedContext.route('activity',session,{publicChat:true});
 const shared=useSharedContext?renderSharedContext(route,{query:JSON.stringify(data).slice(-1200)}):'';
 for await(const c of meteredStream(ctx,{...selection,...options,system,signal,maxTokens:tokens,sessionId:session,messages:[{id:randomUUID(),role:'user',content:[...(shared?[{type:'text',text:shared}]:[]),{type:'text',text:JSON.stringify(data)},...imageParts],source:{kind:'plugin',plugin:'huohuo-companion',form:'snapshot',sections:[]}}]},{record:recordUsage})){
  const index=c.index??0;
  if(c.type==='text-delta')blocks.set(index,(blocks.get(index)||'')+c.text);
  if(c.type==='block-end'&&c.block?.type==='text')blocks.set(index,c.block.text);
  text=[...blocks.values()].join('');if(c.type==='finish')finish=c.reason;if(text.length>6000)throw new Error('模型输出过长');
 }
 if(finish?.kind!=='stop')throw new Error('模型回答未完整结束');return parseModelJSON(text);
}
