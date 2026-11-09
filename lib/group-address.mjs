import {directAddress} from './direct-address.mjs';
import {groupCandidate} from './group-gate.mjs';

// Per-invocation context: never mutate the shared requireMention flag, and keep
// the original pipeline's fleet, permissions, dedup, rate limits and dispatch.
export function directAddressHandler(original,readPolicy,onMatched=()=>{}) {
  return async function(inbound) {
    const policy=readPolicy(inbound.groupId);
    const bot=String(this.ctx.selfId()||this.ctx.config.botQQ||'');
    if(!this.ctx.config.requireMention||!groupCandidate(inbound,policy,bot)||!directAddress(inbound.text||'',policy.aliases||[]))return original.call(this,inbound);
    const scoped=Object.create(this);
    scoped.ctx=Object.create(this.ctx);
    scoped.ctx.config={...this.ctx.config,requireMention:false};
    onMatched(inbound);
    return original.call(scoped,inbound);
  };
}
