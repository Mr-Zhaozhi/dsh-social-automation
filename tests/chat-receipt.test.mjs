import test from 'node:test';import assert from 'node:assert/strict';import {confirmedOutgoing} from '../lib/chat-receipt.mjs';
const now=Date.parse('2026-11-08T00:30:00+08:00'),options={text:'你好\n朋友',beforeIds:new Set(['old']),dispatchedAt:now-5000,now};
const row={direction:'outgoing',text:options.text,id:'new',arrivalClassification:'known-old-window',nativeServerMessageBound:true,serverConfirmed:true,nativeCreatedAt:new Date(now-4000).toISOString()};
test('server acknowledgment after pending row lost new-tail status can be confirmed',()=>{assert(confirmedOutgoing(row,options));assert(confirmedOutgoing({...row,arrivalClassification:'baseline'},options));assert(confirmedOutgoing({...row,arrivalClassification:'new-tail'},options));});
test('old, ambiguous, modified, incoming, failed, pending and non-server rows remain unconfirmed',()=>{
 for(const patch of [{id:'old'},{text:'别的话'},{direction:'incoming'},{failed:true},{pending:true},{serverConfirmed:false},{serverConfirmed:undefined},{nativeServerMessageBound:false},{nativeCreatedAt:new Date(now-60000).toISOString()},{nativeCreatedAt:new Date(now+60000).toISOString()},{nativeCreatedAt:'unknown'}])assert(!confirmedOutgoing({...row,...patch},options),JSON.stringify(patch));
});
