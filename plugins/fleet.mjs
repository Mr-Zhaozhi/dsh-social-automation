import {heartbeat} from '../lib/fleet.mjs';
export const name='huohuo-fleet';
export function apply(ctx){let busy=false,closed=false;const tick=async()=>{if(busy||closed)return;busy=true;try{await heartbeat();}catch(e){ctx.logger.warn('双机协调：'+e.message);}finally{busy=false;}};ctx.effect(()=>{void tick();const t=setInterval(()=>void tick(),60000);return()=>{closed=true;clearInterval(t);};});}
