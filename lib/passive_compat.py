# -*- coding: utf-8 -*-
"""Pinned native seams for event-driven night replies; no profile/browser restart."""
import json
from runtime import HARNESS,WORKSPACE

def apply_passive_inbox():
 from compat import patch_file
 pkg=(HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local').resolve()
 if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('被动回复适配需要复核插件版本')
 service=pkg/'chat-service.mjs';browser=pkg/'chat-browser.mjs'
 uri=(WORKSPACE/'lib/passive-inbox.mjs').as_uri()
 policy=(WORKSPACE/'lib/inbox-policy.mjs').as_uri()
 patch_file(service,policy+'"',policy+'?v=2" // HUOHUO_PASSIVE_POLICY\n', 'HUOHUO_PASSIVE_POLICY')
 text=service.read_text()
 patch_file(service,text,'import {noteIncoming,chatCanPoll,runInboxPoll,passiveRecipient,passiveEnabled,clearPassive} from '+json.dumps(uri)+'; // HUOHUO_PASSIVE_IMPORT\n'+text,'HUOHUO_PASSIVE_IMPORT')
 patch_file(service,"    if (recipientId !== undefined) this.incomingPriority.add(recipientId);", "    noteIncoming(this,recipientId); // HUOHUO_PASSIVE_WAKE\n    if (recipientId !== undefined) this.incomingPriority.add(recipientId);",'HUOHUO_PASSIVE_WAKE')
 patch_file(service,"if(!huohuoInboxAllowed('douyin'))return false; // HUOHUO_INBOX_WAKE_HOURS","if(!chatCanPoll(this))return false; // HUOHUO_PASSIVE_REQUEST",'HUOHUO_PASSIVE_REQUEST')
 patch_file(service,"huohuoInboxAllowed('douyin') && typeof this.browser.subscribeIncoming", "passiveEnabled() && typeof this.browser.subscribeIncoming /* HUOHUO_PASSIVE_SUBSCRIBE */",'HUOHUO_PASSIVE_SUBSCRIBE')
 patch_file(service,'  async poll() {','  async poll() { return runInboxPoll(this,()=>this.pollInbox()); } // HUOHUO_PASSIVE_POLL\n  async pollInbox() {','HUOHUO_PASSIVE_POLL')
 patch_file(service,'[...this.policy.allowlist].sort(', '[...this.policy.allowlist].filter(c=>!passiveRecipient()||c.id===passiveRecipient()).sort( /* HUOHUO_PASSIVE_TARGET */','HUOHUO_PASSIVE_TARGET')
 patch_file(service,"if (typeof this.browser.unreadCounts === 'function')", "if (!passiveRecipient() && typeof this.browser.unreadCounts === 'function') /* HUOHUO_PASSIVE_NO_SCAN */",'HUOHUO_PASSIVE_NO_SCAN')
 patch_file(service,'  async processAutoBacklog(contact, mark, snapshot, messages, signal) {','  async processAutoBacklog(contact, mark, snapshot, messages, signal) {\n    if(passiveRecipient())return; // HUOHUO_PASSIVE_NO_OLD_BACKLOG','HUOHUO_PASSIVE_NO_OLD_BACKLOG')
 patch_file(service,'  stopPolling() {','  stopPolling() {\n    clearPassive(this); // HUOHUO_PASSIVE_CLEAR','HUOHUO_PASSIVE_CLEAR')
 media=(WORKSPACE/'lib/incoming-media.mjs').as_uri()
 patch_file(service,json.dumps(media),json.dumps(media+'?v=2')+' /* HUOHUO_PASSIVE_MEDIA */','HUOHUO_PASSIVE_MEDIA')
 old="await page.exposeBinding(this.incomingBinding, (source, id, recipientId) => { if (source.page === page && typeof id === 'string') this.incomingHandlers.get(id)?.(recipientId); });"
 new="""await page.exposeBinding(this.incomingBinding, async (source, id, recipientId) => {
            if(source.page!==page||typeof id!=='string')return;
            // HUOHUO_PASSIVE_CURRENT: selected chats often have no unread badge.
            if(recipientId==='current'){
              const identity=await page.evaluate(readChatIdentityDom);
              const matches=[...this.contacts.values()].filter(c=>recipients.has(c.id)&&sameWeakConversation(identity,c));
              if(matches.length!==1)return;recipientId=matches[0].id;
            }
            this.incomingHandlers.get(id)?.(recipientId);
          });"""
 patch_file(browser,old,new,'HUOHUO_PASSIVE_CURRENT')
 old='          const check = notify => {'
 new="""          // HUOHUO_PASSIVE_DOM: observe added incoming rows only; no timer scan/model call.
          const seenRows=new WeakSet();
          const captureRows=notify=>{
            let incoming=false;
            for(const node of document.querySelectorAll('[data-e2e="im-dialog"] [data-e2e="msg-item-content"],[data-e2e="im-dialog"] [data-e2e="message-content"],[data-e2e="im-dialog"] [data-testid="message-content"]')){
              if(seenRows.has(node))continue;seenRows.add(node);
              const root=node.closest('[data-e2e="im-dialog"]'),box=node.closest('[class*="messageMessageBoxmessageBox"],[data-e2e="message-row"]');
              const ancestors=[];for(let e=node;e&&e!==root;e=e.parentElement)ancestors.push(e);
              const outgoing=ancestors.some(e=>e.getAttribute('data-direction')==='outgoing'||e.getAttribute('data-is-self')==='true'||e.getAttribute('data-is-from-me')==='true'||[...e.classList].some(t=>/(?:^|[_-]|Content|Box)isFromMe(?:[_-]|$)/i.test(t)));
              const knownIncoming=ancestors.some(e=>e.getAttribute('data-direction')==='incoming'||e.getAttribute('data-is-self')==='false'||e.getAttribute('data-is-from-me')==='false')||box?.classList.contains('messageMessageBoxmessageBox');
              if(!outgoing&&knownIncoming)incoming=true;
            }
            if(notify&&incoming&&entries[currentToken])void window[binding]?.(currentToken,'current').catch(()=>{});
          };
          const check = notify => {
            captureRows(notify);"""
 patch_file(browser,old,new,'HUOHUO_PASSIVE_DOM')
 text=browser.read_text()
 patch_file(browser,text,'import {confirmedOutgoing} from '+json.dumps((WORKSPACE/'lib/chat-receipt.mjs').as_uri())+'; // HUOHUO_LATE_RECEIPT_IMPORT\n'+text,'HUOHUO_LATE_RECEIPT_IMPORT')
 patch_file(browser,'        await page.mouse.click(finalPoint.clickX, finalPoint.clickY);','        const dispatchedAt=Date.now(); // HUOHUO_LATE_RECEIPT_TIME\n        await page.mouse.click(finalPoint.clickX, finalPoint.clickY);','HUOHUO_LATE_RECEIPT_TIME')
 patch_file(browser,"item.direction === 'outgoing' && item.text === message.trim() && item.arrivalClassification === 'new-tail' && !beforeIds.has(item.id) && item.serverConfirmed !== false",'confirmedOutgoing(item,{text:message,beforeIds,dispatchedAt}) /* HUOHUO_LATE_RECEIPT_MATCH */','HUOHUO_LATE_RECEIPT_MATCH')
 patch_file(service,'url:resolved.url,signal});','url:resolved.url,signal,browserConnection:this.browser.controller?.browser}); // HUOHUO_INCOMING_REUSE_CONNECTION','HUOHUO_INCOMING_REUSE_CONNECTION')
 patch_file(service,'frames:[...result.frames.slice(0,1),...observed.frames.slice(0,2)]','frames:observed.frames.length?observed.frames.slice(0,3):result.frames.slice(0,1) /* HUOHUO_INCOMING_FRAMES_FIRST */','HUOHUO_INCOMING_FRAMES_FIRST')
 patch_file(service,"const mediaMessages = [...incoming.filter(item=>item.media && !isMetadataMessage(item)), ...referenced];","const mediaMessages = [...incoming.filter(item=>item.media && !isMetadataMessage(item)), ...referenced].slice(-2).reverse(); // HUOHUO_INCOMING_LATEST_FIRST",'HUOHUO_INCOMING_LATEST_FIRST')
 patch_file(service,"message:'分享卡片没有可核对的画面或链接，跳过本次媒体观察，继续回复。'", "message:'分享卡片没有可核对的画面或链接，跳过本次媒体观察，继续回复。',reason:String(error.message||error).slice(0,250) /* HUOHUO_MEDIA_ERROR_REASON */",'HUOHUO_MEDIA_ERROR_REASON')
 patch_file(service,json.dumps(media+'?v=2'),json.dumps(media+'?v=3')+' /* HUOHUO_INCOMING_READY_V3 */','HUOHUO_INCOMING_READY_V3')
 patch_file(service,json.dumps(media+'?v=3'),json.dumps(media+'?v=4')+' /* HUOHUO_INCOMING_READY_V4 */','HUOHUO_INCOMING_READY_V4')
 return '抖音夜间仅由许可会话新消息唤醒，未读红点与当前会话双通道，保留暂停与每日额度'
if __name__=='__main__':print(apply_passive_inbox())
