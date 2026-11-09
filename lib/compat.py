"""Small pinned compatibility patch, re-applied by setup after plugin installation."""
import hashlib,json,shutil
from runtime import HARNESS,STATE,WORKSPACE,ffmpeg

def apply_audio():
 pkg=HARNESS/'profiles/web/node_modules/dsh-any-audio'
 if not pkg.exists():return 'AnyAudio 未安装，跳过'
 version=json.loads((pkg/'package.json').read_text())['version']
 source=pkg.resolve()/'src/tools/tts.js';text=source.read_text()
 index=pkg.resolve()/'src/index.js';entry=index.read_text()
 old="ctx.inject(['webServer'], (sctx) => registerAnyAudioRoutes(sctx, { log }))"
 new="ctx.inject(['webServer'], (sctx) => { const { dispose } = registerAnyAudioRoutes(sctx, { log }); return dispose }) // HUOHUO_DISPOSE_FIX"
 if old in entry and version=='0.1.1':
  backup=STATE/'vendor-backups';backup.mkdir(parents=True,exist_ok=True)
  shutil.copy2(index,backup/('anyaudio-index-'+hashlib.sha256(entry.encode()).hexdigest()[:12]+'.js'))
  index.write_text(entry.replace(old,new))
 marker='HUOHUO_QQ_VOICE_GUARD'
 if marker in text:return 'AnyAudio QQ 通用音色入口已禁用'
 if version!='0.1.1':return 'AnyAudio 版本变化，QQ 通用音色防护需重新核对；固定语音脚本仍生效'
 needle='  async execute(args, exec) {\n'
 if text.count(needle)!=1:raise RuntimeError('AnyAudio 结构改变，未修改第三方代码')
 guard='''    // HUOHUO_QQ_VOICE_GUARD: QQ must use the configured cloned voice queue.
    if (String(exec?.agent?.session?.id ?? '').startsWith('onebot-')) {
      throw new Error('QQ 语音请用工作区 ./say.sh --bg，使用配置的克隆音色；禁止用通用配音替代。')
    }
'''
 backup=STATE/'vendor-backups';backup.mkdir(parents=True,exist_ok=True)
 shutil.copy2(source,backup/('anyaudio-tts-'+hashlib.sha256(text.encode()).hexdigest()[:12]+'.js'))
 source.write_text(text.replace(needle,needle+guard));return '已阻止 QQ 会话调用 AnyAudio 通用配音；其他工作区保留原功能'
def patch_file(source, old, new, marker):
 text=source.read_text()
 if marker in text:return
 if text.count(old)!=1:raise RuntimeError('插件结构改变，未修改：'+source.name)
 backup=STATE/'vendor-backups';backup.mkdir(parents=True,exist_ok=True)
 shutil.copy2(source,backup/(source.stem+'-'+hashlib.sha256(text.encode()).hexdigest()[:12]+source.suffix))
 source.write_text(text.replace(old,new))

def apply_group():
 pkg=HARNESS/'profiles/web/node_modules/dsh-onebot-qq'
 if not pkg.exists():return 'OneBot 未安装'
 if json.loads((pkg/'package.json').read_text())['version']!='0.9.17':raise RuntimeError('OneBot 版本变化，需要核对群接话适配')
 source=pkg.resolve()/'lib/inbound.js'
 apply_member_prompt(pkg.resolve())
 text=source.read_text(); marker='// HUOHUO_GROUP_WAKE'
 old="        if (kind === 'group' && this.ctx.config.requireMention && !mentioned) {"
 new="""        // HUOHUO_GROUP_WAKE: only configured groups; keep all original policy gates.
        if (kind === 'group' && this.ctx.config.requireMention && !mentioned) {
            const { groupWake } = await import(HUOHUO_GROUP_MODULE);
            mentioned = await groupWake(inbound, this.ctx);
        }
""".replace('HUOHUO_GROUP_MODULE',json.dumps((WORKSPACE/'lib/group-gate.mjs').as_uri()))+old
 patch_file(source,old,new,marker)
 controls=json.dumps((WORKSPACE/'lib/companion-policy.mjs').as_uri())
 patch_file(source,"        let mentioned = detectMention(inbound.segments, inbound.raw, this.ctx.selfId(), this.ctx.config.botQQ);",f'''        // HUOHUO_COMPANION_CONTROL: only authenticated owner DMs can change preferences.
        const {{observeMessage,ownerControl}}=await import({controls});
        observeMessage(inbound);
        if(await ownerControl(inbound,this.ctx))return;
        let mentioned = detectMention(inbound.segments, inbound.raw, this.ctx.selfId(), this.ctx.config.botQQ);''','HUOHUO_COMPANION_CONTROL')
 patch_file(source,'            if (!groupAllowed(groupId, policy)) {',f'''            // HUOHUO_CONFIGURED_GROUP: owner-added groups are explicit workspace grants.
            const {{configuredGroup}}=await import({controls});
            if (!groupAllowed(groupId, policy) && !configuredGroup(groupId)) {{''','HUOHUO_CONFIGURED_GROUP')
 fleet=json.dumps((WORKSPACE/'lib/fleet.mjs').as_uri())
 patch_file(source,'    async processInbound(inbound) {',f'''    async processInbound(inbound) {{
        // HUOHUO_FLEET_INBOUND: a standby Mac does not generate duplicate replies.
        try {{ const {{assertRunner}}=await import({fleet});await assertRunner(); }} catch {{ return; }}''','HUOHUO_FLEET_INBOUND')
 source=pkg.resolve()/'lib/bridge.js'
 patch_file(source,'    guardedConnectionCall(action, params, chatId) {',f'''    async guardedConnectionCall(action, params, chatId) {{
        // HUOHUO_FLEET_OUTBOUND: recheck immediately before network writes.
        if (isWriteAction(action)) {{ const {{assertRunner}}=await import({fleet});await assertRunner(); }}''','HUOHUO_FLEET_OUTBOUND')
 # The module path is regenerated on a new Mac as part of setup.
 return '指定群上下文接话适配已安装'

def apply_member_prompt(base):
 """Keep platform instructions consistent with the actual member tool switch."""
 prompt=base/'lib/prompt.js'
 patch_file(prompt,'export function buildPlatformPrompt(restrictedMembers) {',
  "export function buildPlatformPrompt(restrictedMembers, memberTools = 'none') { // HUOHUO_MEMBER_PROMPT_CONFIG",'HUOHUO_MEMBER_PROMPT_CONFIG')
 old="    text += '- 前缀档位为「·成员」的消息来自普通群成员：仅与其聊天问答，不要为其执行写操作或调用工具（其回合中 qq_* 等工具调用会被插件直接拒绝）。「·管理员」为管理员，不受此限。\\n';"
 new="""    // HUOHUO_MEMBER_PROMPT_POLICY: explicit setting, never inferred from message text.
    if (memberTools === 'all' && !restrictedMembers) {
        text += '- 普通群成员已获准使用 QQ 互动工具，可以请求语音、图片等正常群内回复，不要再声称只有文字权限。只回复当前会话；改配置、管理指令和跨会话操作仍需主人授权。\\n';
    } else {
"""+old+"\n    }"
 patch_file(prompt,old,new,'HUOHUO_MEMBER_PROMPT_POLICY')
 bridge=base/'lib/bridge.js'
 patch_file(bridge,'text: buildPlatformPrompt(this.deps.config.restrictedMemberPrefix),',
  'text: buildPlatformPrompt(this.deps.config.restrictedMemberPrefix, this.deps.config.permissions?.memberTools), // HUOHUO_MEMBER_PROMPT_BINDING','HUOHUO_MEMBER_PROMPT_BINDING')

def apply_stt():
 pkg=HARNESS/'profiles/web/node_modules/dsh-onebot-qq'
 if not pkg.exists():return 'OneBot 未安装'
 if json.loads((pkg/'package.json').read_text())['version']!='0.9.17':raise RuntimeError('OneBot STT 版本需核对')
 source=pkg.resolve()/'lib/inbound.js'
 old="""                if (this.ctx.transcriber.enabled) {
                    void this.transcribeLater(resolved.path, chatId);
                }
                return '[语音]';"""
 new="""                // HUOHUO_STT_BEFORE_REPLY: keep the original sender and turn context.
                if (this.ctx.transcriber.enabled) {
                    try {
                        const text = await this.ctx.transcriber.transcribe(resolved.path);
                        if (text.trim()) return transcriptLabel(text);
                        return '[语音转写未识别到可理解内容，请简短请对方重说，不猜测]';
                    } catch (error) {
                        this.ctx.log('warn', 'STT failed: ' + describeError(error));
                        return '[语音转写失败，请简短告知本次未听清，不声称没有语音权限]';
                    }
                }
                return '[语音转写未启用]';"""
 patch_file(source,old,new,'HUOHUO_STT_BEFORE_REPLY')
 return 'QQ 来声先转写再回答，保留原发送者上下文'

def apply_comments():
 pkg=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
 if not pkg.exists():return '抖音插件未安装'
 if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('抖音插件版本变化，需要核对评论人设')
 source=pkg.resolve()/'public-comment-agent.mjs'
 patch_file(source,'你是大肥鱼，一个 AI 助手。','你是小伴，一个直爽、爱吐槽但友善的 AI 女生。公开评论保持简短俏皮，不说教、不硬夸、不提私聊或主人资料。','你是小伴，一个直爽')
 source=pkg.resolve()/'core.mjs'
 old="""  async settle(signal, {kind='recommend',videoId}={}) {
    for (let i=0;i<=60;i++) {"""
 new="""  async settle(signal, {kind='recommend',videoId}={}) {
    // HUOHUO_LATE_RECOMMEND: the SPA may redirect after DOMContentLoaded.
    let selectedRecommend = false;
    for (let i=0;i<=60;i++) {
      if(kind==='recommend' && !selectedRecommend && this.page.url().includes('/jingxuan')) {
        const recommendation=this.page.locator('a').filter({hasText:/^推荐$/});
        if(await recommendation.count()===1 && await recommendation.isVisible()) {
          await recommendation.click(); selectedRecommend=true;
          await this.page.evaluate(name => { window.name=name; }, browserPageLabel(this.source));
        }
      }"""
 patch_file(source,old,new,'HUOHUO_LATE_RECOMMEND')
 return '公开评论已使用小伴人设'

def apply_social():
 pkg=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
 if not pkg.exists():return '抖音插件未安装'
 if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('抖音插件版本变化，需要核对发送预算适配')
 base=pkg.resolve();uri=json.dumps((WORKSPACE/'lib/social-budget.mjs').as_uri())
 focus=json.dumps((WORKSPACE/'lib/browser-focus.mjs').as_uri())
 patch_file(base/'chat-browser.mjs','  async isForeground(page) {',f'''  async isForeground(page) {{
    // HUOHUO_NATIVE_FOCUS: emulated focus is not evidence that Edge is frontmost.
    const {{dedicatedBrowserForeground}}=await import({focus});
    if(await dedicatedBrowserForeground()===false)return false;''','HUOHUO_NATIVE_FOCUS')
 patch_file(base/'chat-browser.mjs','    if(await dedicatedBrowserForeground()===false)return false;',f'''    if(await dedicatedBrowserForeground()===false)return false;
    // HUOHUO_CHAT_ACTIVE_INPUT: an idle managed tab is not perpetual human use.
    const {{managedChatInteraction}}=await import({focus});
    const activeInput=await managedChatInteraction(page);
    if(activeInput!==null)return activeInput;''','HUOHUO_CHAT_ACTIVE_INPUT')
 patch_file(base/'chat-browser.mjs',"    if (typeof message !== 'string' || !message.trim() || [...message].length > 1000) return Promise.reject(new TypeError('发送内容须为 1 到 1000 字的非空文字。'));", """    if (typeof message !== 'string' || !message.trim() || [...message].length > 1000) return Promise.reject(new TypeError('发送内容须为 1 到 1000 字的非空文字。'));
    // HUOHUO_CHAT_LINEBREAKS: the live rich editor collapses empty paragraphs.
    message = message.replace(/\\r\\n?/g, '\\n').replace(/\\n{2,}/g, '\\n');""",'HUOHUO_CHAT_LINEBREAKS')
 patch_file(base/'chat-agent.mjs','      const text = normalizeChatReplyText(output.text);',"      const text = normalizeChatReplyText(output.text).replace(/\\r\\n?/g, '\\n').replace(/\\n{2,}/g, '\\n'); // HUOHUO_CHAT_PARAGRAPHS",'HUOHUO_CHAT_PARAGRAPHS')
 patch_file(base/'chat-browser.mjs',"if (readableDraft(await editor.innerText()) || await editor.locator('img,video,audio,[data-slate-void=\"true\"]').count()) throw new Error('当前会话已有草稿，已停止发送以保留原内容。');", "if (readableDraft(await editor.innerText()) || await editor.locator('img,video,audio,[data-slate-void=\"true\"]').count()) return {confirmed:false,deliveryUncertain:false,failureCode:'CHAT_USER_DRAFT_PRESENT',failureStage:'draft'}; // HUOHUO_DRAFT_NOT_SENT",'HUOHUO_DRAFT_NOT_SENT')
 patch_file(base/'chat-agent.mjs','日常打招呼先亲近自然地接话，不以', 'HUOHUO_WARM_GREETING：对方只发嗨、在吗等短招呼，也友好接住，可以说自己正在做的小事或接上一句轻松的话。不评价对方字数少，不说“就喊一声？”“这么短？”“然后呢？”，不逼对方找话题。日常打招呼先亲近自然地接话，不以','HUOHUO_WARM_GREETING')
 patch_file(base/'chat-browser.mjs',"          const data = own(own(audioChild, 'props'), 'data');", """          // HUOHUO_VOICE_CUSTOM_BUBBLE: fixed rendered child path for the new bubble wrapper.
          const inner = own(own(own(audioChild, 'props'), 'children'), '0');
          const wrappedAudio = own(own(own(inner, 'props'), 'children'), '1');
          const data = own(own(audioChild, 'props'), 'data') || own(own(wrappedAudio, 'props'), 'data');""",'HUOHUO_VOICE_CUSTOM_BUBBLE')
 browse=json.dumps((WORKSPACE/'lib/watch-budget.mjs').as_uri())
 patch_file(base/'video-limits.mjs',"import fs from 'node:fs';",f"import {{nativeBrowseAllowance}} from {browse}; // HUOHUO_SHARED_BROWSE_IMPORT\nimport fs from 'node:fs';",'HUOHUO_SHARED_BROWSE_IMPORT')
 patch_file(base/'video-limits.mjs',"    const expiresAt=window?window.expiresAt:null,session=", """    // HUOHUO_SHARED_BROWSE_GATE: one chosen platform, a combined daily clock.
    const shared=nativeBrowseAllowance(usedSeconds,{date});
    if(!reason&&!shared.allowed){reason=shared.reason;reasonCode='shared-browse';}
    const expiresAt=window?Math.min(window.expiresAt??Infinity,now+shared.remainingSeconds*1000):null,session=""",'HUOHUO_SHARED_BROWSE_GATE')
 fleet=json.dumps((WORKSPACE/'lib/fleet.mjs').as_uri())
 patch_file(base/'core.mjs','  execute(name, args = {}, { signal, humanAuthorized = false, autonomousRunId, expectedVideoId, sharedCaptureMode } = {}) {',f'''  async execute(name, args = {{}}, {{ signal, humanAuthorized = false, autonomousRunId, expectedVideoId, sharedCaptureMode }} = {{}}) {{
    // HUOHUO_FLEET_BROWSER: only the current automation owner controls the feed.
    if (!['douyin_status','douyin_diagnostics','douyin_pause'].includes(name)) {{ const {{assertRunner}}=await import({fleet});await assertRunner(); }}''','HUOHUO_FLEET_BROWSER')
 patch_file(base/'core.mjs','    const definition = TOOL_DEFINITIONS.find(tool=>tool.name===name);',f'''    // HUOHUO_FLEET_WATCH: a day's watch clock belongs to one Mac.
    if (['douyin_play','douyin_observe','douyin_next','douyin_previous'].includes(name)) {{ const {{assertWatcher}}=await import({fleet});await assertWatcher('douyin'); }}
    const definition = TOOL_DEFINITIONS.find(tool=>tool.name===name);''','HUOHUO_FLEET_WATCH')
 patch_file(base/'interaction-status.mjs','不限制人数或回复、分享次数。','按主人授权选择对象，私信与私聊分享合计每天最多15条。','私信与私聊分享合计每天最多15条。')
 patch_file(base/'outbound-send.mjs','      const delivery = await callback();',f'''      // HUOHUO_OUTBOUND_BUDGET: replies, greetings and private video shares share 15/day.
      const {{socialBudget}}=await import({uri});
      const delivery = await socialBudget.run('douyin','private',recipientId,callback,this.ledger().receipts);''','HUOHUO_OUTBOUND_BUDGET')
 patch_file(base/'chat-service.mjs','    if (!this.running) return;\n',f'''    if (!this.running) return;
    // HUOHUO_CHAT_DAILY_PAUSE: no model calls after the budget is used; resumes next Beijing day.
    const {{socialBudget}}=await import({uri});
    if(socialBudget.remaining('douyin','private')<=0)return;
''','HUOHUO_CHAT_DAILY_PAUSE')
 source=base/'chat-service.mjs';content=source.read_text()
 if 'HUOHUO_CHAT_DAILY_UI' not in content:
  updated=f'import {{socialBudget as huohuoBudget}} from {uri}; // HUOHUO_CHAT_DAILY_UI\n'+content.replace('policy: this.policy, daily:', 'policy: {...this.policy,dailyReplyLimit:15}, daily:').replace('limit: null, remaining: null },contacts',"limit: 15, remaining: huohuoBudget.remaining('douyin','private'), sentOrReserved:15-huohuoBudget.remaining('douyin','private') },contacts")
  patch_file(source,content,updated,'HUOHUO_CHAT_DAILY_UI')
 # Reuse the installed local ASR for native incoming Douyin voice attachments.
 media=base/'media/index.mjs';source=media.read_text()
 if 'HUOHUO_SHARED_ASR' not in source:
  updated=source.replace("run(runtime.python,[path.join(ROOT,'local_whisper.py')", "run("+json.dumps(str(WORKSPACE/'.runtime/stt-venv/bin/python'))+",["+json.dumps(str(WORKSPACE/'lib/douyin-stt.py')))
  if updated==source:raise RuntimeError('抖音本地转写入口结构已变化')
  patch_file(media,source,'// HUOHUO_SHARED_ASR: shared SenseVoice CPU runtime.\n'+updated,'HUOHUO_SHARED_ASR')
 patch_file(media,"    const paths = resolveRuntimePaths();",f"""    // HUOHUO_MAC_MEDIA_RUNTIME: bundled executable paths also work without Homebrew PATH.
    config.DOUYIN_MEDIA_PYTHON ||= {json.dumps(str(WORKSPACE/'.runtime/stt-venv/bin/python'))};
    config.DOUYIN_MEDIA_FFMPEG ||= {json.dumps(ffmpeg())};
    config.DOUYIN_MEDIA_FFPROBE ||= {json.dumps(str(WORKSPACE/'.runtime/bin/ffprobe'))};
    const paths = resolveRuntimePaths();""",'HUOHUO_MAC_MEDIA_RUNTIME')
 patch_file(media,"model: runtime.config.DOUYIN_MEDIA_WHISPER_MODEL || 'tiny', note:","model: 'SenseVoiceSmall-int8', note:",'SenseVoiceSmall-int8')
 patch_file(base/'core.mjs',"    for(let i=0;i<40;i++) {\n      await wait(300,signal); after=await this.state();", "    // HUOHUO_SWITCH_SETTLE: slow SPA navigation needs up to 30 seconds; never reclick.\n    for(let i=0;i<100;i++) {\n      await wait(300,signal); after=await this.state();",'HUOHUO_SWITCH_SETTLE')
 progress=json.dumps((WORKSPACE/'lib/video-progress.mjs').as_uri())
 patch_file(base/'autonomous-watch.mjs','        const sampleStartedAt = this.now();',f"""        // HUOHUO_VIDEO_PROGRESS: looping/stay decisions cannot spend every request on one clip.
        const {{VideoProgress,advanceVideo}}=await import({progress});
        this.huohuoProgress ??= new VideoProgress();
        const progressId=(current.state||current).video?.id;
        if(this.huohuoProgress.observe(progressId,this.now())){{
          current=await advanceVideo((...args)=>this.execute(...args),progressId);
          this.onEvent({{type:'watch.progress',message:'同一作品观察已足够，已验证切换下一条'}});
          continue;
        }}
        const sampleStartedAt = this.now();""",'HUOHUO_VIDEO_PROGRESS')
 source=base/'comment-browser.mjs'
 old='  async post({ expectedVideoId, text, ...extra } = {}, { signal: parentSignal, authorize, autonomousRunId } = {}) {'
 new=f'''  // HUOHUO_COMMENT_BUDGET: manual and autonomous comments share one daily cap.
  async post(args={{}}, options={{}}) {{
    const {{socialBudget}}=await import({uri});
    const history=this.receipts().operations.map(x=>({{date:new Intl.DateTimeFormat('en-CA',{{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}}).format(new Date(x.startedAt))}}));
    return socialBudget.run('douyin','comment',args.expectedVideoId,()=>this.postUnbudgeted(args,options),history);
  }}
'''+old.replace('async post(','async postUnbudgeted(')
 patch_file(source,old,new,'HUOHUO_COMMENT_BUDGET')
 source=base/'autonomous-comments.mjs';text=source.read_text()
 if 'HUOHUO_COMMENT_LIMIT_100' not in text:
  updated=text.replace('dailyLimit > 20','dailyLimit > 100').replace('perSessionLimit > 3','perSessionLimit > 100').replace('每日 1 至 20 次和单轮 1 至 3 次','每日 1 至 100 次和单轮 1 至 100 次')
  if updated==text:raise RuntimeError('评论上限结构已变化')
  patch_file(source,text,'// HUOHUO_COMMENT_LIMIT_100\n'+updated,'HUOHUO_COMMENT_LIMIT_100')
 for name in ['chat-agent.mjs','spark-agent.mjs']:
  source=base/name;text=source.read_text()
  if 'HUOHUO_CHAT_PERSONA' not in text:
   updated=text.replace('大肥鱼','小伴').replace('const PROMPT = `','const PROMPT = `日常打招呼先亲近自然地接话，不以“有事？”“有事直说”“找我什么事”盘问。对方闲聊本身就值得回应，不逼问任务。\n')
   patch_file(source,text,'// HUOHUO_CHAT_PERSONA\n'+updated,'HUOHUO_CHAT_PERSONA')
 return '抖音所有私信/私聊分享合计15条、所有评论合计100次/日的硬预算已安装'

def apply_shared_context():
 module=json.dumps((WORKSPACE/'lib/shared-context.mjs').as_uri())
 pkg=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
 if pkg.exists():
  if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('抖音共享上下文适配需核对新版本')
  service=pkg.resolve()/'chat-service.mjs'
  # Two generation paths, both carry a verified stable peer ID, never a display-name identity.
  text=service.read_text()
  old='conversation: { displayName: contact.name, isGroup: contact.isGroup }'
  if 'HUOHUO_CONTEXT_PEER' not in text:
   if text.count(old)!=2:raise RuntimeError('抖音联系人调用结构变化')
   for i in range(2):
    text=text.replace(old,'conversation: { id: contact.id, displayName: contact.name, isGroup: contact.isGroup } /* HUOHUO_CONTEXT_PEER */',1)
   backup=STATE/'vendor-backups';backup.mkdir(parents=True,exist_ok=True)
   shutil.copy2(service,backup/('chat-service-context-'+hashlib.sha256(service.read_bytes()).hexdigest()[:12]+'.mjs'))
   service.write_text(text)
  agent=pkg.resolve()/'chat-agent.mjs'
  patch_file(agent,'    const timeout = new AbortController();',f'''    // HUOHUO_SHARED_CONTEXT: history is data, appended after the stable persona.
    if (!observingVideo && conversation?.id) {{
      const {{sharedContext,socialContext,rememberSocial,renderSharedContext}}=await import({module});
      const route=socialContext('douyin',conversation.id,{{publicChat:conversation.isGroup===true}});
      for (const m of messages) if(m.sender==='incoming'&&m.id) rememberSocial(route,{{id:m.id,text:m.text||mediaObservations.find(o=>o.messageId===m.id)?.transcription?.text||'',role:'user'}});
      const shared=renderSharedContext(route,{{query:messages.at(-1)?.text||''}});
      if(shared)content.push({{role:'user',content:shared}});
    }}
    const timeout = new AbortController();''','HUOHUO_SHARED_CONTEXT')
  patch_file(service,"    this.log('reply.sent', { recipientId: contact.id,",f'''    // HUOHUO_SHARED_SENT: only record a platform-confirmed send.
    try {{ const {{socialContext,rememberSocial}}=await import({module});rememberSocial(socialContext('douyin',contact.id,{{publicChat:contact.isGroup===true}}),{{id:delivery.messageId,role:'assistant',text:imageDelivered?'[已发送表情图片]':reply.text,status:'confirmed'}}); }} catch {{}}
    this.log('reply.sent', {{ recipientId: contact.id,''','HUOHUO_SHARED_SENT')
 wechat=HARNESS/'profiles/web/node_modules/dsh-wechat'
 if wechat.exists():
  if json.loads((wechat/'package.json').read_text())['version']!='0.16.1':raise RuntimeError('微信上下文适配需核对新版本')
  source=wechat.resolve()/'dist/bridge/bridge.js'
  patch_file(source,'    async handleSendWeChat(agentId, args) {\n        const user = this.resolveUserForAgent(agentId);',
   '    async handleSendWeChat(agentId, args) {\n        // HUOHUO_WECHAT_EXACT_TARGET: shared memory does not authorize cross-channel delivery.\n        const user = this.userForAgent(agentId);','HUOHUO_WECHAT_EXACT_TARGET')
 return '跨平台共享上下文与微信精确发送绑定已安装'

def apply_inbox_hours():
 module=json.dumps((WORKSPACE/'lib/inbox-policy.mjs').as_uri())
 control=json.dumps((WORKSPACE/'lib/chat-controls.mjs').as_uri())
 pkg=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
 if pkg.exists():
  if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('抖音检查时段补丁需核对版本')
  source=pkg.resolve()/'chat-service.mjs'
  text=source.read_text()
  patch_file(source,text,f'import {{inboxAllowed as huohuoInboxAllowed,assertInboxAllowed as huohuoInboxAssert}} from {module}; // HUOHUO_INBOX_HOURS_IMPORT\n'+text,'HUOHUO_INBOX_HOURS_IMPORT')
  if 'HUOHUO_PASSIVE_REQUEST' not in source.read_text():
   patch_file(source,'  requestPoll() {',"  requestPoll() {\n    if(!huohuoInboxAllowed('douyin'))return false; // HUOHUO_INBOX_WAKE_HOURS",'HUOHUO_INBOX_WAKE_HOURS')
  patch_file(source,'  async poll() {',"  async poll() {\n    if(!huohuoInboxAllowed('douyin'))return; // HUOHUO_INBOX_POLL_HOURS",'HUOHUO_INBOX_POLL_HOURS')
  patch_file(source,"    if (typeof this.browser.subscribeIncoming === 'function') {","    if (huohuoInboxAllowed('douyin') && typeof this.browser.subscribeIncoming === 'function') { // HUOHUO_INBOX_SUBSCRIBE_HOURS",'HUOHUO_INBOX_SUBSCRIBE_HOURS')
  patch_file(source,'      for (let contact of prioritized) {',"      for (let contact of prioritized) {\n        if(!huohuoInboxAllowed('douyin'))break; // HUOHUO_INBOX_CONTACT_HOURS",'HUOHUO_INBOX_CONTACT_HOURS')
  patch_file(source,'        const checkAuthorization=phase=>{signal.throwIfAborted();',"        const checkAuthorization=phase=>{huohuoInboxAssert('douyin');signal.throwIfAborted(); // HUOHUO_INBOX_SEND_HOURS\n",'HUOHUO_INBOX_SEND_HOURS')
  patch_file(source,"      if (!entered && error.beforeDelivery && error.code === 'OUTBOUND_BUSY') {","      if (error.beforeDelivery && (error.code === 'INBOX_RESTING' || !entered && error.code === 'OUTBOUND_BUSY')) { // HUOHUO_INBOX_PRESERVE_PENDING",'HUOHUO_INBOX_PRESERVE_PENDING')
  patch_file(source,'      delivery = await this.outbound.run({ recipientId: contact.id, purpose: \'reply\', signal }, async () => {',"      huohuoInboxAssert('douyin'); // HUOHUO_INBOX_BEFORE_DELIVERY\n      delivery = await this.outbound.run({ recipientId: contact.id, purpose: 'reply', signal }, async () => {",'HUOHUO_INBOX_BEFORE_DELIVERY')
  browser=pkg.resolve()/'chat-browser.mjs'
  patch_file(browser,"        const failureCode = precheckFailureCode ||", """        // HUOHUO_INBOX_CLEAN_UNSENT: propagate rest only with no click and cleared owned draft.
        const restError=error?.code==='INBOX_RESTING'?error:interrupt.signal.reason;
        if(!clicked&&draftCleanup==='cleared'&&restError?.code==='INBOX_RESTING')throw restError;
        const failureCode = precheckFailureCode ||""",'HUOHUO_INBOX_CLEAN_UNSENT')
  patch_file(browser,"      } catch {\n        if (!attempted && await cleanup().catch(() => false)) return unsent('CHAT_IMAGE_PRECHECK_REJECTED');\n        if (!staged && !attempted) return unsent('CHAT_IMAGE_PRECHECK_REJECTED');", """      } catch (error) {
        // HUOHUO_INBOX_IMAGE_UNSENT: only cleared, never-dispatched media can be deferred.
        if (!attempted && await cleanup().catch(() => false)) {if(error?.code==='INBOX_RESTING')throw error;return unsent('CHAT_IMAGE_PRECHECK_REJECTED');}
        if (!staged && !attempted) {if(error?.code==='INBOX_RESTING')throw error;return unsent('CHAT_IMAGE_PRECHECK_REJECTED');}""",'HUOHUO_INBOX_IMAGE_UNSENT')
  friend=pkg.resolve()/'friend-interactions.mjs'
  patch_file(friend,'  async apply() {',f'''  async apply() {{
    // HUOHUO_INBOX_AUTOSTART_HOURS: keep settings and queues; resume on next timer.
    const {{inboxAllowed}}=await import({module});
    if(!inboxAllowed('douyin')){{this.status='resting';this.lastError='';return;}}''','HUOHUO_INBOX_AUTOSTART_HOURS')
 wechat=HARNESS/'profiles/web/node_modules/dsh-wechat'
 if wechat.exists():
  if json.loads((wechat/'package.json').read_text())['version']!='0.16.1':raise RuntimeError('微信聊天设置入口需核对版本')
  source=wechat.resolve()/'dist/bridge/bridge.js'
  patch_file(source,'        const text = extractText(msg.item_list);\n        // Slash commands whose meaning',f'''        const text = extractText(msg.item_list);
        // HUOHUO_OWNER_CHAT_CONTROLS: only verified owner plain messages, never quotes.
        const {{handleOwnerChat}}=await import({control});
        if (await handleOwnerChat({{platform:'wechat',peer:userId,text,quoted:(msg.item_list||[]).some(i=>i.ref_msg)||((msg.item_list||[]).length!==1)}},{{send:reply=>this.sendReply(userId,reply)}}))return;
        // Slash commands whose meaning''','HUOHUO_OWNER_CHAT_CONTROLS')
 return '主动检查10点至24点及QQ微信聊天控制已接入'

def apply_meme_delivery():
 module=json.dumps((WORKSPACE/'lib/meme-library.mjs').as_uri())
 meme=HARNESS/'profiles/web/node_modules/dsh-meme'
 if meme.exists():
  if json.loads((meme/'package.json').read_text())['version']!='0.1.78':raise RuntimeError('表情插件版本变化需核对渠道适配')
  source=meme.resolve()/'index.js'
  patch_file(source,"    assembled.sections.push({ name: 'dsh-expression:companion', text })",f"""    // HUOHUO_MEME_NATIVE_CHANNEL: OneBot and iLink are not dsh-im or web.
    const {{memeChannel,memeInstructions}}=await import({module});
    const nativeChannel=memeChannel(context?.agent?.session);
    if(['qq','wechat'].includes(nativeChannel)&&sendMode!=='text')text=memeInstructions(nativeChannel);
    assembled.sections.push({{ name: 'dsh-expression:companion', text }})""",'HUOHUO_MEME_NATIVE_CHANNEL')
  source=meme.resolve()/'memes.js'
  patch_file(source,"      const action = webMode ? 'search' : (args.action === 'send' ? 'send' : 'search')",f"""      // HUOHUO_MEME_STAGE_PATHS: QQ tool requires workspace-owned paths.
      const nativeMedia=await import({module});const localMemeChannel=nativeMedia.memeChannel(exec?.agent?.session);
      const action = webMode ? 'search' : (args.action === 'send' ? 'send' : 'search')""",'HUOHUO_MEME_STAGE_PATHS')
  patch_file(source,'          return memes.resolveStored(m.path)', "          const stored=memes.resolveStored(m.path);return localMemeChannel==='qq'?nativeMedia.stageMeme(stored):stored; // HUOHUO_MEME_ORIGINAL_PATH",'HUOHUO_MEME_ORIGINAL_PATH')
  patch_file(source,'        const sendable = (i) => paths[i] || absolutePathOf(rows[i])', "        const sendable = (i) => {const file=paths[i] || absolutePathOf(rows[i]);return localMemeChannel==='qq'?nativeMedia.stageMeme(file):file;} // HUOHUO_MEME_SEND_PATH",'HUOHUO_MEME_SEND_PATH')
  patch_file(source,"      const howToSend = textMode", "      let howToSend = textMode // HUOHUO_MEME_RESULT_MUTABLE",'HUOHUO_MEME_RESULT_MUTABLE')
  patch_file(source,"      let keywordMiss = ''",f"""      // HUOHUO_MEME_RESULT_CHANNEL: actual sender tool, not a web placeholder.
      const {{memeChannel,memeInstructions}}=await import({module});
      const nativeChannel=memeChannel(exec?.agent?.session);
      if(['qq','wechat'].includes(nativeChannel)&&!textMode)howToSend=memeInstructions(nativeChannel)+' QQ若路径不在工作区，先运行 ./sync-memes.sh，或 ./node-run.sh memes.mjs 关键词 获取可发送的工作区路径。';
      let keywordMiss = ''""",'HUOHUO_MEME_RESULT_CHANNEL')
 qq=HARNESS/'profiles/web/node_modules/dsh-onebot-qq'
 if qq.exists():
  if json.loads((qq/'package.json').read_text())['version']!='0.9.17':raise RuntimeError('QQ表情投递补丁需核对版本')
  source=qq.resolve()/'lib/outbound.js'
  patch_file(source,'            const clean = stripBoundaryLeakage(body);',f"""            // HUOHUO_MEME_OUTPUT: turn web-only captions into actual known library images.
            const {{prepareMemeReply,recordMemeUse}}=await import({module});
            const memeReply=prepareMemeReply(stripBoundaryLeakage(body),chatId);
            const clean = memeReply.text;""",'HUOHUO_MEME_OUTPUT')
  patch_file(source,"            this.ctx.trace?.(chatId, { stage: 'outbound', ok: true, reason: '回复已发送', data: { segments: ids.length } });", """            // HUOHUO_MEME_SEND: preserve destination, serialization and original permission gates.
            if(memeReply.meme){
                recordMemeUse(chatId,memeReply.meme,'pending');
                try{const id=await this.sendMsg(chatId,[{type:'image',data:{file:'file://'+memeReply.meme.file}}],options);
                    recordMemeUse(chatId,memeReply.meme,id?'confirmed':'unknown',{receipt:id});if(id)ids.push(id);
                }catch(error){recordMemeUse(chatId,memeReply.meme,'unknown');this.ctx.log('warn','表情图片未确认，未重发：'+describeError(error));}
            }
            this.ctx.trace?.(chatId, { stage: 'outbound', ok: true, reason: '回复已发送', data: { segments: ids.length } });""",'HUOHUO_MEME_SEND')
  patch_file(source,'const {prepareMemeReply,recordMemeUse}=await import(', 'const {prepareMemeReply,recordMemeUse,memeImageData}=await import( /* HUOHUO_MEME_BASE64_IMPORT */','HUOHUO_MEME_BASE64_IMPORT')
  patch_file(source,"file:'file://'+memeReply.meme.file", "file:memeImageData(memeReply.meme.file) /* HUOHUO_MEME_BASE64_SEND */",'HUOHUO_MEME_BASE64_SEND')
 return 'QQ/微信表情工具渠道已纠正，QQ占位符改实际图片'

def apply():return '；'.join([apply_audio(),apply_group(),apply_stt(),apply_comments(),apply_social(),apply_shared_context(),apply_inbox_hours(),apply_meme_delivery(),apply_incoming_media(),__import__('passive_compat').apply_passive_inbox(),__import__('video_audio_compat').apply_video_audio()])
if __name__=='__main__':print(apply())

def apply_incoming_media():
 pkg=HARNESS/'profiles/web/node_modules/dsh-douyin-browser-local'
 if not pkg.exists():return '抖音插件未安装'
 if json.loads((pkg/'package.json').read_text())['version']!='1.4.6':raise RuntimeError('抖音版本变化，需要核对被动查看')
 source=pkg.resolve()/'chat-service.mjs';content=source.read_text()
 if 'HUOHUO_INCOMING_WORK' not in content:
  start=content.index("    if(includeWork && message.media.type==='shared-work') {")
  end=content.index('    return result;\n  }',start)
  uri=json.dumps((WORKSPACE/'lib/incoming-media.mjs').as_uri())
  new=f'''    if(includeWork && !onVideoObservation && message.media.type==='shared-work') {{
      // HUOHUO_INCOMING_WORK: a verified incoming card is not an autonomous feed session.
      const {{incomingOrNote}}=await import({uri});
      const resolved=await this.browser.openSharedVideo(id,messageId,{{allowed:true,signal}});
      result.sharedWork=resolved;
      if(resolved.url) {{
        const observed=await incomingOrNote({{platform:'douyin',eventId:messageId,peer:id,kind:'private-share',url:resolved.url,signal}});
        const latest=messagesOf(await this.readConversation(id,{{signal}})).find(item=>item.id===messageId);
        if(!latest||messageFingerprint(latest)!==messageFingerprint(message))throw new Error('查看期间分享消息已改变');
        Object.assign(result,{{frames:[...result.frames.slice(0,1),...observed.frames.slice(0,2)],understandingScope:observed.understandingScope,note:observed.note,
          sharedWork:{{...resolved,text:observed.text,observation:{{beforeTime:observed.beforeTime,afterTime:observed.afterTime}}}},
          watchOutcome:{{stopReason:'bounded-incoming-sample',segments:1,fullVideoObserved:false,reachedEnd:false}}}});
        if(onVideoObservation&&observed.frames.length)await onVideoObservation(result,{{segments:1,frames:observed.frames.length,reachedEnd:false}});
      }}else result.note=resolved.reason||'没有核实作品链接，仅读取卡片。';
    }}
'''
  patch_file(source,content[start:end],new+content[start:end],'HUOHUO_INCOMING_WORK')
 patch_file(source,"      }else result.note=resolved.reason||'没有核实作品链接，仅读取卡片。';\n    }","      }else result.note=resolved.reason||'没有核实作品链接，仅读取卡片。';\n      return result; // HUOHUO_INCOMING_RETURN\n    }",'HUOHUO_INCOMING_RETURN')
 return '分享作品按入站事件定向查看，保留休息与共享时长限制'
