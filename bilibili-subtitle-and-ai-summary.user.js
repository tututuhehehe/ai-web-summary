// ==UserScript==
// @name         B站字幕获取与AI总结助手
// @namespace    https://github.com/tututuhehehe/ai-web-summary
// @version      1.2.2
// @author       limoon
// @description  B站 bilibili 视频 番剧 字幕 总结 摘要 AI助手 DeepSeek
// @description:en  Bilibili video subtitle summary AI assistant (DeepSeek/OpenAI)
// @match        *://*.bilibili.com/video/*
// @match        *://*.bilibili.com/bangumi/play/*
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @run-at       document-start
// @connect      *
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const startTime = performance.now();
  const version = typeof GM_info !== "undefined" && GM_info.script ? GM_info.script.version : "dev";

  // 集中管理外部端点常量,避免在多处硬编码
  const ENDPOINTS = {
    aliyun:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
  };

  // 集中管理 B 站播放器 DOM 选择器,B 站改版时只需在此处维护
  const SELECTORS = {
    subtitleLangItem: ".bpx-player-ctrl-subtitle-language-item",
    subtitleToggle: ".bpx-player-ctrl-subtitle",
    playerContainer: ".bpx-player-container",
    // 视频标题:普通视频页 / 番剧页 / 旧版,多重兜底
    videoTitle: [
      ".video-info-title-inner .video-title",
      ".video-info-title .video-title",
      "h1.video-title",
      ".video-title[title]",
      "h1[title]",
      ".media-title", // 番剧
      ".mediainfo_mediaTitle__Zyzte", // 番剧新版
    ],
  };

  // 配置数据字典
  const CONFIG_DICT = {
    provider: { key: "ai_provider", def: "siliconflow", el: "set-provider" },
    endpoint: {
      key: "ai_endpoint",
      def: ENDPOINTS.aliyun,
      el: "set-endpoint",
      perProvider: true, // 按服务商分别存储
    },
    apiKey: {
      key: "ai_api_key",
      def: "",
      el: "set-apikey",
      perProvider: true, // 按服务商分别存储
    },
    model1: {
      key: "ai_model1",
      def: "deepseek-v4-flash",
      el: "set-model1",
      perProvider: true,
    },
    model2: {
      key: "ai_model2",
      def: "deepseek-v4-pro",
      el: "set-model2",
      perProvider: true,
    },
    thinking: {
      key: "ai_thinking",
      def: false,
      el: "set-thinking",
      isCheckbox: true,
    },
    extraBody: {
      key: "ai_extra_body",
      def: "",
      el: "set-extrabody",
      perProvider: true, // 仅自定义服务商使用:额外 payload 参数(JSON)
    },
    prompt: {
      key: "ai_custom_prompt",
      def: `视频总结 Agent System Prompt

      你是一名专业的信息提炼与知识整理助手。

      视频标题:

      {{video_title}}

      用户通常是因为这个标题而点击视频。

      因此,你首先要回答的不是「视频讲了什么」,而是:

      标题中的问题,最终答案是什么?
      或
      标题所讨论的话题,最终结论是什么?

      你的任务是基于用户提供的视频字幕(Transcript),提炼作者真正想表达的观点、结论和逻辑,并输出高信息密度总结。

      ⸻

      总结原则

      内容提炼

      1. 不要逐句复述字幕。
      2. 优先提炼核心观点、关键结论和底层逻辑。
      3. 删除寒暄、口头禅、广告、闲聊、重复表达。
      4. 保留重要事实、案例、数据、方法论和推理过程。
      5. 对明显的口语化表达、转录错误和语病,可结合上下文修正。
      6. 总结应让未观看视频的人也能快速获得核心信息。

      信息组织

      1. 按「观点」组织内容,而不是按字幕顺序复述。
      2. 数据、案例、实验、引用等内容,应放到对应观点下解释。
      3. 不要为了完整而堆砌细节。
      4. 优先保留结论与理由,其次才是过程。

      ⸻

      输出格式

      使用 Markdown 输出。

      开头不要寒暄,不要解释自己在做什么,直接开始总结。

      ---

      # 视频主题

      用 1~2 句话概括视频真正讨论的内容。

      ---

      # {{video_title}}

      直接回答标题。

      如果标题是问题:

      列出视频最终给出的答案。

      如果标题是主题:

      列出视频围绕该主题最重要的核心结论。

      格式:

      1. ...
      2. ...
      3. ...

      要求:

      * 每条只写结论
      * 简洁直接
      * 不展开解释
      * 用户读完这一部分就能获得视频最核心的信息

      ⸻

      # 详细展开

      按照第一部分的编号顺序,对每个结论逐条展开。

      ## 1. 结论一

      核心解释

      说明作者为什么得出这个结论。

      支撑依据

      整理视频中的:

      * 数据
      * 案例
      * 实验
      * 事实
      * 推理过程

      只保留真正支撑结论的信息。

      ### 补充细节(可选)

      如有必要,补充关键背景。

      ⸻

      ## 2. 结论二

      同上。

      ⸻

      (依次展开)

      ⸻

      # 其他重要内容(可选)

      如果视频中还有重要信息无法归入上述结论,可单独补充。

      ⸻

      # 可执行建议(可选)

      仅当视频明确提供行动方案、操作步骤、方法论时输出。

      格式:

      1. ...
      2. ...
      3. ...

      如果视频没有明确建议,则省略本节。

      ⸻

      # 一句话总结

      使用不超过 50 字总结整个视频最重要的信息。

      ⸻

      输出要求

      * 使用 Markdown
      * 层级清晰
      * 信息密度高
      * 直接给结论
      * 避免套话和废话
      * 重点内容使用 加粗
      * 输出语言与字幕语言保持一致
      * 字幕信息不足时明确说明,不得编造`,
      el: "set-prompt",
    },
  };

  // 按服务商存储的配置项使用带后缀的 key,使三家各自保存 apiKey/endpoint/模型
  function providerKey(baseKey, provider) {
    return `${baseKey}_${provider}`;
  }

  // 根据服务商组装思考模式参数,平铺写入 payload 顶层。
  // 注意:这里是用 GM_xmlhttpRequest 手动拼 HTTP body 直接发送,
  // 不存在 OpenAI SDK 的 extra_body 展平机制,因此这些非标准参数
  // 必须直接放在请求体顶层(等价于 SDK 把 extra_body 展平后的结果)。
  // 兼容不同服务商:阿里云/硅基流动用 enable_thinking + thinking_budget,
  // DeepSeek 用 thinking.type + reasoning_effort;自定义服务商合并用户填写的 extra_body JSON。
  function applyThinkingParams(payload, cfg) {
    const enabled = !!cfg.thinking;
    if (cfg.provider === "aliyun" || cfg.provider === "siliconflow") {
      // 必须显式发送 true/false:部分 Qwen/Qwen3 类模型默认会思考,
      // 若关闭时不发送 false,UI 开关会表现为“关不掉”。
      payload.enable_thinking = enabled;
      if (enabled) payload.thinking_budget = 256;
    } else if (cfg.provider === "deepseek") {
      // DeepSeek 兼容端点同样显式发送 enabled/disabled,确保开关双向生效。
      payload.thinking = { type: enabled ? "enabled" : "disabled" };
      if (enabled) payload.reasoning_effort = "high";
    } else if (cfg.extraBody && cfg.extraBody.trim()) {
      // 自定义服务商:合并用户填写的 extra_body JSON 到顶层,解析失败时忽略
      try {
        const extra = JSON.parse(cfg.extraBody);
        if (extra && typeof extra === "object" && !Array.isArray(extra)) {
          Object.assign(payload, extra);
        }
      } catch (e) {
        // JSON 解析失败时忽略(不中断请求),由用户自行检查格式
      }
    }
  }

  // 各服务商的默认模型(首次未配置时使用)
  const PROVIDER_DEFAULTS = {
    aliyun: { model1: "qwen-plus", model2: "qwen-turbo" },
    deepseek: { model1: "deepseek-chat", model2: "deepseek-reasoner" },
    siliconflow: { model1: "Qwen/Qwen3.5-9B", model2: "inclusionAI/Ling-flash-2.0" },
    custom: { model1: "", model2: "" },
  };

  // 读取某服务商的 endpoint:aliyun/deepseek 为固定值,custom 读取保存值
  function loadEndpoint(provider) {
    if (provider === "aliyun") return ENDPOINTS.aliyun;
    if (provider === "deepseek") return ENDPOINTS.deepseek;
    if (provider === "siliconflow") return ENDPOINTS.siliconflow;
    return GM_getValue(providerKey("ai_endpoint", provider), "");
  }

  // 读取某服务商的按服务商配置项(apiKey/model1/model2)
  function loadProviderValue(baseKey, provider, fallbackDef) {
    const def =
      (PROVIDER_DEFAULTS[provider] &&
        PROVIDER_DEFAULTS[provider][
          baseKey === "ai_model1"
            ? "model1"
            : baseKey === "ai_model2"
              ? "model2"
              : ""
        ]) ??
      fallbackDef;
    return GM_getValue(providerKey(baseKey, provider), def);
  }

  // 加载指定服务商的全部按服务商配置到 aiConfig
  function loadProviderConfig(provider) {
    for (const k in CONFIG_DICT) {
      const cfg = CONFIG_DICT[k];
      if (!cfg.perProvider) continue;
      if (k === "endpoint") {
        aiConfig.endpoint = loadEndpoint(provider);
      } else {
        aiConfig[k] = loadProviderValue(cfg.key, provider, cfg.def);
      }
    }
  }

  let aiConfig = {};
  for (let k in CONFIG_DICT) {
    if (CONFIG_DICT[k].perProvider) continue; // 按服务商的项随后加载
    aiConfig[k] = GM_getValue(CONFIG_DICT[k].key, CONFIG_DICT[k].def);
  }

  // 一次性迁移:旧版本 apiKey/endpoint 为全局单一存储,迁移到当前服务商的后缀 key
  (function migrateLegacyConfig() {
    if (GM_getValue("ai_config_migrated", false)) return;
    const prov = aiConfig.provider;
    const legacyKey = GM_getValue("ai_api_key", "");
    if (legacyKey && !GM_getValue(providerKey("ai_api_key", prov), "")) {
      GM_setValue(providerKey("ai_api_key", prov), legacyKey);
    }
    const legacyEp = GM_getValue("ai_endpoint", "");
    if (
      prov === "custom" &&
      legacyEp &&
      !GM_getValue(providerKey("ai_endpoint", "custom"), "")
    ) {
      GM_setValue(providerKey("ai_endpoint", "custom"), legacyEp);
    }
    for (const mk of ["ai_model1", "ai_model2"]) {
      const legacyModel = GM_getValue(mk, "");
      if (legacyModel && !GM_getValue(providerKey(mk, prov), "")) {
        GM_setValue(providerKey(mk, prov), legacyModel);
      }
    }
    GM_setValue("ai_config_migrated", true);
  })();

  loadProviderConfig(aiConfig.provider); // 按当前服务商加载 apiKey/endpoint/模型

  // 状态数据
  let currentSubtitle = "";
  let currentVideoTitle = ""; // 本次总结时抓取的视频标题
  let chatHistory = [];
  let sessionTokens = { input: 0, output: 0 }; // 本次会话累计 token 用量
  let isRequesting = false;
  let currentRequest = null; // 正在进行的 GM_xmlhttpRequest 句柄,用于可中断
  let requestSeq = 0; // 请求序号,用于丢弃被中断的旧请求回调
  let activeAssistantBubble = null; // 当前正在流式写入的 assistant 气泡,用于终止时标注
  let reattachSubtitleObserver = null; // SPA 切视频后重新绑定字幕按钮 observer(由 createGlobalObserver 赋值)

  // 用户主动终止当前生成:中断请求并在已生成内容后追加「已终止」标记
  function stopCurrentGeneration() {
    const bubble = activeAssistantBubble;
    abortCurrentRequest();
    if (bubble) {
      // 若气泡还是初始「响应中」占位文本,直接提示已终止;否则在现有内容后追加
      const onlyPlaceholder = /^\s*<span[^>]*>AI[^<]*<\/span>\s*$/.test(
        bubble.innerHTML,
      );
      if (onlyPlaceholder) {
        bubble.innerHTML =
          '<span style="color:var(--text-faint);">⛔ 已终止生成</span>';
      } else {
        bubble.innerHTML +=
          '<div style="color:var(--text-faint);font-size:12px;margin-top:6px;">⛔ 已终止生成</div>';
      }
      attachRegenButton(bubble); // 被终止的回答也可重新生成
    }
    activeAssistantBubble = null;
    updateChatSendButtonState();
  }

  // 中断当前正在进行的 AI 请求(如 SPA 切换视频时)
  function abortCurrentRequest() {
    if (currentRequest && typeof currentRequest.abort === "function") {
      try {
        currentRequest.abort();
      } catch (e) {}
    }
    currentRequest = null;
    requestSeq++; // 序号递增,使旧请求的后续回调失效
    isRequesting = false;
    activeAssistantBubble = null;
  }

  function addGlobalStyles() {
    if (document.getElementById("bili-ai-style")) return;
    // 读取保存的侧栏位置,直接作为初始定位写进 CSS,避免首帧先居中再跳转的闪烁
    const savedTop = GM_getValue("minTabTop", null);
    const minTabPos =
      typeof savedTop === "number"
        ? `top: ${savedTop}px; transform: none;`
        : `top: 50%; transform: translateY(-50%);`;
    const style = document.createElement("style");
    style.id = "bili-ai-style";
    style.textContent = `
            #bili-ai-panel, #bili-ai-minimized, .bilibili-subtitle-infobar {
                --accent: #00a1d6;
                --accent-hover: #0088b5;
                --bg: #1e1e20;
                --bg-elev: #252528;
                --bg-bubble: #2a2a2b;
                --bg-bubble-hover: #2a2a2b;
                --bg-settings: #2d2d31;
                --bg-code: #1a1a1b;
                --bg-think: rgba(0,0,0,0.2);
                --border: #333;
                --border-2: #444;
                --border-3: #4a4a50;
                --text: #eee;
                --text-2: #d1d5db;
                --text-mute: #999;
                --text-faint: #888;
                --text-strong: #fff;
                --strong-accent: #50E3C2;
                --shadow: rgba(0,0,0,0.6);
                --panel-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06);
                --row-stripe: rgba(255, 255, 255, 0.03);
                --infobar-bg: rgba(25, 26, 27, 0.98);
                --infobar-border: rgba(255, 255, 255, 0.2);
            }
            @media (prefers-color-scheme: light) {
                #bili-ai-panel, #bili-ai-minimized, .bilibili-subtitle-infobar {
                    --bg: #eceef1;
                    --bg-elev: #e2e5e9;
                    --bg-bubble: #e6e8ec;
                    --bg-bubble-hover: #dde0e5;
                    --bg-settings: #e8eaee;
                    --bg-code: #dde0e5;
                    --bg-think: rgba(0,0,0,0.05);
                    --border: #e0e2e6;
                    --border-2: #d0d3d8;
                    --border-3: #c4c8ce;
                    --text: #1a1a1c;
                    --text-2: #2c2f33;
                    --text-mute: #666;
                    --text-faint: #888;
                    --text-strong: #000;
                    --strong-accent: #0a9e86;
                    --shadow: rgba(0,0,0,0.18);
                    --panel-shadow: 0 12px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18);
                    --row-stripe: rgba(0, 0, 0, 0.03);
                    --infobar-bg: rgba(255, 255, 255, 0.98);
                    --infobar-border: rgba(0, 0, 0, 0.12);
                }
            }

            .bilibili-subtitle-infobar {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: var(--infobar-bg); border: 1px solid var(--infobar-border);
                border-radius: 8px; padding: 12px 20px; color: var(--text); font-size: 14px; font-weight: bold;
                z-index: 2147483647; box-shadow: 0 10px 40px var(--shadow); backdrop-filter: blur(10px);
                text-align: center; transition: all 0.3s ease;
            }
            .bilibili-subtitle-infobar.info { border-left: 4px solid #00a1d6; }
            .bilibili-subtitle-infobar.success { border-left: 4px solid #52c41a; }
            .bilibili-subtitle-infobar.error { border-left: 4px solid #f5222d; }

            /* 常驻侧边栏样式 */
            #bili-ai-minimized {
                position: fixed; right: 0; ${minTabPos} width: 40px; height: 110px;
                background-color: var(--bg); border: 1px solid var(--border); border-right: none; border-radius: 12px 0 0 12px;
                box-shadow: -5px 5px 15px var(--shadow); z-index: 2147483646; display: flex;
                flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
            }
            #bili-ai-minimized:hover { background-color: var(--bg-bubble); width: 45px; }
            #bili-ai-minimized.dragging { transition: none; width: 40px; cursor: grabbing; }
            #bili-ai-minimized span { color: var(--accent); font-size: 14px; font-weight: bold; writing-mode: vertical-lr; letter-spacing: 4px; text-align: center;}

            #bili-ai-panel {
                position: fixed; right: 20px; top: 80px; width: 420px; height: 680px;
                max-width: calc(100vw - 40px); max-height: calc(100vh - 100px);
                background-color: var(--bg); border: 1px solid var(--border); border-radius: 12px;
                box-shadow: var(--panel-shadow); z-index: 2147483646; display: none;
                flex-direction: column; color: var(--text); font-family: sans-serif;
            }
            .ai-panel-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg-elev); border-radius: 12px 12px 0 0;
            }
            .ai-panel-header-left { display: flex; align-items: center; gap: 8px; }
            .ai-panel-title { font-size: 15px; font-weight: bold; color: var(--accent); }
            .ai-model-select { background: var(--bg); color: var(--text-2); border: 1px solid var(--border-2); border-radius: 4px; padding: 2px 6px; font-size: 12px; outline: none; cursor: pointer;}
            .ai-refresh-btn { cursor: pointer; color: var(--accent); font-size: 14px; transition: transform 0.3s; }
            .ai-refresh-btn:hover { transform: rotate(180deg); }

            .ai-panel-header-actions { display: flex; align-items: center; gap: 12px; }
            .ai-icon-btn { cursor: pointer; color: var(--text-mute); font-size: 16px; transition: color 0.2s; }
            .ai-icon-btn:hover { color: var(--text-strong); }

            .ai-token-bar {
                display: flex; justify-content: center; gap: 16px;
                padding: 5px 12px; font-size: 11px; color: var(--text-mute);
                background: var(--bg-elev); border-bottom: 1px solid var(--border);
            }
            .ai-token-bar span { white-space: nowrap; }

            .ai-panel-chat { flex: 1; padding: 16px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 16px; }
            /* 隐藏面板内可滚动区域的滚动条(保留滚动功能) */
            .ai-panel-chat::-webkit-scrollbar,
            .ai-panel-settings::-webkit-scrollbar,
            .chat-bubble.assistant pre::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
            .ai-panel-chat, .ai-panel-settings, .chat-bubble.assistant pre { scrollbar-width: none; -ms-overflow-style: none; }
            .chat-bubble { padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.6; word-wrap: break-word; overflow-wrap: anywhere; box-sizing: border-box; }
            .chat-bubble.user { max-width: 82%; background: var(--accent); color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
            .chat-bubble.assistant { width: 100%; max-width: 100%; background: var(--bg-bubble); color: var(--text-2); align-self: stretch; border-bottom-left-radius: 2px; border: 1px solid var(--border); overflow: visible;}
            .chat-bubble.system { background: transparent; color: var(--text-faint); align-self: center; font-size: 12px; text-align: center; }

            /* Markdown 样式适配 */
            .chat-bubble.assistant h1, .chat-bubble.assistant h2, .chat-bubble.assistant h3, .chat-bubble.assistant h4, .chat-bubble.assistant h5, .chat-bubble.assistant h6 { color: var(--text-strong); margin-top: 0; margin-bottom: 8px; font-size: 15px; }
            .chat-bubble.assistant p { margin: 0 0 8px 0; }
            .chat-bubble.assistant p:last-child { margin: 0; }
            .chat-bubble.assistant .ai-seg { margin-bottom: 8px; }
            .chat-bubble.assistant .ai-seg:last-child { margin-bottom: 0; }
            .chat-bubble.assistant ul, .chat-bubble.assistant ol { margin: 0 0 8px 0; padding-left: 22px; }
            .chat-bubble.assistant ul { list-style: disc outside; }
            .chat-bubble.assistant ol { list-style: decimal outside; }
            .chat-bubble.assistant li { display: list-item; margin: 2px 0; list-style: inherit; }
            .chat-bubble.assistant strong { color: var(--strong-accent); }
            .chat-bubble.assistant code { background: var(--bg-code); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; }
            .chat-bubble.assistant pre { background: var(--bg-code); padding: 10px; border-radius: 6px; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--border-2); margin: 8px 0; max-width: 100%; box-sizing: border-box;}
            .chat-bubble.assistant table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; color: var(--text); table-layout: fixed; }
            .chat-bubble.assistant th, .chat-bubble.assistant td { border: 1px solid var(--border-2); padding: 6px 10px; text-align: left; }
            .chat-bubble.assistant th { background-color: var(--bg-code); color: var(--accent); font-weight: bold; }
            .chat-bubble.assistant tr:nth-child(even) { background-color: var(--row-stripe); }

            .ai-panel-input-area {
                padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg-elev);
                display: flex; align-items: flex-end; gap: 8px;
                border-radius: 0 0 12px 12px;
            }
            .ai-chat-inputwrap {
                flex: 1; display: flex; align-items: flex-end; box-sizing: border-box;
                background: var(--bg); border: 1px solid var(--border-2); border-radius: 17px;
                padding: 4px 6px 4px 14px; transition: border-color 0.2s, box-shadow 0.2s;
            }
            .ai-chat-inputwrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0, 161, 214, 0.25); }
            .ai-chat-textarea {
                flex: 1; height: 24px; min-height: 24px; max-height: 120px;
                background: transparent; border: none; color: var(--text);
                padding: 0; font-size: 13px; line-height: 24px; resize: none; outline: none;
                font-family: inherit;
            }
            .ai-chat-textarea::placeholder { color: var(--text-faint); }
            .ai-chat-send {
                flex: none; width: 34px; height: 34px; padding: 0;
                display: inline-flex; align-items: center; justify-content: center;
                background: var(--accent); color: #fff; border: none; border-radius: 50%;
                cursor: pointer; font-size: 16px; line-height: 1;
                transition: background 0.2s, transform 0.1s;
            }
            .ai-chat-send:hover { background: var(--accent-hover); }
            .ai-chat-send:active { transform: scale(0.92); }
            .ai-chat-send:disabled { background: var(--border-2); color: var(--text-faint); cursor: not-allowed; }
            .ai-chat-send.ai-chat-stop { background: #d9363e; font-size: 15px; }
            .ai-chat-send.ai-chat-stop:hover { background: #f5222d; }
            .ai-chat-send.ai-chat-pill { width: auto; border-radius: 17px; padding: 0 16px; height: 34px; font-size: 13px; font-weight: bold; }

            .ai-regen-btn {
                display: inline-flex; align-items: center; gap: 4px; margin-top: 10px;
                padding: 4px 10px; font-size: 12px; cursor: pointer;
                background: var(--bg-settings); color: var(--accent); border: 1px solid var(--border-2); border-radius: 6px;
                transition: background 0.2s, color 0.2s;
            }
            .ai-regen-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

            .ai-panel-settings {
                position: absolute; top: 53px; left: 12px; right: 12px;
                max-height: calc(100% - 130px); overflow-y: auto; overscroll-behavior: contain;
                padding: 16px; font-size: 12px; color: var(--text);
                background: var(--bg-settings); border: 1px solid var(--border-3); border-radius: 10px;
                box-shadow: 0 12px 32px var(--shadow);
                display: none; z-index: 10;
            }
            .ai-panel-settings::before {
                content: "⚙️ 设置"; display: block; font-size: 13px; font-weight: bold;
                color: var(--accent); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-2);
            }
            .ai-input { width: 100%; box-sizing: border-box; margin-top: 4px; margin-bottom: 8px; padding: 6px; background: var(--bg); border: 1px solid var(--border-2); color: var(--text); border-radius: 4px; font-family: inherit;}
            .ai-settings-row { display: flex; gap: 8px; }
        `;
    document.head.appendChild(style);
  }

  function showInfoBar(message, type = "info", duration = 3000) {
    const existing = document.querySelector(".bilibili-subtitle-infobar");
    if (existing) existing.remove();
    const bar = document.createElement("div");
    bar.className = `bilibili-subtitle-infobar ${type}`;
    bar.textContent = message;
    document.body.appendChild(bar);
    if (duration > 0) {
      setTimeout(() => {
        if (bar.parentNode) {
          bar.style.opacity = "0";
          bar.style.transform = "translate(-50%, -50%) scale(0.9)";
          setTimeout(() => bar.remove(), 300);
        }
      }, duration);
    }
    return bar;
  }
  function setupNetworkInterception() {
    const script = document.createElement("script");
    script.textContent = `(function(){window._biliSubtitleUrls=window._biliSubtitleUrls||[];function add(u){if(!u||typeof u!=='string')return;if(!(u.includes('subtitle')||u.includes('ai_subtitle')))return;const a=window._biliSubtitleUrls;if(!a.includes(u))a.push(u);if(a.length>80)a.splice(0,a.length-80);}const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){add(u);return o.apply(this,arguments);};const f=window.fetch;if(typeof f==='function'){window.fetch=function(u,op){let r=typeof u==='string'?u:(u&&u.url?u.url:'');add(r);return f.apply(this,arguments);};}})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  let cachedScriptSubtitleUrls = null;
  // SPA 导航后失效标志:置位后不再信任首屏 SSR 来源(__INITIAL_STATE__ 等全局变量
  // 与首屏内联 <script> 里的字幕 URL——它们在 SPA 下不会被移除/更新,会返回上个视频的
  // 陈旧 URL)。导航后唯一可信来源是 setupNetworkInterception 拦截到的当前视频请求。
  // 注意:cachedScriptSubtitleUrls 也会被置空,但重扫仍会命中同一个陈旧内联脚本,
  // 所以 staleSSRSources 必须同时门控脚本扫描本身,见 extractSubtitleUrlsFromScripts。
  let staleSSRSources = false;
  // 首屏加载时已存在的 <script> 节点集合;SPA 导航后只扫新出现的 script(新视频可能
  // 注入新的内嵌字幕 URL),不再重扫首屏那批(它们带着第一个视频的陈旧 URL)。
  const seenScriptNodes = new WeakSet();

  function normalizeSubtitleUrl(raw) {
    if (typeof raw !== "string") return "";
    let url = raw
      .trim()
      .replace(/\\\//g, "/")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/g, "&");
    if (url.startsWith("//")) url = "https:" + url;
    return url;
  }

  function collectSubtitleUrlsFromObject(obj, out, seen = new Set(), depth = 0) {
    if (!obj || depth > 6) return;
    const t = typeof obj;
    if (t === "string") {
      const url = normalizeSubtitleUrl(obj);
      if (url && (url.includes("subtitle") || url.includes("ai_subtitle"))) {
        out.push(url);
      }
      return;
    }
    if (t !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      obj.forEach((item) => collectSubtitleUrlsFromObject(item, out, seen, depth + 1));
      return;
    }
    for (const key in obj) {
      // B 站初始状态对象较大,优先深挖字幕/播放信息相关字段;其他字段也浅层扫描。
      const nextDepth = /sub|subtitle|caption|play|video|dash|data|url/i.test(key)
        ? depth + 1
        : depth + 2;
      collectSubtitleUrlsFromObject(obj[key], out, seen, nextDepth);
    }
  }

  function extractSubtitleUrlsFromScripts() {
    const found = [];
    document.querySelectorAll("script").forEach((scriptEl) => {
      // SPA 失效后跳过记录为已见的首屏 script 节点
      if (staleSSRSources && seenScriptNodes.has(scriptEl)) return;
      seenScriptNodes.add(scriptEl); // 记录本次已扫描,下次 SPA 失效扫描时跳过
      const code = scriptEl.textContent;
      if (!code) return;
      if (!code.includes("subtitle") && !code.includes("ai_subtitle")) return;
      const normalizedCode = normalizeSubtitleUrl(code);
      const matches = normalizedCode.match(
        /(?:https?:)?\/\/[^\s"'<>\\]+(?:ai_subtitle|subtitle)\/[^\s"'<>\\]+/g,
      );
      if (matches) found.push(...matches.map(normalizeSubtitleUrl));
    });
    return found;
  }

  function getSubtitleUrls() {
    const urls = [];
    // 仅在"尚未从脚本中扫到任何字幕 URL"时才(重新)扫描脚本。
    // 空数组是 truthy,旧写法 `if (!cachedScriptSubtitleUrls)` 会把"首次扫到空"
    // 永久缓存,导致 SPA 下新视频的初始状态脚本稍后才注入/补全字幕 URL 时再也扫不到
    // (即便字幕已在视频里出现,重新点击仍失败)。改为只缓存非空结果:空则下次继续重扫。
    if (!cachedScriptSubtitleUrls || cachedScriptSubtitleUrls.length === 0) {
      cachedScriptSubtitleUrls = extractSubtitleUrlsFromScripts();
      // extractSubtitleUrlsFromScripts 已在内部把扫描过的 script 节点登记进
      // seenScriptNodes,SPA 失效后的重扫据此只看新增节点——首屏那批陈旧内联
      // 脚本被跳过,因此 cachedScriptSubtitleUrls 在 SPA 后只含新增脚本的 URL,
      // 无需再以 staleSSRSources 二次门控(决策 [1]b:保留新增 script 来源)。
    }
    urls.push(...cachedScriptSubtitleUrls);

    const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (win._biliSubtitleUrls) urls.push(...win._biliSubtitleUrls);
    if (window._biliSubtitleUrls && window._biliSubtitleUrls !== win._biliSubtitleUrls) {
      urls.push(...window._biliSubtitleUrls);
    }

    // 兜底从 B 站首屏状态对象里递归找 subtitle_url/subtitleUrl 等字段。
    // SPA 导航后 staleSSRSources=true,跳过——这些 SSR 全局变量不会随 SPA 更新,
    // 会返回上个视频的陈旧字幕 URL(带过期 auth_key)。
    if (!staleSSRSources) {
      try {
        collectSubtitleUrlsFromObject(win.__INITIAL_STATE__, urls);
        collectSubtitleUrlsFromObject(win.__playinfo__, urls);
        collectSubtitleUrlsFromObject(win.__NEXT_DATA__, urls);
      } catch (e) {}
    }

    const normalized = urls.map(normalizeSubtitleUrl).filter(Boolean);
    return [...new Set(normalized)].filter((url) => {
      if (!url || !(url.includes("subtitle") || url.includes("ai_subtitle"))) return false;
      // B 站字幕通常带 auth_key;部分状态对象只暴露 subtitle_url 或 json URL,也允许作为兜底候选。
      return url.includes("auth_key") || /subtitle.*\.json/i.test(url) || url.includes("ai_subtitle");
    });
  }

  function getSubtitleBody(data) {
    const body =
      data && data.body
        ? data.body
        : data && data.data && data.data.body
          ? data.data.body
          : null;
    if (Array.isArray(body)) return body;
    throw new Error("无法解析字幕数据(格式异常或为空)");
  }
  function formatSubtitleTime(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function subtitleBodyToText(body, options = {}) {
    const withTimestamps = !!options.withTimestamps;
    return body
      .map((item) => {
        const content = String(item?.content ?? "").trim();
        if (!content) return "";
        if (!withTimestamps) return content;
        const ts = formatSubtitleTime(item?.from);
        return ts ? `[${ts}] ${content}` : content;
      })
      .filter(Boolean)
      .join("\n");
  }
  // 对候选字幕 URL 打分排序:分越高越可能是真正的字幕正文 JSON。
  // getSubtitleUrls() 会把页面里所有含 "subtitle"/"ai_subtitle" 的 URL 都收进来,
  // 其中混杂着并非字幕正文的地址(如字幕相关的上报/状态接口,响应体可能是纯文本 "ok",
  // 或字幕列表接口,响应里没有 body 字段)。这些 URL 命中后会导致 JSON.parse 失败
  // (报 Unexpected identifier "ok" 之类)。因此这里优先尝试最像"正文"的地址。
  function rankSubtitleUrl(url) {
    let score = 0;
    // 中文语言标识(lan= 或路径分段),优先取中文字幕
    if (
      /[?&]lan=(zh|cn|hans)|[-_/](zh|hans|zh-hans|zh-cn)[-_./]/i.test(url)
    ) {
      score += 100;
    }
    if (url.includes("ai_subtitle")) score += 10; // B 站 AI 字幕正文
    if (/subtitle.*\.json/i.test(url)) score += 5; // 明确的 .json 字幕文件
    if (url.includes("auth_key")) score += 2; // 带鉴权串的通常是 CDN 正文地址
    // 明显不是字幕正文的路径(上报/心跳/接口列表等)降权,排到最后再兜底尝试
    if (/(report|heartbeat|log|stat|track|list|manager|config)/i.test(url)) {
      score -= 50;
    }
    return score;
  }

  // 使用 GM_xmlhttpRequest 下载单个字幕 URL 并解析为纯文本(避免 *.bilibili.com 对
  // *.hdslb.com 的跨域限制)。解析失败/内容为空/HTTP 异常时 reject,由上层继续尝试下一个候选。
  function fetchSubtitleFromUrl(url, options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "json",
        timeout: 8000,
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }
          try {
            // 部分管理器不会根据 responseType 自动解析,需兼容 responseText
            let data = response.response;
            if (typeof data === "string") data = JSON.parse(data);
            else if (data == null && response.responseText)
              data = JSON.parse(response.responseText);
            const text = subtitleBodyToText(getSubtitleBody(data), options);
            if (!text || !text.trim()) {
              reject(new Error("字幕内容为空"));
              return;
            }
            resolve(text);
          } catch (e) {
            reject(new Error("字幕解析失败: " + e.message));
          }
        },
        onerror: function () {
          reject(new Error("字幕下载失败(网络错误)"));
        },
        ontimeout: function () {
          reject(new Error("字幕下载超时"));
        },
      });
    });
  }

  // 依次尝试所有候选字幕 URL(按 rankSubtitleUrl 从高到低,相同分保持原顺序),
  // 命中第一个能解析出非空字幕正文的地址即返回;全部失败才抛出最后一次错误。
  // 这样即使候选里混入了返回 "ok"/非 JSON 的非正文接口,也能自动跳过,不再随机报错。
  // 总时长上限 12s + 排序后只取前 12 条候选(_biliSubtitleUrls 上限 80,但绝大多数
  // 是 report/list/manager/config 等噪声接口,头部 12 条已覆盖 ai_subtitle/.json/auth_key
  // 的真实正文),避免无字幕视频时逐个尝试 80 条 × 8s 的分钟级"假卡死"。
  async function fetchSubtitleText(options = {}) {
    const rawUrls = getSubtitleUrls();
    if (rawUrls.length === 0) throw new Error("未找到字幕");

    const ordered = rawUrls
      .map((u, i) => ({ url: normalizeSubtitleUrl(u), i }))
      .filter((x) => x.url)
      .sort((a, b) => rankSubtitleUrl(b.url) - rankSubtitleUrl(a.url) || a.i - b.i)
      .map((x) => x.url)
      .slice(0, 12); // 噪声候选过多且 rankSubtitleUrl 已降权,头部 12 条足够

    const OVERALL_TIMEOUT_MS = 12000; // 总尝试上限,避免分钟级"假卡死"
    const deadline = Date.now() + OVERALL_TIMEOUT_MS;
    let lastErr = null;
    let triedCount = 0;
    for (const url of ordered) {
      if (Date.now() > deadline) {
        // 已超总上限:剩余候选全部失败,语义化报错(上层据此区分"无字幕"提示)
        lastErr = new Error(`字幕获取超时(已尝试 ${triedCount} 组候选均不可用,本视频可能无字幕)`);
        break;
      }
      triedCount++;
      try {
        return await fetchSubtitleFromUrl(url, options);
      } catch (e) {
        lastErr = e; // 记录并尝试下一个候选(如返回 "ok"、列表接口无 body 等)
      }
    }
    throw lastErr || new Error("字幕获取失败(本视频可能无字幕)");
  }

  function handleCopySubtitle() {
    showInfoBar("正在提取...", "info", 0);
    fetchSubtitleText()
      .then((t) => {
        document.querySelector(".bilibili-subtitle-infobar.info")?.remove();
        GM_setClipboard(t, "text");
        showInfoBar("✅ 已复制!", "success", 2500);
      })
      .catch((e) => {
        document.querySelector(".bilibili-subtitle-infobar.info")?.remove();
        showInfoBar("提取失败: " + e.message, "error");
      });
  }

  // 判断元素是否处于隐藏(display:none)状态。
  // 优先读取内联 style.display(O(1),不触发样式重算);仅当内联为空时
  // 才回退到一次 getComputedStyle(用于初始由 CSS 类控制隐藏、尚未被内联设置过的元素)。
  function isElHidden(el) {
    if (!el) return true;
    const inline = el.style.display;
    if (inline) return inline === "none";
    return getComputedStyle(el).display === "none";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // Markdown 渲染统一出口:先用 marked 解析,再用 DOMPurify 清洗后再写入 innerHTML。
  // 字幕是外部不可信输入,经 AI 总结后的输出可能被 prompt injection 注入
  // <img onerror=...>/<svg onload=...> 等内联事件,marked@4 已移除内置 sanitize,
  // 不清洗会在 *.bilibili.com 页面上下文中执行。DOMPurify 或 marked 缺失(CDN 被拦)时降级为纯文本输出。
  function renderMarkdown(src) {
    const text = String(src ?? "");
    // marked 或 DOMPurify 任一 CDN 加载失败时,降级为纯文本而不是输出未清洗 HTML。
    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
      return escapeHtml(text).replace(/\n/g, "<br>");
    }
    const html = marked.parse(text);
    return DOMPurify.sanitize(html);
  }

  function requestAIStream(messages, onComplete, onError, assistantBubble) {
    if (!aiConfig.apiKey) {
      onError("请先点击右上角⚙️图标配置 API Key");
      return;
    }

    const selectedModel = document.getElementById("ai-model-select").value;
    isRequesting = true;
    const mySeq = ++requestSeq; // 本次请求的序号,后续回调需校验是否仍为最新
    const REQUEST_TIMEOUT_MS = 180000; // 整体请求超时
    const STREAM_IDLE_TIMEOUT_MS = 45000; // 流式响应超过该时间无增量则视为卡住
    // 判断本次请求是否已被新请求/路由切换作废,或目标 bubble 已脱离文档
    function isStale() {
      if (mySeq !== requestSeq) return true;
      if (assistantBubble && !assistantBubble.isConnected) return true;
      return false;
    }
    updateChatSendButtonState();

    const payload = {
      model: selectedModel,
      messages: buildRequestMessages(messages),
      stream: true,
      stream_options: { include_usage: true }, // 请求接口在流末返回 token 用量
    };

    // 根据服务商组装思考模式参数(统一写入 extra_body)
    applyThinkingParams(payload, aiConfig);

    currentRequest = GM_xmlhttpRequest({
      method: "POST",
      url: aiConfig.endpoint,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
        Accept: "text/event-stream",
      },
      data: JSON.stringify(payload),
      responseType: "stream",
      timeout: REQUEST_TIMEOUT_MS,
      onloadstart: async function (response) {
        try {
          if (response.status && (response.status < 200 || response.status >= 300)) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || "请求失败"}`);
          }
          if (!response.response || typeof response.response.getReader !== "function") {
            throw new Error("当前用户脚本管理器不支持 GM_xmlhttpRequest 的流式读取(responseType: stream),请升级 Tampermonkey/Violentmonkey 后重试");
          }
          const reader = response.response.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let reasoningContent = "";
          let mainContent = "";

          let committedMain = "";
          let committedSegments = []; // 已定稿的段落原文数组,每段对应一个独立 DOM 节点
          let renderedSegCount = 0; // 已 append 到页面的段落数,旧节点从不重建
          let pendingMain = "";
          let rafId = null;
          let lastRenderedPending = null; // 上次实际渲染到 DOM 的 pending 内容,用于去重跳过
          let lastPendingRenderTs = 0; // 上次 pending 段实际渲染的时间戳,用于时间节流
          let tailTimer = null; // 节流跳过时的尾帧兜底定时器
          let receivedError = "";
          let idleTimer = null;
          function clearIdleTimer() {
            if (idleTimer) {
              clearTimeout(idleTimer);
              idleTimer = null;
            }
          }
          function touchIdleTimer() {
            clearIdleTimer();
            idleTimer = setTimeout(() => {
              if (isStale()) return;
              receivedError = `AI 响应超时:超过 ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)} 秒未收到新内容`;
              try {
                currentRequest?.abort?.();
              } catch (e) {}
            }, STREAM_IDLE_TIMEOUT_MS);
          }
          let thinkStartTime = 0; // 思考(reasoning)首次出现的时间戳
          let thinkSeconds = 0; // 已思考秒数(一秒一秒跳动)
          let thinkTimer = null; // 思考计时器,每秒刷新标题
          let usageInfo = null; // 接口返回的 token 用量(prompt/completion)

          // 解析一批 SSE 文本行,提取 reasoning/content 增量
          function processLines(lines) {
            for (let line of lines) {
              line = line.trim();
              if (!line.startsWith("data:")) {
                // 非 SSE 行:可能是接口返回的 JSON 错误体,尝试提取错误信息
                if (line && !receivedError) {
                  try {
                    const errObj = JSON.parse(line);
                    const msg =
                      errObj?.error?.message || errObj?.message || errObj?.msg;
                    if (msg) receivedError = "接口错误: " + msg;
                  } catch (e) {}
                }
                continue;
              }
              const dataStr = line.substring(line.indexOf(":") + 1).trim();
              if (dataStr === "[DONE]") continue;
              try {
                const data = JSON.parse(dataStr);
                if (data?.error) {
                  const msg = data.error.message || JSON.stringify(data.error);
                  if (!receivedError) receivedError = "接口错误: " + msg;
                  continue;
                }
                if (data?.usage) usageInfo = data.usage; // 捕获 token 用量(可能在 delta 为空的末 chunk)
                const delta = data?.choices?.[0]?.delta;
                if (!delta) continue;
                // 思考增量字段兼容不同服务商:阿里云/DeepSeek 为 reasoning_content,
                // Groq(gpt-oss 系)为 reasoning
                const reasoningDelta =
                  delta.reasoning_content ?? delta.reasoning;
                if (reasoningDelta) {
                  reasoningContent += reasoningDelta;
                  // 首次收到思考内容:启动每秒计时,让标题秒数一秒一秒跳
                  if (!thinkStartTime) {
                    thinkStartTime = Date.now();
                    thinkTimer = setInterval(() => {
                      thinkSeconds = Math.floor(
                        (Date.now() - thinkStartTime) / 1000,
                      );
                      // 正文尚未出现时才需持续刷新思考秒数
                      if (!mainContent) {
                        doRender(false);
                      }
                    }, 1000);
                  }
                }
                if (delta.content) {
                  // 首次出现正文:停止思考计时,定格耗时秒数
                  if (thinkTimer && !mainContent) stopThinkTimer();
                  mainContent += delta.content;
                  pendingMain += delta.content;
                }
                scheduleRender();
              } catch (e) {}
            }
          }

          // 停止思考计时器并定格最终秒数
          function stopThinkTimer() {
            // 仅在计时器仍在运行(真正从"思考中"切到"停止")的那一刻定格秒数。
            // 后续重复调用(如流结束时再调一次)不再重算,否则会把正文生成耗时也算进去。
            if (thinkTimer) {
              clearInterval(thinkTimer);
              thinkTimer = null;
              if (thinkStartTime) {
                thinkSeconds = Math.floor((Date.now() - thinkStartTime) / 1000);
              }
            }
            if (tailTimer) {
              // 顺带清尾帧定时器,避免向已结束/作废的请求继续写入
              clearTimeout(tailTimer);
              tailTimer = null;
            }
          }

          function scheduleRender() {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
              rafId = null;
              doRender(false);
            });
          }

          function doRender(isFinal) {
            if (isStale()) return; // 请求已作废或 bubble 已移除,不再写入

            // 推进 committed/pending 拆分:将最后一个段落边界之前的内容定稿。
            // 为避免把未闭合的代码块(```)从中间切断导致渲染错乱,
            // 只有当拟定稿部分的反引号成对(偶数)时才提交。
            if (pendingMain && (isFinal || /\n\n/.test(pendingMain))) {
              let newlyCommitted = "";
              if (isFinal) {
                newlyCommitted = pendingMain;
                pendingMain = "";
              } else {
                const splitAt = pendingMain.lastIndexOf("\n\n") + 2;
                if (splitAt > 0) {
                  const candidate = pendingMain.slice(0, splitAt);
                  const fenceCount = (
                    (committedMain + candidate).match(/```/g) || []
                  ).length;
                  if (fenceCount % 2 === 0) {
                    newlyCommitted = candidate;
                    pendingMain = pendingMain.slice(splitAt);
                  }
                }
              }
              if (newlyCommitted) {
                committedMain += newlyCommitted;
                // 拆成独立段落(以空行分隔),每段单独成一个 DOM 节点
                newlyCommitted
                  .split(/\n{2,}/)
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
                  .forEach((seg) => committedSegments.push(seg));
              }
            }

            // 确保气泡内有思考槽与正文槽两个独立容器,只创建一次。
            // 正文槽再拆为 committed(已定稿、不再重写)+ pending(生成中、每帧重写),
            // 让已输出的段落 DOM 保持稳定,流式中也能正常选中/复制
            let mainSlot = assistantBubble.querySelector(".ai-main-slot");
            if (!mainSlot) {
              assistantBubble.innerHTML =
                '<div class="ai-think-slot"></div>' +
                '<div class="ai-main-slot"><div class="ai-committed"></div><div class="ai-pending"></div></div>';
              mainSlot = assistantBubble.querySelector(".ai-main-slot");
              renderedSegCount = 0; // 新容器,重置已 append 段数
            }

            // 思考框:增量更新,从不重建,保留用户展开/折叠状态
            if (reasoningContent) {
              const thinkSlot = assistantBubble.querySelector(".ai-think-slot");
              let det = thinkSlot.querySelector("details.ai-think-box");
              if (!det) {
                thinkSlot.innerHTML =
                  `<details class="ai-think-box" style="margin-bottom:8px;">` +
                  `<summary class="ai-think-summary" style="color:var(--text-mute);font-size:12px;cursor:pointer;user-select:none;"></summary>` +
                  `<div class="ai-think-content" style="color:var(--text-faint);font-size:12px;padding:8px;background:var(--bg-think);border-radius:6px;margin-top:4px;white-space:pre-wrap;"></div></details>`;
                det = thinkSlot.querySelector("details.ai-think-box");
              }
              const thinking = !isFinal && !mainContent;
              det.querySelector(".ai-think-summary").textContent = thinking
                ? `💭 思考中... (${thinkSeconds}s)`
                : `💭 思考过程 (耗时 ${thinkSeconds}s)`;
              det.querySelector(".ai-think-content").textContent =
                reasoningContent;
            }

            // 流结束时用完整正文做一次整体 Markdown 渲染。
            // 流式阶段为保证已输出段落可稳定选中/复制，会按空行拆成独立 DOM 节点；
            // 但分别调用 marked.parse 会破坏跨段 Markdown 结构（例如带空行的有序列表
            // 会重新从 1 编号）。最终整体渲染可恢复列表、引用、嵌套块等完整语义。
            if (isFinal && mainContent) {
              mainSlot.innerHTML = renderMarkdown(mainContent);
              return;
            }

            // 正文:committed 每段作为独立 DOM 节点,只 append 新增段落,旧节点永不重建
            // (复制任何已完成段落都不受后续输出影响);pending 每帧重写。两者都不影响思考框。
            const committedEl = mainSlot.querySelector(".ai-committed");
            const pendingEl = mainSlot.querySelector(".ai-pending");
            if (committedEl) {
              for (
                let i = renderedSegCount;
                i < committedSegments.length;
                i++
              ) {
                const segEl = document.createElement("div");
                segEl.className = "ai-seg";
                segEl.innerHTML = renderMarkdown(committedSegments[i]);
                committedEl.appendChild(segEl);
              }
              renderedSegCount = committedSegments.length;
            }
            // pending 段渲染:committed 推进与思考框更新已在上方每帧执行完毕,
            // 这里只对"正文未定稿段"的 marked.parse + innerHTML 做节流,降低长段落的重解析开销。
            // 规则:1内容未变则跳过;2距上次渲染不足 PENDING_RENDER_MS 则跳过,但挂一个尾帧兜底
            //       定时器保证最终会渲染;3isFinal(流结束)无条件完整渲染,绝不被节流跳过。
            if (pendingEl) {
              const PENDING_RENDER_MS = 80;

              // 计算并写入本帧应显示的 pending HTML
              const renderPending = () => {
                if (tailTimer) {
                  clearTimeout(tailTimer);
                  tailTimer = null;
                }
                if (pendingMain) {
                  pendingEl.innerHTML = !isFinal
                    ? renderMarkdown(pendingMain) +
                      '<span style="color:var(--accent);opacity:0.6;">▍</span>'
                    : renderMarkdown(pendingMain);
                } else if (!committedMain && reasoningContent) {
                  pendingEl.innerHTML =
                    '<span style="color:var(--text-faint);">AI 深度思考中...</span>';
                } else {
                  pendingEl.innerHTML = "";
                }
                lastRenderedPending = pendingMain;
                lastPendingRenderTs = Date.now();
              };

              if (isFinal) {
                renderPending(); // 流结束:强制渲染,定格最终态
              } else if (pendingMain === lastRenderedPending) {
                // 内容未变(如仅思考计时刷新触发的本帧):跳过 parse
              } else if (
                Date.now() - lastPendingRenderTs >=
                PENDING_RENDER_MS
              ) {
                renderPending();
              } else if (!tailTimer) {
                // 距上次渲染过近:本帧跳过,挂尾帧兜底,保证这段增量最终会显示
                tailTimer = setTimeout(() => {
                  tailTimer = null;
                  if (isStale()) return;
                  scheduleRender(); // 走正常帧渲染路径
                }, PENDING_RENDER_MS);
              }
            }
          }

          touchIdleTimer();
          while (true) {
            if (isStale()) {
              stopThinkTimer();
              clearIdleTimer();
              try {
                await reader.cancel();
              } catch (e) {}
              return;
            }
            const { done, value } = await reader.read();
            if (done) break;
            touchIdleTimer();

            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            processLines(lines);
          }

          // 流结束,停止思考计时
          stopThinkTimer();
          clearIdleTimer();

          // 冲刷解码器与最后一行(末尾可能没有换行符,否则丢失最后一个 token)
          buffer += decoder.decode();
          if (buffer.trim()) processLines([buffer]);

          if (isStale()) return; // 请求已作废,不再触发完成/错误回调

          // 如果整个流未产生任何内容,可能是接口返回了非 SSE 的错误体
          if (!mainContent && !reasoningContent) {
            isRequesting = false;
            currentRequest = null;
            onError(
              receivedError ||
                "AI 未返回内容,请检查模型名称、API Key 或接口配置",
            );
            updateChatSendButtonState();
            return;
          }

          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          doRender(true);
          isRequesting = false;
          currentRequest = null;
          updateTokenBar(usageInfo);
          // 仅把正文(content)交给上层写入历史;思考内容(reasoning_content)不作为
          // 正式回答进入 chatHistory,避免模型在后续多轮里把自己的"思考"当成已说过的回答。
          // 显示已由上面的 doRender(true) 完成(含思考折叠框),此处参数只影响历史。
          onComplete(mainContent);
          updateChatSendButtonState();
        } catch (err) {
          try {
            stopThinkTimer();
          } catch (e) {}
          try {
            clearIdleTimer();
          } catch (e) {}
          if (isStale()) return; // 主动中断导致的异常,静默忽略
          isRequesting = false;
          currentRequest = null;
          onError(receivedError || err?.message || "流读取中断");
          updateChatSendButtonState();
        }
      },
      onerror: function (err) {
        if (isStale()) return;
        isRequesting = false;
        currentRequest = null;
        onError(err?.error || err?.message || "网络请求失败,请检查配置或网络");
        updateChatSendButtonState();
      },
      ontimeout: function () {
        if (isStale()) return;
        isRequesting = false;
        currentRequest = null;
        onError(`请求超时:超过 ${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒未完成`);
        updateChatSendButtonState();
      },
    });
  }

  // 最后一次选中的模型按服务商分别持久化(不同服务商模型集合不同)
  function lastModelKey(provider) {
    return providerKey("ai_last_model", provider);
  }

  // 重建模型下拉选项,并恢复"最后一次选中的模型";
  // 若存的值不在当前主/备模型列表里(用户改过模型名)则回退到主模型
  function refreshModelSelect() {
    const select = document.getElementById("ai-model-select");
    if (!select) return;
    select.innerHTML = "";

    function addOption(value, labelSuffix) {
      if (!value) return;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `${value} ${labelSuffix}`;
      select.appendChild(option);
    }

    addOption(aiConfig.model1, "(主)");
    addOption(aiConfig.model2, "(备)");

    const saved = GM_getValue(lastModelKey(aiConfig.provider), "");
    if (saved && (saved === aiConfig.model1 || saved === aiConfig.model2)) {
      select.value = saved;
    } else if (aiConfig.model1) {
      select.value = aiConfig.model1;
    }
  }

  function updateChatSendButtonState() {
    const btn = document.getElementById("ai-chat-send");
    const textarea = document.getElementById("ai-chat-textarea");
    if (!btn || !textarea) return;

    // 请求进行中:按钮变为可点击的「终止」,点击中断回答
    if (isRequesting) {
      btn.textContent = "⏹";
      btn.title = "终止生成";
      btn.disabled = false;
      btn.classList.add("ai-chat-stop");
      btn.classList.remove("ai-chat-pill");
      return;
    }

    btn.classList.remove("ai-chat-stop");
    btn.title = "";
    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === "") {
      btn.textContent = "↑";
      btn.title = "发送";
      btn.disabled = true;
      btn.classList.remove("ai-chat-pill");
      textarea.placeholder = "请先配置 API Key...";
    } else if (chatHistory.length === 0) {
      btn.textContent = "总结";
      btn.title = "生成视频总结";
      btn.disabled = false;
      btn.classList.add("ai-chat-pill"); // 总结态:带文字的胶囊按钮
      textarea.placeholder = "点击“总结”获取视频内容总结...";
    } else {
      btn.textContent = "↑";
      btn.title = "发送";
      btn.disabled = false;
      btn.classList.remove("ai-chat-pill");
      textarea.placeholder = "向 AI 提问关于视频的内容...";
    }
  }

  // 更新顶部 token 用量显示。优先用接口返回的 usage;若接口未返回则隐藏
  // 重置会话 token 累计(切换视频/重新总结开启新会话时)
  function resetSessionTokens() {
    sessionTokens = { input: 0, output: 0 };
  }

  // 更新顶部 token 用量:显示本次请求用量 + 本次会话累计。
  // usage 为 null 时仅重新渲染(不累加);无任何数据时隐藏。
  function updateTokenBar(usage) {
    const bar = document.getElementById("ai-token-bar");
    if (!bar) return;
    if (
      usage &&
      (usage.prompt_tokens != null || usage.completion_tokens != null)
    ) {
      const input = usage.prompt_tokens ?? 0;
      const output = usage.completion_tokens ?? 0;
      sessionTokens.input += input;
      sessionTokens.output += output;
    }
    if (sessionTokens.input === 0 && sessionTokens.output === 0) {
      bar.style.display = "none";
      return;
    }
    const lastInput = usage?.prompt_tokens ?? "-";
    const lastOutput = usage?.completion_tokens ?? "-";
    bar.innerHTML =
      `<span title="本次请求:输入(含字幕/上下文) / 输出(回答)">本次 ↑${lastInput} ↓${lastOutput}</span>` +
      `<span title="本次会话累计消耗">累计 ↑${sessionTokens.input} ↓${sessionTokens.output}</span>`;
    bar.style.display = "flex";
  }

  function appendChatBubble(role, contentHTML) {
    const chatContainer = document.getElementById("ai-panel-chat");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = contentHTML;
    chatContainer.appendChild(bubble);

    if (role !== "assistant") {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    return bubble;
  }

  // 在 AI 气泡末尾附加「重新生成」按钮(避免重复添加)
  function attachRegenButton(bubble) {
    if (!bubble) return;
    // 只保留最后一条 AI 回答的重新生成按钮,清除其他气泡上的旧按钮
    const chatContainer = document.getElementById("ai-panel-chat");
    if (chatContainer) {
      chatContainer
        .querySelectorAll(".ai-regen-btn")
        .forEach((el) => el.remove());
    }
    const btn = document.createElement("button");
    btn.className = "ai-regen-btn";
    btn.innerHTML = "🔄 重新生成";
    btn.addEventListener("click", () => regenerateLast(bubble));
    bubble.appendChild(btn);
  }

  // 重新生成最后一条 AI 回答:复用其之前的用户输入/总结上下文
  function regenerateLast(bubble) {
    if (isRequesting) return; // 生成中不允许重新生成
    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === "") return;
    // 若历史末尾是上一次已完成的 assistant 回答,先移除(被终止/出错的不在历史中)
    if (
      chatHistory.length &&
      chatHistory[chatHistory.length - 1].role === "assistant"
    ) {
      chatHistory.pop();
    }
    // 需要至少有一条用户/系统消息作为生成上下文
    if (!chatHistory.some((m) => m.role === "user")) return;
    bubble.innerHTML =
      '<span style="color:var(--text-faint);">AI 响应中...</span>';
    updateChatSendButtonState();
    runChatStream(bubble);
  }

  // 统一的流式对话调用封装:接管 onComplete/onError 重复样板。
  // onDone(plainText) 由调用方决定完成后的额外处理(如总结场景更新提示文案)。
  function runChatStream(assistantBubble, onDone) {
    activeAssistantBubble = assistantBubble; // 记录活动气泡,供终止时标注
    requestAIStream(
      chatHistory,
      (plainTextForHistory) => {
        activeAssistantBubble = null;
        // 只有真正的正文才进历史;若模型仅产出思考内容(plainTextForHistory 为空),
        // 不污染 chatHistory,改为在气泡内提示,并保留已渲染的思考折叠框 + 重新生成按钮。
        if (plainTextForHistory && plainTextForHistory.trim()) {
          chatHistory.push({
            role: "assistant",
            content: plainTextForHistory,
          });
        } else {
          assistantBubble.innerHTML +=
            '<div style="color:var(--text-faint);font-size:12px;margin-top:6px;">⚠️ 模型只返回了思考内容,未生成正式回答,可点击下方「重新生成」</div>';
        }
        if (typeof onDone === "function") onDone(plainTextForHistory);
        attachRegenButton(assistantBubble);
      },
      (errMsg) => {
        activeAssistantBubble = null;
        assistantBubble.innerHTML = `<span style="color:#f5222d;">❌ ${escapeHtml(errMsg)}</span>`;
        attachRegenButton(assistantBubble);
      },
      assistantBubble,
    );
  }

  // 获取当前视频标题:依次尝试多个 DOM 选择器,均未命中时回退到 document.title。
  function getVideoTitle() {
    for (const sel of SELECTORS.videoTitle) {
      const el = document.querySelector(sel);
      if (el) {
        // 优先用 title 属性(完整标题,不受省略号影响),其次用可见文本
        const t = (el.getAttribute("title") || el.textContent || "").trim();
        if (t) return t;
      }
    }
    // 回退:去掉 B 站页面标题末尾的"_哔哩哔哩_bilibili"等后缀
    const docTitle = (document.title || "").trim();
    if (docTitle) {
      return docTitle
        .replace(/_哔哩哔哩.*$/, "")
        .replace(/-哔哩哔哩.*$/, "")
        .trim();
    }
    return "";
  }

  const MAX_TRANSCRIPT_PROMPT_CHARS = 60000;
  const MAX_CHAT_CONTEXT_MESSAGES = 12;

  function prepareTranscriptForPrompt(plainText) {
    const text = String(plainText || "");
    if (text.length <= MAX_TRANSCRIPT_PROMPT_CHARS) {
      return { text, note: "" };
    }
    const headLen = Math.floor(MAX_TRANSCRIPT_PROMPT_CHARS * 0.72);
    const tailLen = MAX_TRANSCRIPT_PROMPT_CHARS - headLen;
    const omitted = text.length - headLen - tailLen;
    return {
      text:
        text.slice(0, headLen) +
        `

[系统提示:字幕过长,中间约 ${omitted} 个字符已省略。请基于可见片段总结,并明确说明可能遗漏中段细节。]

` +
        text.slice(-tailLen),
      note: `⚠️ 字幕较长(${text.length} 字符),为避免超出模型上下文,已保留开头和结尾并省略中间约 ${omitted} 字符。`,
    };
  }

  function buildRequestMessages(messages) {
    if (!Array.isArray(messages) || messages.length <= MAX_CHAT_CONTEXT_MESSAGES) {
      return messages;
    }
    const preserved = [];
    const used = new Set();
    if (messages[0]?.role === "system") {
      preserved.push(messages[0]);
      used.add(0);
    }
    const firstUserIndex = messages.findIndex((m, idx) => !used.has(idx) && m.role === "user");
    if (firstUserIndex >= 0) {
      preserved.push(messages[firstUserIndex]);
      used.add(firstUserIndex);
      const firstAssistantIndex = messages.findIndex(
        (m, idx) => idx > firstUserIndex && m.role === "assistant",
      );
      if (firstAssistantIndex >= 0) {
        preserved.push(messages[firstAssistantIndex]);
        used.add(firstAssistantIndex);
      }
    }

    const tailBudget = Math.max(4, MAX_CHAT_CONTEXT_MESSAGES - preserved.length - 1);
    const tail = messages
      .map((m, idx) => ({ m, idx }))
      .filter(({ idx }) => !used.has(idx))
      .slice(-tailBudget)
      .map(({ m }) => m);

    return [
      ...preserved,
      {
        role: "system",
        content:
          "为控制上下文长度,较早的部分对话已省略。请优先依据保留的视频字幕/摘要和最近对话回答。",
      },
      ...tail,
    ];
  }

  function triggerSummary(plainText) {
    abortCurrentRequest(); // 中断上一次可能正在进行的请求(如重复点击「重新总结」)
    const chatContainer = document.getElementById("ai-panel-chat");
    chatContainer.innerHTML = "";
    chatHistory = [];
    resetSessionTokens(); // 重新总结开启新会话,累计清零
    updateTokenBar(null);

    const systemPrompt =
      "你是一个得力的视频内容总结与问答助手。请直接输出 Markdown 格式的排版内容。";

    // 抓取当前视频标题,并将 prompt 中的 {{video_title}} 占位符动态替换为真实标题
    currentVideoTitle = getVideoTitle();
    const titleForPrompt = currentVideoTitle || "(未获取到标题)";
    const promptWithTitle = aiConfig.prompt.replace(
      /\{\{\s*video_title\s*\}\}/g,
      titleForPrompt,
    );
    // 如果用户的自定义 prompt 里没有用到 {{video_title}} 占位符,则在字幕前补上标题信息,避免丢失
    const usedPlaceholder = /\{\{\s*video_title\s*\}\}/.test(aiConfig.prompt);
    const titleBlock =
      !usedPlaceholder && currentVideoTitle
        ? `视频标题:${currentVideoTitle}\n\n`
        : "";
    const preparedTranscript = prepareTranscriptForPrompt(plainText);
    const userPrompt = `${promptWithTitle}\n\n${titleBlock}字幕内容:\n${preparedTranscript.text}`;

    chatHistory.push({ role: "system", content: systemPrompt });
    chatHistory.push({ role: "user", content: userPrompt });
    if (preparedTranscript.note) {
      appendChatBubble("system", escapeHtml(preparedTranscript.note));
    }

    const assistantBubble = appendChatBubble(
      "assistant",
      '<span style="color:var(--text-faint);">AI 响应中...</span>',
    );

    runChatStream(assistantBubble);
  }

  function handleSendChat() {
    if (isRequesting) {
      stopCurrentGeneration(); // 生成中点击终止按钮,中断当前回答
      return;
    }

    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === "") {
      const chatContainer = document.getElementById("ai-panel-chat");
      chatContainer.innerHTML =
        '<div class="chat-bubble system" style="color:#ffcc00">⚠️ 请先点击右上角 ⚙️ 配置您的 API Key。</div>';
      document.getElementById("ai-panel-settings-container").style.display =
        "block";
      return;
    }

    if (chatHistory.length === 0) {
      ensureSubtitleAndExecuteGlobal(() => {
        handleAISummaryBtn();
      });
      return;
    }

    const inputEl = document.getElementById("ai-chat-textarea");
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    inputEl.style.height = "24px";
    appendChatBubble("user", escapeHtml(text));

    chatHistory.push({ role: "user", content: text });
    const assistantBubble = appendChatBubble(
      "assistant",
      '<span style="color:var(--text-faint);">AI 响应中...</span>',
    );

    const chatContainer = document.getElementById("ai-panel-chat");
    chatContainer.scrollTop = chatContainer.scrollHeight;

    runChatStream(assistantBubble);
  }

  function handleAISummaryBtn() {
    const panel = document.getElementById("bili-ai-panel");
    const minTab = document.getElementById("bili-ai-minimized");

    panel.style.display = "flex";
    minTab.style.display = "none";

    if (chatHistory.length > 0) return; // 如果已经总结过,保留对话历史不重新刷新

    const chatContainer = document.getElementById("ai-panel-chat");
    if (!aiConfig.apiKey) {
      chatContainer.innerHTML =
        '<div class="chat-bubble system" style="color:#ffcc00">⚠️ 请先点击右上角 ⚙️ 配置您的 API Key。</div>';
      document.getElementById("ai-panel-settings-container").style.display =
        "block";
      return;
    }

    chatContainer.innerHTML =
      '<div class="chat-bubble system">获取字幕中...</div>';

    fetchSubtitleText({ withTimestamps: true })
      .then((plainText) => {
        currentSubtitle = plainText;
        triggerSummary(plainText);
      })
      .catch((err) => {
        chatContainer.innerHTML = `<div class="chat-bubble system" style="color:#f5222d;">❌ 提取字幕失败: ${escapeHtml(err.message)}</div>`;
      });
  }

  // 创建整个 AI UI(侧拉常驻按钮 + 对话面板)
  function createAIPanel() {
    if (document.getElementById("bili-ai-panel")) return;

    const minTab = document.createElement("div");
    minTab.id = "bili-ai-minimized";
    minTab.innerHTML = `<span>AI总结</span>`;
    document.body.appendChild(minTab);

    // 应用保存的拖拽位置(仅上下,始终贴右侧),并限制在可视区内
    function applyMinTabPos(top) {
      if (typeof top !== "number") return;
      const h = minTab.offsetHeight || 110;
      const clamped = Math.max(0, Math.min(top, window.innerHeight - h));
      minTab.style.top = clamped + "px";
      minTab.style.transform = "none";
    }
    applyMinTabPos(GM_getValue("minTabTop", null));

    // 拖拽逻辑:仅纵向移动,移动超过阈值才视为拖拽,否则仍为点击(展开面板)
    // mousemove/mouseup 仅在拖拽期间(mousedown 后)绑定到 document,拖拽结束立即移除,
    // 避免未拖拽时每次鼠标移动都进入回调。
    let dragging = false;
    let moved = false;
    let startY = 0;
    let originTop = 0;

    function onDragMove(e) {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 5) return; // 小于阈值不算拖拽
      if (!moved) minTab.classList.add("dragging"); // 首次超阈值:关掉 transition 使其跟手
      moved = true;
      const h = minTab.offsetHeight;
      const top = Math.max(0, Math.min(originTop + dy, window.innerHeight - h));
      minTab.style.top = top + "px";
      minTab.style.transform = "none";
    }

    function onDragEnd() {
      if (!dragging) return;
      dragging = false;
      minTab.classList.remove("dragging");
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
      if (moved) {
        GM_setValue("minTabTop", minTab.getBoundingClientRect().top); // 持久化,切换视频后保留
      }
    }

    minTab.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      originTop = minTab.getBoundingClientRect().top;
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
      e.preventDefault(); // 避免拖拽时选中文本
    });

    minTab.addEventListener("click", (e) => {
      if (moved) {
        // 刚拖拽完成的这次 click 不触发展开
        moved = false;
        return;
      }
      ensureSubtitleAndExecuteGlobal(() => {
        handleAISummaryBtn();
      });
    });

    const panel = document.createElement("div");
    panel.id = "bili-ai-panel";
    panel.innerHTML = `
            <div class="ai-panel-header">
                <div class="ai-panel-header-left">
                    <span class="ai-panel-title">✨ AI</span>
                    <select id="ai-model-select" class="ai-model-select" title="切换模型">
                        <option value="${escapeAttr(aiConfig.model1)}">${escapeHtml(aiConfig.model1)} (主)</option>
                        ${aiConfig.model2 ? `<option value="${escapeAttr(aiConfig.model2)}">${escapeHtml(aiConfig.model2)} (备)</option>` : ""}
                    </select>
                    <span class="ai-refresh-btn" id="ai-refresh-btn" title="重新总结">🔄</span>
                </div>
                <div class="ai-panel-header-actions">
                    <span class="ai-icon-btn" id="ai-setting-toggle" title="设置">⚙️</span>
                    <span class="ai-icon-btn" id="ai-minimize-btn" title="收起到侧边">➖</span>
                </div>
            </div>

            <div class="ai-token-bar" id="ai-token-bar" style="display:none;"></div>

            <div class="ai-panel-chat" id="ai-panel-chat">
                <div class="chat-bubble system">准备就绪。</div>
            </div>

            <div class="ai-panel-settings" id="ai-panel-settings-container">
                <div style="margin-bottom: 4px; color: var(--text-mute);">服务商与API配置:</div>
                <div class="ai-settings-row">
                    <select id="set-provider" class="ai-input" style="width: 38%; padding: 4px;">
                        <option value="siliconflow" ${aiConfig.provider === "siliconflow" ? "selected" : ""}>硅基流动</option>
                        <option value="deepseek" ${aiConfig.provider === "deepseek" ? "selected" : ""}>DeepSeek官方</option>
                        <option value="aliyun" ${aiConfig.provider === "aliyun" ? "selected" : ""}>阿里云百炼</option>
                        <option value="custom" ${aiConfig.provider === "custom" ? "selected" : ""}>自定义</option>
                    </select>
                    <div style="flex: 1; display: flex; gap: 6px; align-items: flex-start; min-width: 0;">
                        <input type="password" id="set-apikey" class="ai-input" style="flex: 1; width: auto; min-width: 0;" value="" autocomplete="new-password" placeholder="${aiConfig.apiKey ? "API Key 已配置，输入新 Key 可替换" : "API Key (sk-...)"}">
                        <button type="button" id="set-apikey-clear" class="ai-input" style="width: auto; white-space: nowrap; cursor: pointer;" title="清除当前服务商保存的 API Key">清除</button>
                    </div>
                </div>
                <input type="text" id="set-endpoint" class="ai-input" value="${escapeAttr(aiConfig.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions" style="display: ${aiConfig.provider === "custom" ? "block" : "none"};">
                <div id="set-endpoint-hint" style="display: ${aiConfig.provider === "custom" ? "block" : "none"}; color: var(--text-faint); font-size: 11px; margin: 2px 0 4px 0;">请填写完整的 Chat Completions 地址,例如:https://api.openai.com/v1/chat/completions</div>

                <div class="ai-settings-row">
                    <input type="text" id="set-model1" class="ai-input" value="${escapeAttr(aiConfig.model1)}" placeholder="主模型">
                    <input type="text" id="set-model2" class="ai-input" value="${escapeAttr(aiConfig.model2)}" placeholder="备用模型">
                </div>
                <div id="set-thinking-row" style="margin: 4px 0 8px 0; display: ${aiConfig.provider === "custom" ? "none" : "block"};">
                    <label style="color:var(--text); font-size:12px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" id="set-thinking" ${aiConfig.thinking ? "checked" : ""}>
                        开启思考模式 (Reasoning)
                    </label>
                </div>
                <div id="set-extrabody-row" style="margin: 4px 0 8px 0; display: ${aiConfig.provider === "custom" ? "block" : "none"};">
                    <div style="color: var(--text-mute); font-size: 12px; margin-bottom: 4px;">额外请求参数 extra_body (JSON,可选):</div>
                    <textarea id="set-extrabody" class="ai-input" style="height: 60px; resize: vertical; margin-bottom: 0; font-family: monospace; font-size: 12px;" placeholder='例如:{"enable_thinking": true} 或 {"thinking": {"type": "disabled"}} 或 {"reasoning_effort": "high"}'>${escapeHtml(aiConfig.extraBody || "")}</textarea>
                    <div style="color: var(--text-faint); font-size: 11px; margin-top: 3px;">关闭思考:通义/硅基流动用 <code>enable_thinking</code>，DeepSeek/Kimi 系用 <code>{"thinking": {"type": "disabled"}}</code>。</div>
                    <div id="set-extrabody-err" style="display:none; color: var(--err, #d9363e); font-size: 11px; margin-top: 4px;"></div>
                </div>
                <div style="margin: 0 0 4px 0; color: var(--text-mute);">自定义总结 Prompt:</div>
                <textarea id="set-prompt" class="ai-input" style="height: 110px; resize: vertical; margin-bottom: 0;" placeholder="要求 AI 如何进行总结...">${escapeHtml(aiConfig.prompt || "")}</textarea>
                <div style="margin-top: 4px; color: var(--text-faint); font-size: 11px;">提示:可在 Prompt 中使用 <code>{{video_title}}</code> 占位符,总结时会自动替换为当前视频标题。</div>
                <div style="margin-top: 6px; color: var(--text-faint); font-size: 11px; text-align: center;">再次点击 ⚙️ 即可保存并关闭设置</div>
            </div>

            <div class="ai-panel-input-area">
                <div class="ai-chat-inputwrap">
                    <textarea id="ai-chat-textarea" class="ai-chat-textarea" placeholder="向 AI 提问关于视频的内容..."></textarea>
                </div>
                <button id="ai-chat-send" class="ai-chat-send" title="发送">↑</button>
            </div>
        `;
    document.body.appendChild(panel);

    // 用 JS 直接回填 textarea 值，绕开 HTML 解析对“标签内容”的处理（前导换行被剔除、
    // 实体被解码等），保证 textarea 显示值与存储值逐字节一致，避免保存时误判为“未变更”。
    document.getElementById("set-prompt").value = aiConfig.prompt || "";

    // API Key 只保存在 GM 存储与脚本闭包中，不把已保存的真实值回填到页面 DOM。
    // 输入框为空表示“保持原值”；只有输入新的非空 Key 才覆盖，删除则使用显式清除按钮。
    const apiKeyInput = document.getElementById("set-apikey");
    const apiKeyClearBtn = document.getElementById("set-apikey-clear");
    function resetApiKeyInput() {
      apiKeyInput.value = "";
      apiKeyInput.dataset.dirty = "false";
      apiKeyInput.placeholder = aiConfig.apiKey
        ? "API Key 已配置，输入新 Key 可替换"
        : "API Key (sk-...)";
    }
    apiKeyInput.addEventListener("input", () => {
      apiKeyInput.dataset.dirty = "true";
    });
    apiKeyClearBtn.addEventListener("click", () => {
      const provider = document.getElementById("set-provider").value;
      aiConfig.apiKey = "";
      GM_setValue(providerKey(CONFIG_DICT.apiKey.key, provider), "");
      resetApiKeyInput();
      updateChatSendButtonState();
      showInfoBar("✅ API Key 已清除", "success", 1200);
    });
    resetApiKeyInput();

    // 为 span 图标按钮补充基础可访问性:可聚焦、可用 Enter/Space 触发。
    [
      [minTab, "打开 AI 总结"],
      [document.getElementById("ai-refresh-btn"), "重新总结"],
      [document.getElementById("ai-setting-toggle"), "设置"],
      [document.getElementById("ai-minimize-btn"), "收起到侧边"],
    ].forEach(([el, label]) => {
      if (!el) return;
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", label);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      });
    });


    // 设置栏:服务商切换事件绑定
    const provSelect = document.getElementById("set-provider");
    let prevProvider = aiConfig.provider; // 记录切换前的服务商
    provSelect.addEventListener("change", function () {
      const apikeyInput = document.getElementById("set-apikey");
      const epInput = document.getElementById("set-endpoint");
      const m1Input = document.getElementById("set-model1");
      const m2Input = document.getElementById("set-model2");
      const ebInput = document.getElementById("set-extrabody");
      const thinkRow = document.getElementById("set-thinking-row");
      const ebRow = document.getElementById("set-extrabody-row");

      // 1) 先暂存切换前服务商在表单里的当前输入(防止某字段尚未 blur 即被切走)
      // API Key 输入框不回填旧值：仅在用户确实输入了新的非空 Key 时覆盖。
      // 空输入表示保持原 Key，删除必须使用“清除”按钮。
      if (
        apikeyInput.dataset.dirty === "true" &&
        apikeyInput.value.trim()
      ) {
        GM_setValue(
          providerKey("ai_api_key", prevProvider),
          apikeyInput.value.trim(),
        );
      }
      GM_setValue(providerKey("ai_model1", prevProvider), m1Input.value);
      GM_setValue(providerKey("ai_model2", prevProvider), m2Input.value);
      if (prevProvider === "custom") {
        GM_setValue(providerKey("ai_endpoint", "custom"), epInput.value);
        GM_setValue(providerKey("ai_extra_body", "custom"), ebInput.value);
      }

      // 2) 立即提交服务商选择本身:更新内存 aiConfig 并持久化 ai_provider,
      //    使「切换服务商后不关设置直接刷新」也能记住新服务商,
      //    与下方各字段「失焦即保存」保持一致的即时持久化时序。
      const target = this.value;
      aiConfig.provider = target;
      GM_setValue(CONFIG_DICT.provider.key, target);

      // 3) 按目标服务商把已存配置加载进内存 aiConfig,再回填表单(form 与 aiConfig 一致)
      loadProviderConfig(target);
      resetApiKeyInput();
      m1Input.value = aiConfig.model1;
      m2Input.value = aiConfig.model2;
      epInput.value = aiConfig.endpoint;
      ebInput.value = aiConfig.extraBody || "";

      // 4) 自定义服务商:显示 endpoint + extra_body,隐藏思考勾选;其余相反
      const isCustom = target === "custom";
      epInput.style.display = isCustom ? "block" : "none";
      const epHint = document.getElementById("set-endpoint-hint");
      if (epHint) epHint.style.display = isCustom ? "block" : "none";
      ebRow.style.display = isCustom ? "block" : "none";
      thinkRow.style.display = isCustom ? "none" : "block";

      refreshModelSelect(); // 模型集合随服务商变化,重建下拉并恢复最后选中项
      updateChatSendButtonState(); // apiKey 可能变化,刷新发送按钮态
      validateExtraBody(); // 重新校验切换后的 extra_body

      prevProvider = target;
    });

    // extra_body JSON 格式校验:输入时实时提示,空内容视为合法
    function validateExtraBody() {
      const eb = document.getElementById("set-extrabody");
      const err = document.getElementById("set-extrabody-err");
      if (!eb || !err) return true;
      const val = eb.value.trim();
      if (!val) {
        err.style.display = "none";
        eb.style.borderColor = "";
        return true;
      }
      try {
        const parsed = JSON.parse(val);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("需为 JSON 对象");
        }
        err.style.display = "none";
        eb.style.borderColor = "";
        return true;
      } catch (e) {
        err.textContent = "⚠️ JSON 格式错误:" + e.message;
        err.style.display = "block";
        eb.style.borderColor = "#d9363e";
        return false;
      }
    }
    document
      .getElementById("set-extrabody")
      .addEventListener("input", validateExtraBody);
    validateExtraBody(); // 初始校验一次

    // 单字段即时持久化:某设置输入失焦(复选框为 change)时,只在该字段较 aiConfig
    // 有实际改动时写回 aiConfig 并按其存储策略持久化。这样「改动后直接刷新」也不丢,
    // 与服务商切换的即时持久化时序保持一致,无需等到点齿轮关闭设置。
    function saveField(k) {
      const config = CONFIG_DICT[k];
      if (!config) return false;
      const el = document.getElementById(config.el);
      if (!el) return false;

      const provEl = document.getElementById(CONFIG_DICT.provider.el);
      const curProvider = provEl ? provEl.value : aiConfig.provider;

      // 已保存的 API Key 不存在于 DOM 中。只有用户输入新的非空 Key 时才覆盖；
      // 空输入保持原值，删除操作由独立的“清除”按钮负责。
      if (k === "apiKey") {
        const dirty = el.dataset.dirty === "true";
        const newKey = el.value.trim();
        if (!dirty || !newKey || newKey === aiConfig.apiKey) {
          resetApiKeyInput();
          return false;
        }
        aiConfig.apiKey = newKey;
        GM_setValue(providerKey(config.key, curProvider), newKey);
        resetApiKeyInput();
        updateChatSendButtonState();
        showInfoBar("✅ API Key 已保存", "success", 900);
        return true;
      }

      const newVal = config.isCheckbox ? el.checked : el.value;
      if (newVal === aiConfig[k]) return false; // 无改动不写、不提示
      aiConfig[k] = newVal;
      if (config.perProvider) {
        // endpoint 对 aliyun/deepseek/siliconflow 为固定值,无需存储;其余按服务商后缀存
        if (!(k === "endpoint" && curProvider !== "custom")) {
          GM_setValue(providerKey(config.key, curProvider), newVal);
        }
      } else {
        GM_setValue(config.key, newVal);
      }
      // 受影响的 UI 即时刷新
      if (k === "model1" || k === "model2") refreshModelSelect();
      showInfoBar("✅ 已保存", "success", 900);
      return true;
    }

    // 文本类输入「失焦即保存」;复选框用 change(失焦语义不直观)。
    // provider 已在其专属 change 处理器中即时持久化,不在此处重复绑定。
    ["apiKey", "endpoint", "model1", "model2", "extraBody", "prompt"].forEach(
      (key) => {
        const el = document.getElementById(CONFIG_DICT[key].el);
        if (el) el.addEventListener("blur", () => saveField(key));
      },
    );
    const thinkEl = document.getElementById(CONFIG_DICT.thinking.el);
    if (thinkEl) thinkEl.addEventListener("change", () => saveField("thinking"));

    // 防止面板内滚动穿透到底层视频页面:在整个面板上统一拦截滚轮。
    // 找到事件路径上最近的可滚动容器;若存在且未到边界则放行,
    // 到边界、不可滚动或点在空白区域时一律 preventDefault,防止触发整页滚动。
    panel.addEventListener(
      "wheel",
      (e) => {
        e.stopPropagation();
        // 从事件起点向上查找面板内可纵向滚动的容器
        let node = e.target;
        let scroller = null;
        while (node && node !== panel) {
          if (node.scrollHeight > node.clientHeight) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY)) {
              scroller = node;
              break;
            }
          }
          node = node.parentElement;
        }
        if (!scroller) {
          e.preventDefault(); // 无可滚动区域(header/输入区/空白),直接吃掉
          return;
        }
        const { scrollTop, scrollHeight, clientHeight } = scroller;
        const atTop = scrollTop <= 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
        if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
          e.preventDefault(); // 在边界继续向边界外滚动
        }
      },
      { passive: false },
    );

    // 面板内按键事件
    function collapsePanel() {
      panel.style.display = "none";
      minTab.style.display = "flex";
    }
    document
      .getElementById("ai-minimize-btn")
      .addEventListener("click", collapsePanel);

    // 键盘快捷键:Esc 打断当前回复;s 唤起/收起 AI 总结(输入状态不触发)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // 面板已收起:不拦截 Esc,交给浏览器执行原生行为(如退出 Safari 全屏)。
        // 若仍在生成中则保留原有“Esc 中断生成”行为,但不阻止默认动作。
        if (isElHidden(panel)) {
          if (isRequesting) stopCurrentGeneration();
          return;
        }

        // 面板展开时,下面任一动作都会“消费”这次 Esc,需 preventDefault,
        // 避免 Safari 同时退出全屏。
        // 1) 回答中:打断生成
        if (isRequesting) {
          e.preventDefault();
          stopCurrentGeneration();
          return;
        }
        // 2) 焦点在面板输入框:先取消聚焦
        const chatInput = document.getElementById("ai-chat-textarea");
        if (chatInput && document.activeElement === chatInput) {
          e.preventDefault();
          chatInput.blur();
          return;
        }
        // 3) 收起面板
        e.preventDefault();
        collapsePanel();
        return;
      }

      // 在输入框/文本区/可编辑元素中打字,或带修饰键时不触发
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (t && t.isContentEditable)
      )
        return;

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        // s 切换:已弹出则收起,未弹出则唤起
        if (!isElHidden(panel)) {
          collapsePanel();
        } else {
          ensureSubtitleAndExecuteGlobal(() => {
            handleAISummaryBtn();
          });
        }
      }
    });

    document.getElementById("ai-refresh-btn").addEventListener("click", () => {
      if (!currentSubtitle) return;
      triggerSummary(currentSubtitle);
    });

    // 保存设置:读取面板表单写回 aiConfig 并持久化。仅在确实有改动时写入,返回是否发生了变更
    function saveSettings() {
      let changed = false;
      // 当前面板选中的服务商(决定 perProvider 项存到哪个后缀)
      const provEl = document.getElementById(CONFIG_DICT.provider.el);
      const curProvider = provEl ? provEl.value : aiConfig.provider;
      for (let k in CONFIG_DICT) {
        const config = CONFIG_DICT[k];
        const el = document.getElementById(config.el);
        if (!el) continue;

        // API Key 不参与普通表单回填和空值保存。只有用户输入新的非空值才覆盖；
        // 否则继续保留 GM 存储中的现有 Key。
        if (k === "apiKey") {
          const dirty = el.dataset.dirty === "true";
          const newKey = el.value.trim();
          if (dirty && newKey && newKey !== aiConfig.apiKey) {
            aiConfig.apiKey = newKey;
            GM_setValue(providerKey(config.key, curProvider), newKey);
            changed = true;
          }
          resetApiKeyInput();
          continue;
        }

        const newVal = config.isCheckbox ? el.checked : el.value;
        if (newVal === aiConfig[k]) continue;
        aiConfig[k] = newVal;
        if (config.perProvider) {
          // endpoint 对 aliyun/deepseek/siliconflow 为固定值,无需存储;其余按服务商后缀存
          if (!(k === "endpoint" && curProvider !== "custom")) {
            GM_setValue(providerKey(config.key, curProvider), newVal);
          }
        } else {
          GM_setValue(config.key, newVal);
        }
        changed = true;
      }

      if (changed) {
        refreshModelSelect(); // 模型名可能变了，重建下拉并恢复最后选中项
        updateChatSendButtonState();
      }
      return changed;
    }

    function closeSettings() {
      const box = document.getElementById("ai-panel-settings-container");
      if (isElHidden(box)) return;
      const changed = saveSettings();
      box.style.display = "none";
      if (changed) showInfoBar("✅ 设置已保存", "success", 1200);
    }

    document
      .getElementById("ai-setting-toggle")
      .addEventListener("click", () => {
        const box = document.getElementById("ai-panel-settings-container");
        // 初始隐藏由 CSS 类控制,内联 style.display 为空;isElHidden 会处理该回退
        const isOpen = !isElHidden(box);
        if (isOpen) {
          closeSettings();
        } else {
          box.style.display = "block";
        }
      });

    // 设置面板打开时,点击面板内的非设置区域(聊天区/顶栏/输入区等)自动保存并关闭
    panel.addEventListener("mousedown", (e) => {
      const box = document.getElementById("ai-panel-settings-container");
      if (isElHidden(box)) return;
      const toggle = document.getElementById("ai-setting-toggle");
      // 点击发生在设置面板内或设置齿轮上时不处理
      if (box.contains(e.target) || (toggle && toggle.contains(e.target)))
        return;
      closeSettings();
    });

    document
      .getElementById("ai-chat-send")
      .addEventListener("click", handleSendChat);
    document
      .getElementById("ai-chat-textarea")
      .addEventListener("keydown", (e) => {
        // 输入法合成中(如中文拼音选词)按 Enter 是确认候选词,不应触发发送
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          // 回答进行中:Enter 不终止生成(终止只能点发送按钮的 ⏹)
          if (isRequesting) return;
          handleSendChat();
        }
      });

    const textarea = document.getElementById("ai-chat-textarea");
    textarea.addEventListener("input", function () {
      this.style.height = "24px";
      this.style.height = this.scrollHeight + "px";
    });

    // 模型下拉：切换时按服务商持久化“最后一次选中的模型”，下次打开页面/视频恢复
    document
      .getElementById("ai-model-select")
      .addEventListener("change", function () {
        GM_setValue(lastModelKey(aiConfig.provider), this.value);
      });
    refreshModelSelect(); // 恢复上次选中的模型

    // 初始化按钮状态
    updateChatSendButtonState();
  }

  // 抽象公共的轮询获取逻辑
  function waitForSubtitleUrls(retries = 20, interval = 100) {
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (getSubtitleUrls().length > 0) {
          clearInterval(timer);
          resolve();
        } else {
          retries--;
          if (retries <= 0) {
            clearInterval(timer);
            reject(new Error("自动获取字幕超时"));
          }
        }
      }, interval);
    });
  }

  // 【全局自动检测】针对外部常驻悬浮窗,如果找不到URL,尝试唤起字幕菜单获取
  async function ensureSubtitleAndExecuteGlobal(actionCallback) {
    if (getSubtitleUrls().length > 0) {
      actionCallback();
      return;
    }

    showInfoBar("自动加载字幕资源中...", "info", 1500);

    // 1) 尝试唤起字幕菜单以触发字幕资源加载。刚切换视频时播放器控件可能尚未渲染,
    //    先短轮询等待 subToggle 出现;期间若字幕已自行就绪则跳过点击。
    let langItem = document.querySelector(SELECTORS.subtitleLangItem);
    if (!langItem) {
      let subToggle = null;
      for (let i = 0; i < 20; i++) {
        // 最多等 ~3s 让播放器渲染
        if (getSubtitleUrls().length > 0) break; // 字幕已就绪,无需再点菜单
        subToggle = document.querySelector(SELECTORS.subtitleToggle);
        if (subToggle) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (subToggle) {
        subToggle.dispatchEvent(new MouseEvent("mouseenter"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        langItem = document.querySelector(SELECTORS.subtitleLangItem);
      }
    }
    if (langItem) langItem.click();

    // 2) 轮询等待字幕 URL 出现,覆盖两种来源:播放器自身发起的字幕请求(被网络拦截
    //    捕获)、初始状态脚本内嵌的 URL(getSubtitleUrls 为空时会重扫脚本)。
    //    给足时间应对刚导航完成时较慢的加载,避免过早判定失败。
    try {
      await waitForSubtitleUrls(30, 150); // ~4.5s
      actionCallback();
    } catch (err) {
      // 失败反馈:面板已展开则写红色系统气泡(用户能即刻知晓),未展开只用 infoBar,
      // 不强行弹窗(展开面板本应由用户主动点悬浮球触发,已确立的交互模式)。
      const aiPanel = document.getElementById("bili-ai-panel");
      if (aiPanel && !isElHidden(aiPanel)) {
        const chatContainer = document.getElementById("ai-panel-chat");
        if (chatContainer) {
          chatContainer.innerHTML =
            '<div class="chat-bubble system" style="color:#f5222d;">❌ 未检测到字幕资源,本视频可能没有字幕(也未开启 AI 字幕)。请手动点开一次字幕设置后重试。</div>';
        }
      }
      showInfoBar("未检测到字幕资源,本视频可能无字幕", "error");
    }
  }

  // 【局部自动检测】针对字幕菜单里的复制按钮
  async function ensureSubtitleAndExecute(itemElement, actionCallback) {
    if (getSubtitleUrls().length === 0) {
      showInfoBar("自动加载字幕URL中...", "info", 1000);
      itemElement.click();

      try {
        await waitForSubtitleUrls();
      } catch (err) {
        showInfoBar("自动获取字幕超时,请手动点击一下字幕语言。", "error");
        return;
      }
    }
    actionCallback();
  }

  function createGlobalObserver() {
    // 向字幕语言项注入"[复制]"按钮
    function injectCopyButtons() {
      const subtitleItems = document.querySelectorAll(
        SELECTORS.subtitleLangItem,
      );
      if (subtitleItems.length === 0) return;

      subtitleItems.forEach((item) => {
        if (item.querySelector(".bilibili-subtitle-actions")) return;

        const actionsContainer = document.createElement("div");
        actionsContainer.className = "bilibili-subtitle-actions";
        actionsContainer.style.cssText =
          "display: inline-flex; align-items: center; margin-left: 0.6em; vertical-align: middle;";

        const btnStyle = `background: transparent; border: none; color: white; cursor: pointer; font-size: 0.85em; padding: 0 0.3em; line-height: 1; display: inline-flex; align-items: center; transition: all 0.2s ease;`;

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "[复制]";
        copyBtn.style.cssText = btnStyle;
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          ensureSubtitleAndExecute(item, handleCopySubtitle);
        });
        copyBtn.addEventListener(
          "mouseenter",
          () => (copyBtn.style.color = "#00a1d6"),
        );
        copyBtn.addEventListener(
          "mouseleave",
          () => (copyBtn.style.color = "white"),
        );

        actionsContainer.appendChild(copyBtn);
        item.appendChild(actionsContainer);
      });
    }

    // 防抖:B 站 SPA 下 DOM 变动极频繁,合并高频触发,避免每次变动都扫全量 DOM
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      let hasAddedNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasAddedNodes = true;
          break;
        }
      }
      if (!hasAddedNodes) return;

      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        injectCopyButtons();
      }, 100);
    });

    // 字幕语言项仅存在于播放器控制栏内。将 observer 限定在播放器容器上,
    // 避免监听整个 document.body(弹幕/进度条等高频变动会让 body 层 observer 长期空转)。
    // 播放器在 SPA 下可能延迟渲染,未出现时先轻量轮询等待。
    let bootstrapTimer = null;
    let observedPlayer = null; // 当前已监听的播放器节点(SPA 切视频时可能被替换)
    function attachObserver() {
      const player = document.querySelector(SELECTORS.playerContainer);
      if (!player) return false;
      if (player === observedPlayer) return true; // 同一节点无需重复绑定
      observer.disconnect(); // 节点被替换:先解除旧的再监听新的
      observedPlayer = player;
      injectCopyButtons(); // 首次附着后先补一次
      observer.observe(player, { childList: true, subtree: true });
      return true;
    }
    // 暴露给 SPA 路由处理:切视频可能替换播放器节点,需重新绑定
    reattachSubtitleObserver = function () {
      if (!attachObserver() && !bootstrapTimer) startBootstrap();
    };
    function startBootstrap() {
      let tries = 60; // 最多等 ~30s,仍未出现则放弃(本页无播放器)
      bootstrapTimer = setInterval(() => {
        if (attachObserver() || --tries <= 0) {
          clearInterval(bootstrapTimer);
          bootstrapTimer = null;
        }
      }, 500);
    }
    if (!attachObserver()) startBootstrap();
  }

  function setupSPARouting() {
    const s = document.createElement("script");
    s.textContent = `(function() {
            const originalPushState = history.pushState;
            history.pushState = function() {
                originalPushState.apply(this, arguments);
                window.dispatchEvent(new Event('bili_ai_url_change'));
            };
            const originalReplaceState = history.replaceState;
            history.replaceState = function() {
                originalReplaceState.apply(this, arguments);
                window.dispatchEvent(new Event('bili_ai_url_change'));
            };
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('bili_ai_url_change')));
        })();`;
    (document.head || document.documentElement).appendChild(s);
    s.remove();

    let lastUrl = location.href;
    window.addEventListener("bili_ai_url_change", () => {
      // 同步阶段(无 DOM 依赖、无竞态):URL 已更新,立即清空陈旧字幕来源,
      // 避免播放器在 pushState 后的 50ms 内已发出新视频字幕请求却被随后的
      // 50ms 延时清空逻辑抹掉。bili_ai_url_change 在 pushState 后同步派发。
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      const isVideoPage =
        location.href.includes("/video/") ||
        location.href.includes("/bangumi/play/");
      if (!isVideoPage) return;

      // 置失效并清空所有陈旧候选(SSR 全局变量 + 首屏内联 script + 网络拦截数组)。
      // 网络拦截数组清空后,新视频的字幕请求会重新填入。
      staleSSRSources = true;
      cachedScriptSubtitleUrls = null;
      if (
        typeof unsafeWindow !== "undefined" &&
        unsafeWindow._biliSubtitleUrls
      )
        unsafeWindow._biliSubtitleUrls = [];
      window._biliSubtitleUrls = [];

      // UI / DOM 重置保留在 50ms 延时里,避免 B 站 SPA 框架尚未替换播放器 DOM。
      setTimeout(() => {
        // 播放器节点可能被换成新视频的,重新绑定字幕按钮 observer
        if (typeof reattachSubtitleObserver === "function") {
          reattachSubtitleObserver();
        }

        // Reset state
        abortCurrentRequest(); // 中断可能正在进行的 AI 请求,避免向旧面板写入及状态卡死
        currentSubtitle = "";
        chatHistory = [];

        // Reset UI
        const chatContainer = document.getElementById("ai-panel-chat");
        if (chatContainer) {
          chatContainer.innerHTML =
            '<div class="chat-bubble system">准备就绪。</div>';
          chatContainer.scrollTop = 0;
        }
        resetSessionTokens(); // 新视频是新会话,累计清零(须先清零)
        updateTokenBar(null); // 再重新渲染,此时累计为 0 会正确隐藏
        updateChatSendButtonState();

        // 切换视频时若面板未收起,自动收起回侧栏
        const aiPanel = document.getElementById("bili-ai-panel");
        const minTab = document.getElementById("bili-ai-minimized");
        if (aiPanel && minTab && !isElHidden(aiPanel)) {
          aiPanel.style.display = "none";
          minTab.style.display = "flex";
        }
      }, 50);
    });
  }

  function init() {
    addGlobalStyles();

    createAIPanel();
    createGlobalObserver();
    console.log(
      `%c 🎬 B站字幕获取与AI总结助手 v${version} %c Cost ${Math.round(performance.now() - startTime)}ms`,
      "background:#4A90E2;color:white;padding:2px 6px;border-radius:3px 0 0 3px;",
      "background:#50E3C2;color:#003333;padding:2px 6px;border-radius:0 3px 3px 0;",
    );
  }

  // document-start 时机:网络钩子与 SPA 路由监听必须在 B 站播放器发起任何字幕请求
  // 之前就位(否则 B 站首屏播放器的初始字幕请求不会被拦截,_biliSubtitleUrls 为空,
  // 表现为「直开有字幕视频也不点菜单,点总结—有时失败」)。这两个函数只注入 <script>
  // 并基于 history API,不依赖 <head>/<body> 已就绪(appended to document.documentElement),
  // 因此提到 IIFE 顶层同步执行。其余依赖 DOM 的 UI 初始化留在 DOMContentLoaded(init)。
  setupNetworkInterception();
  setupSPARouting();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
