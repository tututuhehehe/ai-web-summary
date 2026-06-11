// ==UserScript==
// @name         B站字幕获取与AI助手 (沉浸式翻译/总结)
// @namespace    https://github.com/tututuhehehe/ai-web-summary
// @version      1.1.3
// @author       limoon
// @description  一键获取B站视频字幕，支持沉浸式AI对话、双模型切换、侧边栏收起、自定义总结Prompt，支持阿里云与DeepSeek官方接口切换
// @match        *://*.bilibili.com/video/*
// @match        *://*.bilibili.com/bangumi/play/*
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const startTime = performance.now();
  const version = GM_info.script.version;

  // 集中管理外部端点常量，避免在多处硬编码
  const ENDPOINTS = {
    aliyun:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
  };

  // 集中管理 B 站播放器 DOM 选择器，B 站改版时只需在此处维护
  const SELECTORS = {
    subtitleLangItem: ".bpx-player-ctrl-subtitle-language-item",
    subtitleToggle: ".bpx-player-ctrl-subtitle",
  };

  // 配置数据字典
  const CONFIG_DICT = {
    provider: { key: "ai_provider", def: "aliyun", el: "set-provider" },
    endpoint: {
      key: "ai_endpoint",
      def: ENDPOINTS.aliyun,
      el: "set-endpoint",
    },
    apiKey: { key: "ai_api_key", def: "", el: "set-apikey" },
    model1: { key: "ai_model1", def: "deepseek-v4-flash", el: "set-model1" },
    model2: { key: "ai_model2", def: "deepseek-v4-pro", el: "set-model2" },
    thinking: {
      key: "ai_thinking",
      def: false,
      el: "set-thinking",
      isCheckbox: true,
    },
    prompt: {
      key: "ai_custom_prompt",
      def: "请根据以下视频字幕，提取出核心观点，并用结构化的 Markdown 格式（如标题、列表、加粗重点，必要时可以使用表格）进行详细总结。",
      el: "set-prompt",
    },
  };

  let aiConfig = {};
  for (let k in CONFIG_DICT)
    aiConfig[k] = GM_getValue(CONFIG_DICT[k].key, CONFIG_DICT[k].def);

  // 状态数据
  let currentSubtitle = "";
  let chatHistory = [];
  let isRequesting = false;
  let currentRequest = null; // 正在进行的 GM_xmlhttpRequest 句柄，用于可中断
  let requestSeq = 0; // 请求序号，用于丢弃被中断的旧请求回调
  let activeAssistantBubble = null; // 当前正在流式写入的 assistant 气泡，用于终止时标注

  // 用户主动终止当前生成：中断请求并在已生成内容后追加「已终止」标记
  function stopCurrentGeneration() {
    const bubble = activeAssistantBubble;
    abortCurrentRequest();
    if (bubble) {
      // 若气泡还是初始「响应中」占位文本，直接提示已终止；否则在现有内容后追加
      const onlyPlaceholder = /^\s*<span[^>]*>AI[^<]*<\/span>\s*$/.test(
        bubble.innerHTML,
      );
      if (onlyPlaceholder) {
        bubble.innerHTML =
          '<span style="color:#888;">⛔ 已终止生成</span>';
      } else {
        bubble.innerHTML +=
          '<div style="color:#888;font-size:12px;margin-top:6px;">⛔ 已终止生成</div>';
      }
    }
    activeAssistantBubble = null;
    updateChatSendButtonState();
  }

  // 中断当前正在进行的 AI 请求（如 SPA 切换视频时）
  function abortCurrentRequest() {
    if (currentRequest && typeof currentRequest.abort === "function") {
      try {
        currentRequest.abort();
      } catch (e) {}
    }
    currentRequest = null;
    requestSeq++; // 序号递增，使旧请求的后续回调失效
    isRequesting = false;
    activeAssistantBubble = null;
  }

  function addGlobalStyles() {
    if (document.getElementById("bili-ai-style")) return;
    const style = document.createElement("style");
    style.id = "bili-ai-style";
    style.textContent = `
            .bilibili-subtitle-infobar {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: rgba(25, 26, 27, 0.98); border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px; padding: 12px 20px; color: white; font-size: 14px; font-weight: bold;
                z-index: 2147483647; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8); backdrop-filter: blur(10px);
                text-align: center; transition: all 0.3s ease;
            }
            .bilibili-subtitle-infobar.info { border-left: 4px solid #00a1d6; }
            .bilibili-subtitle-infobar.success { border-left: 4px solid #52c41a; }
            .bilibili-subtitle-infobar.error { border-left: 4px solid #f5222d; }

            /* 常驻侧边栏样式 */
            #bili-ai-minimized {
                position: fixed; right: 0; top: 50%; transform: translateY(-50%); width: 40px; height: 110px;
                background-color: #1e1e20; border: 1px solid #333; border-right: none; border-radius: 12px 0 0 12px;
                box-shadow: -5px 5px 15px rgba(0,0,0,0.5); z-index: 2147483646; display: flex;
                flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
            }
            #bili-ai-minimized:hover { background-color: #2a2a2b; width: 45px; }
            #bili-ai-minimized span { color: #00a1d6; font-size: 14px; font-weight: bold; writing-mode: vertical-lr; letter-spacing: 4px; text-align: center;}

            #bili-ai-panel {
                position: fixed; right: 20px; top: 80px; width: 420px; height: 680px;
                background-color: #1e1e20; border: 1px solid #333; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.6); z-index: 2147483646; display: none;
                flex-direction: column; color: #eee; font-family: sans-serif;
            }
            .ai-panel-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 16px; border-bottom: 1px solid #333; background: #252528; border-radius: 12px 12px 0 0;
            }
            .ai-panel-header-left { display: flex; align-items: center; gap: 8px; }
            .ai-panel-title { font-size: 15px; font-weight: bold; color: #00a1d6; }
            .ai-model-select { background: #1e1e20; color: #ccc; border: 1px solid #444; border-radius: 4px; padding: 2px 6px; font-size: 12px; outline: none; cursor: pointer;}
            .ai-refresh-btn { cursor: pointer; color: #00a1d6; font-size: 14px; transition: transform 0.3s; }
            .ai-refresh-btn:hover { transform: rotate(180deg); }

            .ai-panel-header-actions { display: flex; align-items: center; gap: 12px; }
            .ai-icon-btn { cursor: pointer; color: #999; font-size: 16px; transition: color 0.2s; }
            .ai-icon-btn:hover { color: #fff; }

            .ai-panel-chat { flex: 1; padding: 16px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 16px; }
            .chat-bubble { padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.6; word-wrap: break-word; overflow-wrap: anywhere; box-sizing: border-box; }
            .chat-bubble.user { max-width: 82%; background: #00a1d6; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
            .chat-bubble.assistant { width: 100%; max-width: 100%; background: #2a2a2b; color: #d1d5db; align-self: stretch; border-bottom-left-radius: 2px; border: 1px solid #333; overflow: visible;}
            .chat-bubble.system { background: transparent; color: #888; align-self: center; font-size: 12px; text-align: center; }

            /* Markdown 样式适配 */
            .chat-bubble.assistant h1, .chat-bubble.assistant h2, .chat-bubble.assistant h3, .chat-bubble.assistant h4, .chat-bubble.assistant h5, .chat-bubble.assistant h6 { color: #fff; margin-top: 0; margin-bottom: 8px; font-size: 15px; }
            .chat-bubble.assistant p { margin: 0 0 8px 0; }
            .chat-bubble.assistant p:last-child { margin: 0; }
            .chat-bubble.assistant ul, .chat-bubble.assistant ol { margin: 0 0 8px 0; padding-left: 20px; }
            .chat-bubble.assistant strong { color: #50E3C2; }
            .chat-bubble.assistant code { background: #1e1e20; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; }
            .chat-bubble.assistant pre { background: #1a1a1b; padding: 10px; border-radius: 6px; overflow-x: auto; overflow-y: hidden; border: 1px solid #111; margin: 8px 0; max-width: 100%; box-sizing: border-box;}
            .chat-bubble.assistant table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; color: #eee; table-layout: fixed; }
            .chat-bubble.assistant th, .chat-bubble.assistant td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
            .chat-bubble.assistant th { background-color: #1a1a1b; color: #00a1d6; font-weight: bold; }
            .chat-bubble.assistant tr:nth-child(even) { background-color: rgba(255, 255, 255, 0.03); }

            .ai-panel-input-area { padding: 12px; border-top: 1px solid #333; background: #252528; display: flex; gap: 8px; border-radius: 0 0 12px 12px;}
            .ai-chat-textarea { flex: 1; height: 36px; min-height: 36px; max-height: 100px; background: #1e1e20; border: 1px solid #444; color: white; border-radius: 6px; padding: 8px; font-size: 13px; resize: none; outline: none; font-family: inherit;}
            .ai-chat-send { background: #00a1d6; color: white; border: none; padding: 0 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s;}
            .ai-chat-send:hover { background: #0088b5; }
            .ai-chat-send:disabled { background: #444; color: #888; cursor: not-allowed; }
            .ai-chat-send.ai-chat-stop { background: #d9363e; font-size: 18px; padding: 0 14px; }
            .ai-chat-send.ai-chat-stop:hover { background: #f5222d; }

            .ai-panel-settings {
                position: absolute; top: 53px; left: 12px; right: 12px;
                max-height: calc(100% - 130px); overflow-y: auto; overscroll-behavior: contain;
                padding: 16px; font-size: 12px;
                background: #2d2d31; border: 1px solid #4a4a50; border-radius: 10px;
                box-shadow: 0 12px 32px rgba(0,0,0,0.55);
                display: none; z-index: 10;
            }
            .ai-panel-settings::before {
                content: "⚙️ 设置"; display: block; font-size: 13px; font-weight: bold;
                color: #00a1d6; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #3a3a40;
            }
            .ai-input { width: 100%; box-sizing: border-box; margin-top: 4px; margin-bottom: 8px; padding: 6px; background: #1e1e20; border: 1px solid #444; color: white; border-radius: 4px; font-family: inherit;}
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
    script.textContent = `(function(){window._biliSubtitleUrls=window._biliSubtitleUrls||[];const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&(u.includes('subtitle')||u.includes('ai_subtitle')))window._biliSubtitleUrls.push(u);return o.apply(this,arguments);};const f=window.fetch;window.fetch=function(u,op){let r=typeof u==='string'?u:(u&&u.url?u.url:'');if(r&&(r.includes('subtitle')||r.includes('ai_subtitle')))window._biliSubtitleUrls.push(r);return f.apply(this,arguments);};})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  let cachedScriptSubtitleUrls = null;
  function getSubtitleUrls() {
    const urls = [];
    if (!cachedScriptSubtitleUrls) {
      cachedScriptSubtitleUrls = [];
      document.querySelectorAll("script").forEach((scriptEl) => {
        const code = scriptEl.textContent;
        if (!code) return;
        const jsonUrls = code.match(
          /https?:\/\/[^\s"]*subtitle\/[^\s"]*\.json\?auth_key=[^\s"]*/g,
        );
        if (jsonUrls) cachedScriptSubtitleUrls.push(...jsonUrls);
        const aiUrls = code.match(
          /https?:\/\/[^\s"]*ai_subtitle\/[^\s"]*\?auth_key=[^\s"]*/g,
        );
        if (aiUrls) cachedScriptSubtitleUrls.push(...aiUrls);
      });
    }
    urls.push(...cachedScriptSubtitleUrls);

    if (typeof unsafeWindow !== "undefined" && unsafeWindow._biliSubtitleUrls) {
      urls.push(...unsafeWindow._biliSubtitleUrls);
    } else if (window._biliSubtitleUrls) {
      urls.push(...window._biliSubtitleUrls);
    }
    return [...new Set(urls)].filter(
      (url) =>
        url &&
        (url.includes("subtitle") || url.includes("ai_subtitle")) &&
        url.includes("auth_key"),
    );
  }
  function getSubtitleBody(data) {
    const body =
      data && data.body
        ? data.body
        : data && data.data && data.data.body
          ? data.data.body
          : null;
    if (Array.isArray(body)) return body;
    throw new Error("无法解析字幕数据（格式异常或为空）");
  }
  function fetchSubtitleText() {
    return new Promise((res, rej) => {
      const urls = getSubtitleUrls();
      if (urls.length === 0) return rej(new Error("未找到字幕"));
      // 仅在语言标识字段（lan= 或路径分段）中匹配中文，避免误命中 auth_key/域名中的 cn 等子串
      const zhUrl = urls.find((url) =>
        /[?&]lan=(zh|cn|hans)|[-_/](zh|hans|zh-hans|zh-cn)[-_./]/i.test(url),
      );
      let url = zhUrl || urls[urls.length - 1];
      if (url.startsWith("//")) url = "https:" + url;
      // 使用 GM_xmlhttpRequest 下载字幕，避免 *.bilibili.com 对 *.hdslb.com 的跨域限制
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "json",
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            rej(new Error(`HTTP ${response.status}`));
            return;
          }
          try {
            // 部分管理器不会根据 responseType 自动解析，需兼容 responseText
            let data = response.response;
            if (typeof data === "string") data = JSON.parse(data);
            else if (data == null && response.responseText)
              data = JSON.parse(response.responseText);
            res(
              getSubtitleBody(data)
                .map((i) => i.content)
                .join("\n"),
            );
          } catch (e) {
            rej(new Error("字幕解析失败: " + e.message));
          }
        },
        onerror: function () {
          rej(new Error("字幕下载失败（网络错误）"));
        },
        ontimeout: function () {
          rej(new Error("字幕下载超时"));
        },
      });
    });
  }
  function handleCopySubtitle() {
    showInfoBar("正在提取...", "info", 0);
    fetchSubtitleText()
      .then((t) => {
        document.querySelector(".bilibili-subtitle-infobar.info")?.remove();
        GM_setClipboard(t, "text");
        showInfoBar("✅ 已复制！", "success", 2500);
      })
      .catch((e) => {
        document.querySelector(".bilibili-subtitle-infobar.info")?.remove();
        showInfoBar("提取失败: " + e.message, "error");
      });
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function requestAIStream(
    messages,
    onChunk,
    onComplete,
    onError,
    assistantBubble,
  ) {
    if (!aiConfig.apiKey) {
      onError("请先点击右上角⚙️图标配置 API Key");
      return;
    }

    const selectedModel = document.getElementById("ai-model-select").value;
    isRequesting = true;
    const mySeq = ++requestSeq; // 本次请求的序号，后续回调需校验是否仍为最新
    // 判断本次请求是否已被新请求/路由切换作废，或目标 bubble 已脱离文档
    function isStale() {
      if (mySeq !== requestSeq) return true;
      if (assistantBubble && !assistantBubble.isConnected) return true;
      return false;
    }
    updateChatSendButtonState();

    const payload = {
      model: selectedModel,
      messages: messages,
      stream: true,
    };

    // 根据服务商组装思考模式参数
    if (aiConfig.provider === "aliyun") {
      payload.enable_thinking = aiConfig.thinking;
    } else if (aiConfig.provider === "deepseek") {
      payload.thinking = { type: aiConfig.thinking ? "enabled" : "disabled" };
    } else {
      // 自定义厂商，如果包含这两个特征域名，也尝试附加上下文
      if (aiConfig.endpoint.includes("dashscope"))
        payload.enable_thinking = aiConfig.thinking;
      if (aiConfig.endpoint.includes("deepseek.com"))
        payload.thinking = { type: aiConfig.thinking ? "enabled" : "disabled" };
    }

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
      onloadstart: async function (response) {
        try {
          const reader = response.response.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let reasoningContent = "";
          let mainContent = "";

          let lastRenderedReasoning = "";
          let committedMain = "";
          let pendingMain = "";
          let rafId = null;
          let receivedError = "";
          let thinkStartTime = 0; // 思考（reasoning）首次出现的时间炳
          let thinkSeconds = 0; // 已思考秒数（一秒一秒跳动）
          let thinkTimer = null; // 思考计时器，每秒刷新标题

          // 解析一批 SSE 文本行，提取 reasoning/content 增量
          function processLines(lines) {
            for (let line of lines) {
              line = line.trim();
              if (!line.startsWith("data:")) {
                // 非 SSE 行：可能是接口返回的 JSON 错误体，尝试提取错误信息
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
                const delta = data?.choices?.[0]?.delta;
                if (!delta) continue;
                if (delta.reasoning_content) {
                  reasoningContent += delta.reasoning_content;
                  // 首次收到思考内容：启动每秒计时，让标题秒数一秒一秒跳
                  if (!thinkStartTime) {
                    thinkStartTime = Date.now();
                    thinkTimer = setInterval(() => {
                      thinkSeconds = Math.floor(
                        (Date.now() - thinkStartTime) / 1000,
                      );
                      // 正文尚未出现时才需持续刷新思考秒数
                      if (!mainContent) {
                        lastRenderedReasoning = null; // 强制重渲染标题
                        doRender(false);
                      }
                    }, 1000);
                  }
                }
                if (delta.content) {
                  // 首次出现正文：停止思考计时，定格耗时秒数
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
            if (thinkTimer) {
              clearInterval(thinkTimer);
              thinkTimer = null;
            }
            if (thinkStartTime) {
              thinkSeconds = Math.floor((Date.now() - thinkStartTime) / 1000);
            }
            lastRenderedReasoning = null; // 强制下次重渲染标题（思考中→思考过程）
          }

          function scheduleRender() {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
              rafId = null;
              doRender(false);
            });
          }

          function doRender(isFinal) {
            let htmlParts = [];

            if (reasoningContent !== lastRenderedReasoning) {
              lastRenderedReasoning = reasoningContent;
              // 思考框始终默认折叠；思考进行中（正文还未出现）在标题行提示已思考秒数，让用户知道没卡住
              const thinking = !isFinal && !mainContent;
              const summaryText = thinking
                ? `💭 思考中… (${thinkSeconds}s)`
                : `💭 思考过程 (耗时 ${thinkSeconds}s)`;
              htmlParts.push(
                `<details style="margin-bottom:8px;">` +
                  `<summary style="color:#aaa;font-size:12px;cursor:pointer;user-select:none;">${summaryText}</summary>` +
                  `<div style="color:#888;font-size:12px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-top:4px;white-space:pre-wrap;">${escapeHtml(reasoningContent)}</div></details>`,
              );
            } else {
              const existing = assistantBubble?.querySelector("details");
              if (existing) htmlParts.push(existing.outerHTML);
            }

            if (pendingMain && (isFinal || /\n\n/.test(pendingMain))) {
              const splitAt = pendingMain.lastIndexOf("\n\n") + 2;
              if (splitAt > 0) {
                committedMain += pendingMain.slice(0, splitAt);
                pendingMain = pendingMain.slice(splitAt);
              } else if (isFinal) {
                committedMain += pendingMain;
                pendingMain = "";
              }
            }

            const parseSrc = committedMain + pendingMain;
            if (parseSrc) {
              if (pendingMain && !isFinal) {
                htmlParts.push(
                  marked.parse(parseSrc) +
                    '<span style="color:#00a1d6;opacity:0.6;">▍</span>',
                );
              } else {
                htmlParts.push(marked.parse(parseSrc));
              }
            } else if (reasoningContent) {
              htmlParts.push(
                '<span style="color:#888;">AI 深度思考中...</span>',
              );
            }

            const html = htmlParts.join("");
            if (isStale()) return; // 请求已作废或 bubble 已移除，不再写入
            if (assistantBubble) {
              assistantBubble.innerHTML = html;
            } else {
              onChunk(html);
            }
          }

          while (true) {
            if (isStale()) {
              stopThinkTimer();
              try {
                await reader.cancel();
              } catch (e) {}
              return;
            }
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            processLines(lines);
          }

          // 流结束，停止思考计时
          stopThinkTimer();

          // 冲刷解码器与最后一行（末尾可能没有换行符，否则丢失最后一个 token）
          buffer += decoder.decode();
          if (buffer.trim()) processLines([buffer]);

          if (isStale()) return; // 请求已作废，不再触发完成/错误回调

          // 如果整个流未产生任何内容，可能是接口返回了非 SSE 的错误体
          if (!mainContent && !reasoningContent) {
            isRequesting = false;
            currentRequest = null;
            onError(receivedError || "AI 未返回内容，请检查模型名称、API Key 或接口配置");
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
          onComplete(mainContent || reasoningContent);
          updateChatSendButtonState();
        } catch (err) {
          stopThinkTimer();
          if (isStale()) return; // 主动中断导致的异常，静默忽略
          isRequesting = false;
          currentRequest = null;
          onError("流读取中断");
          updateChatSendButtonState();
        }
      },
      onerror: function (err) {
        if (isStale()) return;
        isRequesting = false;
        currentRequest = null;
        onError("网络请求失败，请检查配置或网络");
        updateChatSendButtonState();
      },
    });
  }

  function updateChatSendButtonState() {
    const btn = document.getElementById("ai-chat-send");
    const textarea = document.getElementById("ai-chat-textarea");
    if (!btn || !textarea) return;

    // 请求进行中：按钮变为可点击的「终止」，点击中断回答
    if (isRequesting) {
      btn.textContent = "⏹";
      btn.title = "终止生成";
      btn.disabled = false;
      btn.classList.add("ai-chat-stop");
      return;
    }

    btn.classList.remove("ai-chat-stop");
    btn.title = "";
    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === "") {
      btn.textContent = "发送";
      btn.disabled = true;
      textarea.placeholder = "请先配置 API Key...";
    } else if (chatHistory.length === 0) {
      btn.textContent = "总结";
      btn.disabled = false;
      textarea.placeholder = "点击“总结”获取视频内容总结...";
    } else {
      btn.textContent = "发送";
      btn.disabled = false;
      textarea.placeholder = "向 AI 提问关于视频的内容...";
    }
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

  // 统一的流式对话调用封装：接管 onChunk/onComplete/onError 重复样板。
  // onDone(plainText) 由调用方决定完成后的额外处理（如总结场景更新提示文案）。
  function runChatStream(assistantBubble, onDone) {
    activeAssistantBubble = assistantBubble; // 记录活动气泡，供终止时标注
    requestAIStream(
      chatHistory,
      (htmlToDisplay) => {
        assistantBubble.innerHTML = htmlToDisplay;
      },
      (plainTextForHistory) => {
        activeAssistantBubble = null;
        chatHistory.push({ role: "assistant", content: plainTextForHistory });
        if (typeof onDone === "function") onDone(plainTextForHistory);
      },
      (errMsg) => {
        activeAssistantBubble = null;
        assistantBubble.innerHTML = `<span style="color:#f5222d;">❌ ${errMsg}</span>`;
      },
      assistantBubble,
    );
  }

  function triggerSummary(plainText) {
    abortCurrentRequest(); // 中断上一次可能正在进行的请求（如重复点击「重新总结」）
    const chatContainer = document.getElementById("ai-panel-chat");
    chatContainer.innerHTML = "";
    chatHistory = [];

    const systemPrompt =
      "你是一个得力的视频内容总结与问答助手。请直接输出 Markdown 格式的排版内容。";
    const userPrompt = `${aiConfig.prompt}\n\n字幕内容：\n${plainText}`;

    chatHistory.push({ role: "system", content: systemPrompt });
    chatHistory.push({ role: "user", content: userPrompt });

    appendChatBubble("system", "正在阅读视频字幕并生成总结...");
    const assistantBubble = appendChatBubble(
      "assistant",
      '<span style="color:#888;">AI 响应中...</span>',
    );

    runChatStream(assistantBubble, () => {
      document
        .getElementById("ai-panel-chat")
        .querySelector(".system").textContent = "总结完成，您可以继续提问👇";
    });
  }

  function handleSendChat() {
    if (isRequesting) {
      stopCurrentGeneration(); // 生成中点击终止按钮，中断当前回答
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
    inputEl.style.height = "36px";
    appendChatBubble("user", text);

    chatHistory.push({ role: "user", content: text });
    const assistantBubble = appendChatBubble(
      "assistant",
      '<span style="color:#888;">AI 响应中...</span>',
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

    if (chatHistory.length > 0) return; // 如果已经总结过，保留对话历史不重新刷新

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

    fetchSubtitleText()
      .then((plainText) => {
        currentSubtitle = plainText;
        triggerSummary(plainText);
      })
      .catch((err) => {
        chatContainer.innerHTML = `<div class="chat-bubble system" style="color:#f5222d;">❌ 提取字幕失败: ${err.message}</div>`;
      });
  }

  // 创建整个 AI UI（侧拉常驻按钮 + 对话面板）
  function createAIPanel() {
    if (document.getElementById("bili-ai-panel")) return;

    const minTab = document.createElement("div");
    minTab.id = "bili-ai-minimized";
    minTab.innerHTML = `<span>AI总结</span>`;
    document.body.appendChild(minTab);

    minTab.addEventListener("click", () => {
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
                        <option value="${aiConfig.model1}">${aiConfig.model1} (主)</option>
                        ${aiConfig.model2 ? `<option value="${aiConfig.model2}">${aiConfig.model2} (备)</option>` : ""}
                    </select>
                    <span class="ai-refresh-btn" id="ai-refresh-btn" title="重新总结">🔄</span>
                </div>
                <div class="ai-panel-header-actions">
                    <span class="ai-icon-btn" id="ai-setting-toggle" title="设置">⚙️</span>
                    <span class="ai-icon-btn" id="ai-minimize-btn" title="收起到侧边">➖</span>
                </div>
            </div>

            <div class="ai-panel-chat" id="ai-panel-chat">
                <div class="chat-bubble system">准备就绪。</div>
            </div>

            <div class="ai-panel-settings" id="ai-panel-settings-container">
                <div style="margin-bottom: 4px; color: #999;">服务商与API配置:</div>
                <div class="ai-settings-row">
                    <select id="set-provider" class="ai-input" style="width: 38%; padding: 4px;">
                        <option value="aliyun" ${aiConfig.provider === "aliyun" ? "selected" : ""}>阿里云百炼</option>
                        <option value="deepseek" ${aiConfig.provider === "deepseek" ? "selected" : ""}>DeepSeek官方</option>
                        <option value="custom" ${aiConfig.provider === "custom" ? "selected" : ""}>自定义</option>
                    </select>
                    <input type="password" id="set-apikey" class="ai-input" style="width: 62%;" value="${aiConfig.apiKey}" placeholder="API Key (sk-...)">
                </div>
                <input type="text" id="set-endpoint" class="ai-input" value="${aiConfig.endpoint}" placeholder="自定义 API Endpoint" style="display: ${aiConfig.provider === "custom" ? "block" : "none"};">

                <div class="ai-settings-row">
                    <input type="text" id="set-model1" class="ai-input" value="${aiConfig.model1}" placeholder="主模型">
                    <input type="text" id="set-model2" class="ai-input" value="${aiConfig.model2}" placeholder="备用模型">
                </div>
                <div style="margin: 4px 0 8px 0;">
                    <label style="color:#eee; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" id="set-thinking" ${aiConfig.thinking ? "checked" : ""}>
                        开启思考模式 (Reasoning)
                    </label>
                </div>
                <div style="margin: 0 0 4px 0; color: #999;">自定义总结 Prompt:</div>
                <textarea id="set-prompt" class="ai-input" style="height: 110px; resize: vertical; margin-bottom: 0;" placeholder="要求 AI 如何进行总结...">${aiConfig.prompt}</textarea>
                <div style="margin-top: 6px; color: #777; font-size: 11px; text-align: center;">再次点击 ⚙️ 即可保存并关闭设置</div>
            </div>

            <div class="ai-panel-input-area">
                <textarea id="ai-chat-textarea" class="ai-chat-textarea" placeholder="向 AI 提问关于视频的内容..."></textarea>
                <button id="ai-chat-send" class="ai-chat-send">发送</button>
            </div>
        `;
    document.body.appendChild(panel);

    // 设置栏：服务商切换事件绑定
    document
      .getElementById("set-provider")
      .addEventListener("change", function () {
        const epInput = document.getElementById("set-endpoint");
        if (this.value === "aliyun") {
          epInput.style.display = "none";
          epInput.value = ENDPOINTS.aliyun;
        } else if (this.value === "deepseek") {
          epInput.style.display = "none";
          epInput.value = ENDPOINTS.deepseek;
        } else {
          epInput.style.display = "block";
        }
      });

    // 防止面板内滚动穿透到底层视频页面：在整个面板上统一拦截滚轮。
    // 找到事件路径上最近的可滚动容器；若存在且未到边界则放行，
    // 到边界、不可滚动或点在空白区域时一律 preventDefault，防止触发整页滚动。
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
          e.preventDefault(); // 无可滚动区域（header/输入区/空白），直接吃掉
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
    document.getElementById("ai-minimize-btn").addEventListener("click", () => {
      panel.style.display = "none";
      minTab.style.display = "flex";
    });

    document.getElementById("ai-refresh-btn").addEventListener("click", () => {
      if (!currentSubtitle) return;
      triggerSummary(currentSubtitle);
    });

    // 保存设置：读取面板表单写回 aiConfig 并持久化。仅在确实有改动时写入，返回是否发生了变更
    function saveSettings() {
      let changed = false;
      for (let k in CONFIG_DICT) {
        const config = CONFIG_DICT[k];
        const el = document.getElementById(config.el);
        const newVal = config.isCheckbox ? el.checked : el.value;
        if (newVal !== aiConfig[k]) {
          aiConfig[k] = newVal;
          GM_setValue(config.key, newVal);
          changed = true;
        }
      }

      if (changed) {
        const select = document.getElementById("ai-model-select");
        select.innerHTML = `<option value="${aiConfig.model1}">${aiConfig.model1} (主)</option>`;
        if (aiConfig.model2) {
          select.innerHTML += `<option value="${aiConfig.model2}">${aiConfig.model2} (备)</option>`;
        }
        updateChatSendButtonState();
      }
      return changed;
    }

    document
      .getElementById("ai-setting-toggle")
      .addEventListener("click", () => {
        const box = document.getElementById("ai-panel-settings-container");
        // 初始隐藏由 CSS 类控制，内联 style.display 为空，需用 computed 判断真实状态
        const isOpen = getComputedStyle(box).display !== "none";
        if (isOpen) {
          // 关闭设置面板时自动保存，仅在有改动时提示
          const changed = saveSettings();
          box.style.display = "none";
          if (changed) showInfoBar("✅ 设置已保存", "success", 1200);
        } else {
          box.style.display = "block";
        }
      });

    document
      .getElementById("ai-chat-send")
      .addEventListener("click", handleSendChat);
    document
      .getElementById("ai-chat-textarea")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendChat();
        }
      });

    const textarea = document.getElementById("ai-chat-textarea");
    textarea.addEventListener("input", function () {
      this.style.height = "36px";
      this.style.height = this.scrollHeight + "px";
    });

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

  // 【全局自动检测】针对外部常驻悬浮窗，如果找不到URL，尝试唤起字幕菜单获取
  async function ensureSubtitleAndExecuteGlobal(actionCallback) {
    if (getSubtitleUrls().length > 0) {
      actionCallback();
      return;
    }

    showInfoBar("自动加载字幕资源中...", "info", 1000);

    let langItem = document.querySelector(SELECTORS.subtitleLangItem);

    if (!langItem) {
      const subToggle = document.querySelector(SELECTORS.subtitleToggle);
      if (subToggle) {
        subToggle.dispatchEvent(new MouseEvent("mouseenter"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        langItem = document.querySelector(SELECTORS.subtitleLangItem);
      }
    }

    if (langItem) {
      langItem.click();
    } else {
      showInfoBar("未检测到字幕资源，请确认本视频是否带有字幕", "error");
      return;
    }

    try {
      await waitForSubtitleUrls();
      actionCallback();
    } catch (err) {
      showInfoBar("自动获取字幕超时，请手动点击一下视频字幕设置。", "error");
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
        showInfoBar("自动获取字幕超时，请手动点击一下字幕语言。", "error");
        return;
      }
    }
    actionCallback();
  }

  function createGlobalObserver() {
    // 向字幕语言项注入“[复制]”按钮
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

    // 防抖：B 站 SPA 下 DOM 变动极频繁，合并高频触发，避免每次变动都扫全量 DOM
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
    observer.observe(document.body, { childList: true, subtree: true });
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
      setTimeout(() => {
        // slight delay to let URL update
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          if (
            location.href.includes("/video/") ||
            location.href.includes("/bangumi/play/")
          ) {
            // Reset cache
            if (
              typeof unsafeWindow !== "undefined" &&
              unsafeWindow._biliSubtitleUrls
            )
              unsafeWindow._biliSubtitleUrls = [];
            window._biliSubtitleUrls = [];
            cachedScriptSubtitleUrls = null;

            // Reset state
            abortCurrentRequest(); // 中断可能正在进行的 AI 请求，避免向旧面板写入及状态卡死
            currentSubtitle = "";
            chatHistory = [];

            // Reset UI
            const chatContainer = document.getElementById("ai-panel-chat");
            if (chatContainer) {
              chatContainer.innerHTML =
                '<div class="chat-bubble system">准备就绪。</div>';
              chatContainer.scrollTop = 0;
            }
            updateChatSendButtonState();
          }
        }
      }, 50);
    });
  }

  function init() {
    addGlobalStyles();
    setupNetworkInterception();
    setupSPARouting();

    createAIPanel();
    createGlobalObserver();
    console.log(
      `%c 🎬 B站字幕与AI助手 v${version} %c Cost ${Math.round(performance.now() - startTime)}ms`,
      "background:#4A90E2;color:white;padding:2px 6px;border-radius:3px 0 0 3px;",
      "background:#50E3C2;color:#003333;padding:2px 6px;border-radius:0 3px 3px 0;",
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
