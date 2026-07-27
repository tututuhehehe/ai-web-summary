// ==UserScript==
// @name         微信公众号文章 AI 助手 (沉浸式总结/对话)
// @namespace    https://github.com/tututuhehehe/ai-web-summary
// @version      1.2.0
// @author       limoon 
// @description  一键获取微信公众号文章内容，支持沉浸式AI对话、多服务商与多模型切换、侧边栏拖拽收起、自定义总结Prompt、深度思考计时与生成终止
// @match        *://mp.weixin.qq.com/s/*
// @icon         https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const startTime = performance.now();
    const version = typeof GM_info !== "undefined" && GM_info.script ? GM_info.script.version : "dev";

    const ENDPOINTS = {
        aliyun: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        deepseek: "https://api.deepseek.com/chat/completions",
        custom: ""
    };

    const PROVIDER_DEFAULTS = {
        aliyun: { model1: "deepseek-v3", model2: "deepseek-r1" },
        deepseek: { model1: "deepseek-chat", model2: "deepseek-reasoner" },
        custom: { model1: "gpt-4o-mini", model2: "gpt-4o" }
    };

    const PROMPT_TEMPLATES = {
        summary: "请根据以下微信公众号文章内容，提取出核心观点，并用结构化的 Markdown 格式（如标题、列表、加粗重点，必要时可以使用表格）进行详细总结。",
        keypoints: "请列出以下微信公众号文章的 5-8 个最核心要点与精辟金句，并用简短语言进行提炼说明。",
        qa: "请先对以下微信公众号文章进行一句话总括，然后提炼出读者最关心的 3-5 个核心问题并给出解答。"
    };

    // 配置数据字典定义
    const CONFIG_DICT = {
        provider: { key: "wx_ai_provider", def: "aliyun", el: "set-provider" },
        endpoint: { key: "wx_ai_endpoint", def: ENDPOINTS.aliyun, el: "set-endpoint", perProvider: true },
        apiKey: { key: "wx_ai_api_key", def: "", el: "set-apikey", perProvider: true },
        model1: { key: "wx_ai_model1", def: "deepseek-v3", el: "set-model1", perProvider: true },
        model2: { key: "wx_ai_model2", def: "deepseek-r1", el: "set-model2", perProvider: true },
        thinking: { key: "wx_ai_thinking", def: false, el: "set-thinking", isCheckbox: true, perProvider: true },
        extraBody: { key: "wx_ai_extra_body", def: "", el: "set-extrabody", perProvider: true },
        promptTemplate: { key: "wx_ai_prompt_template", def: "summary", el: "set-prompt-template" },
        prompt: { key: "wx_ai_custom_prompt", def: PROMPT_TEMPLATES.summary, el: "set-prompt" }
    };

    function providerKey(baseKey, provider) {
        return `${baseKey}_${provider}`;
    }

    function loadEndpoint(provider) {
        const stored = GM_getValue(providerKey("wx_ai_endpoint", provider), "");
        if (stored) return stored;
        return ENDPOINTS[provider] || "";
    }

    function loadProviderValue(baseKey, provider, fallbackDef) {
        const pKey = providerKey(baseKey, provider);
        const stored = GM_getValue(pKey, null);
        if (stored !== null) return stored;
        const defaults = PROVIDER_DEFAULTS[provider] || {};
        const fieldName = baseKey.replace(/^wx_ai_/, "");
        if (fieldName in defaults) return defaults[fieldName];
        return fallbackDef;
    }

    function loadProviderConfig(provider) {
        const cfg = {};
        for (const k in CONFIG_DICT) {
            const item = CONFIG_DICT[k];
            if (!item.perProvider) continue;
            if (k === "endpoint") {
                cfg[k] = loadEndpoint(provider);
            } else {
                cfg[k] = loadProviderValue(item.key, provider, item.def);
            }
        }
        return cfg;
    }

    // 初始化加载全局 + 当前服务商配置
    let aiConfig = {};
    for (let k in CONFIG_DICT) {
        if (CONFIG_DICT[k].perProvider) continue;
        aiConfig[k] = GM_getValue(CONFIG_DICT[k].key, CONFIG_DICT[k].def);
    }
    Object.assign(aiConfig, loadProviderConfig(aiConfig.provider));

    // 旧配置迁移
    (function migrateLegacyConfig() {
        const prov = aiConfig.provider;
        const legacyKey = GM_getValue("wx_ai_api_key", "");
        if (legacyKey) {
            if (!GM_getValue(providerKey("wx_ai_api_key", prov), "")) {
                GM_setValue(providerKey("wx_ai_api_key", prov), legacyKey);
            }
        }
        const legacyEp = GM_getValue("wx_ai_endpoint", "");
        if (legacyEp) {
            if (!GM_getValue(providerKey("wx_ai_endpoint", prov), "")) {
                GM_setValue(providerKey("wx_ai_endpoint", prov), legacyEp);
            }
        }
        for (const mk of ["wx_ai_model1", "wx_ai_model2"]) {
            const legacyModel = GM_getValue(mk, "");
            if (legacyModel) {
                if (!GM_getValue(providerKey(mk, prov), "")) {
                    GM_setValue(providerKey(mk, prov), legacyModel);
                }
            }
        }
    })();

    // 状态数据
    let currentArticleText = "";
    let currentArticleTitle = "";
    let chatHistory = [];
    let sessionTokens = { input: 0, output: 0 };
    let isRequesting = false;
    let currentRequest = null;
    let requestSeq = 0;
    let activeAssistantBubble = null;

    function stopCurrentGeneration() {
        const bubble = activeAssistantBubble;
        abortCurrentRequest();
        if (bubble) {
            const html = bubble.innerHTML;
            const onlyPlaceholder = /^\s*<span[^>]*>AI[^<]*<\/span>\s*$/.test(html) || /^\s*<details[^>]*class="wx-ai-thinking"/.test(html);
            if (onlyPlaceholder) {
                bubble.innerHTML = '<span style="color:var(--text-faint);">[已终止]</span>';
            } else if (!html.includes("[已终止]")) {
                bubble.innerHTML = html + '<div style="color:var(--text-faint);font-size:12px;margin-top:6px;font-style:italic;">[已终止]</div>';
            }
        }
        activeAssistantBubble = null;
        updateChatSendButtonState();
        showInfoBar("已终止 AI 生成", "info");
    }

    function abortCurrentRequest() {
        if (currentRequest) {
            try { currentRequest.abort(); } catch (e) {}
            currentRequest = null;
        }
        isRequesting = false;
    }

    function addGlobalStyles() {
        if (document.getElementById("wx-ai-style")) return;
        const savedTop = GM_getValue("wx_minTabTop", null);
        const minTabPos = typeof savedTop === "number"
            ? `top: ${savedTop}px; transform: none;`
            : `top: 50%; transform: translateY(-50%);`;

        const style = document.createElement('style');
        style.id = "wx-ai-style";
        style.textContent = `
            #wx-ai-panel, #wx-ai-minimized, .wx-ai-infobar {
                --accent: #07c160;
                --accent-hover: #06ad56;
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
                #wx-ai-panel, #wx-ai-minimized, .wx-ai-infobar {
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

            .wx-ai-infobar {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: var(--infobar-bg); border: 1px solid var(--infobar-border);
                border-radius: 8px; padding: 12px 20px; color: var(--text); font-size: 14px; font-weight: bold;
                z-index: 2147483647; box-shadow: 0 10px 40px var(--shadow); backdrop-filter: blur(10px);
                text-align: center; transition: all 0.3s ease;
            }
            .wx-ai-infobar.info { border-left: 4px solid var(--accent); }
            .wx-ai-infobar.success { border-left: 4px solid #52c41a; }
            .wx-ai-infobar.error { border-left: 4px solid #f5222d; }

            /* 常驻侧边栏样式 */
            #wx-ai-minimized {
                position: fixed; right: 0; ${minTabPos} width: 40px; height: 110px;
                background-color: var(--bg); border: 1px solid var(--border); border-right: none; border-radius: 12px 0 0 12px;
                box-shadow: -5px 5px 15px var(--shadow); z-index: 2147483646; display: flex;
                flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
                user-select: none; box-sizing: border-box;
            }
            #wx-ai-minimized:hover { background-color: var(--bg-bubble); width: 45px; }
            #wx-ai-minimized.dragging { transition: none; width: 40px; cursor: grabbing; }
            #wx-ai-minimized span { color: var(--accent); font-size: 14px; font-weight: bold; writing-mode: vertical-lr; letter-spacing: 4px; text-align: center; line-height: 1.2;}

            #wx-ai-panel {
                position: fixed; right: 20px; top: 80px; width: 420px; height: 680px;
                max-width: calc(100vw - 40px); max-height: calc(100vh - 100px);
                background-color: var(--bg); border: 1px solid var(--border); border-radius: 12px;
                box-shadow: var(--panel-shadow); z-index: 2147483646; display: none;
                flex-direction: column; color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                box-sizing: border-box; overflow: hidden; isolation: isolate; line-height: normal; text-align: left;
            }
            #wx-ai-panel, #wx-ai-panel * { box-sizing: border-box; }
            #wx-ai-panel .ai-panel-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg-elev); border-radius: 12px 12px 0 0;
                flex: 0 0 auto; min-height: 45px; gap: 10px;
            }
            #wx-ai-panel .ai-panel-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
            #wx-ai-panel .ai-panel-title { font-size: 15px; font-weight: bold; color: var(--accent); white-space: nowrap; line-height: 1.2; }
            #wx-ai-panel .ai-model-select { max-width: 180px; background: var(--bg); color: var(--text-2); border: 1px solid var(--border-2); border-radius: 4px; padding: 2px 6px; font-size: 12px; line-height: 1.4; outline: none; cursor: pointer;}
            #wx-ai-panel .ai-refresh-btn { cursor: pointer; color: var(--accent); font-size: 14px; line-height: 1; transition: transform 0.3s; flex: 0 0 auto; }
            #wx-ai-panel .ai-refresh-btn:hover { transform: rotate(180deg); }

            #wx-ai-panel .ai-panel-header-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
            #wx-ai-panel .ai-icon-btn { cursor: pointer; color: var(--text-mute); font-size: 15px; line-height: 1; transition: color 0.2s; }
            #wx-ai-panel .ai-icon-btn:hover { color: var(--text-strong); }

            #wx-ai-panel .ai-token-bar {
                display: flex; justify-content: center; gap: 16px;
                padding: 5px 12px; font-size: 11px; color: var(--text-mute);
                background: var(--bg-elev); border-bottom: 1px solid var(--border);
            }
            #wx-ai-panel .ai-token-bar span { white-space: nowrap; }

            #wx-ai-panel .ai-panel-chat { flex: 1 1 auto; min-height: 0; padding: 16px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 16px; overscroll-behavior: contain; }
            #wx-ai-panel .ai-panel-chat::-webkit-scrollbar,
            #wx-ai-panel .ai-panel-settings::-webkit-scrollbar,
            #wx-ai-panel .chat-bubble.assistant pre::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
            #wx-ai-panel .ai-panel-chat, #wx-ai-panel .ai-panel-settings, #wx-ai-panel .chat-bubble.assistant pre { scrollbar-width: none; -ms-overflow-style: none; }

            #wx-ai-panel .chat-bubble { position: relative; flex: 0 0 auto; padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.6; word-wrap: break-word; overflow-wrap: anywhere; box-sizing: border-box; min-height: 0; max-height: none; }
            #wx-ai-panel .chat-bubble.user { max-width: 82%; background: var(--accent); color: white; align-self: flex-end; border-bottom-right-radius: 2px; white-space: pre-wrap; }
            #wx-ai-panel .chat-bubble.assistant { display: flow-root; width: 100%; max-width: 100%; min-width: 0; background: var(--bg-bubble); color: var(--text-2); align-self: stretch; border-bottom-left-radius: 2px; border: 1px solid var(--border); overflow: visible;}
            #wx-ai-panel .chat-bubble.system { background: transparent; color: var(--text-faint); align-self: center; font-size: 12px; text-align: center; }

            /* Markdown 样式适配 */
            #wx-ai-panel .chat-bubble.assistant * { max-width: 100%; box-sizing: border-box; float: none; clear: none; }
            #wx-ai-panel .chat-bubble.assistant h1, #wx-ai-panel .chat-bubble.assistant h2, #wx-ai-panel .chat-bubble.assistant h3, #wx-ai-panel .chat-bubble.assistant h4 { display: block; color: var(--text-strong); margin-top: 0; margin-bottom: 8px; font-size: 15px; line-height: 1.4; font-weight: 700; text-align: left; }
            #wx-ai-panel .chat-bubble.assistant p { display: block; margin: 0 0 8px 0; color: inherit; font-size: inherit; line-height: inherit; text-align: left; text-indent: 0; letter-spacing: 0; }
            #wx-ai-panel .chat-bubble.assistant p:last-child { margin: 0; }
            #wx-ai-panel .chat-bubble.assistant blockquote { display: block; margin: 8px 0; padding: 8px 0 8px 12px; border-left: 3px solid var(--accent); color: var(--text-2); background: rgba(255, 255, 255, 0.03); overflow: hidden; }
            #wx-ai-panel .chat-bubble.assistant blockquote p { margin: 0 0 8px 0; }
            #wx-ai-panel .chat-bubble.assistant blockquote p:last-child { margin-bottom: 0; }
            #wx-ai-panel .chat-bubble.assistant ul, #wx-ai-panel .chat-bubble.assistant ol { display: block; margin: 0 0 8px 0; padding-left: 20px; overflow: visible; list-style-position: outside; }
            #wx-ai-panel .chat-bubble.assistant ul { list-style-type: disc; }
            #wx-ai-panel .chat-bubble.assistant ol { list-style-type: decimal; }
            #wx-ai-panel .chat-bubble.assistant li { display: list-item; margin: 2px 0; padding-left: 0; color: inherit; font-size: inherit; line-height: inherit; text-align: left; }
            #wx-ai-panel .chat-bubble.assistant strong { color: var(--strong-accent); }
            #wx-ai-panel .chat-bubble.assistant code { background: var(--bg-code); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
            #wx-ai-panel .chat-bubble.assistant pre { display: block; background: var(--bg-code); padding: 10px; border-radius: 6px; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--border-2); margin: 8px 0; max-width: 100%; box-sizing: border-box;}
            #wx-ai-panel .chat-bubble.assistant pre code { display: block; white-space: pre; background: transparent; padding: 0; }
            #wx-ai-panel .chat-bubble.assistant table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; color: var(--text); table-layout: fixed; }
            #wx-ai-panel .chat-bubble.assistant th, #wx-ai-panel .chat-bubble.assistant td { border: 1px solid var(--border-2); padding: 6px 10px; text-align: left; word-break: break-word; }
            #wx-ai-panel .chat-bubble.assistant th { background-color: var(--bg-code); color: var(--accent); font-weight: bold; }
            #wx-ai-panel .chat-bubble.assistant tr:nth-child(even) { background-color: var(--row-stripe); }
            #wx-ai-panel .chat-bubble.assistant img, #wx-ai-panel .chat-bubble.assistant video { display: block; height: auto; margin: 8px 0; border-radius: 6px; }
            #wx-ai-panel .chat-bubble.assistant details.wx-ai-thinking { display: block; margin: 0 0 8px 0; overflow: hidden; border-radius: 6px; background: var(--bg-think); }
            #wx-ai-panel .chat-bubble.assistant details.wx-ai-thinking summary { display: list-item; padding: 6px 10px; font-size: 12px; color: var(--text-mute); cursor: pointer; user-select: none; }

            #wx-ai-panel .ai-regen-btn {
                display: inline-flex; align-items: center; gap: 4px; margin-top: 10px;
                padding: 4px 10px; font-size: 12px; cursor: pointer;
                background: var(--bg-settings); color: var(--accent); border: 1px solid var(--border-2); border-radius: 6px;
                transition: background 0.2s, color 0.2s;
            }
            #wx-ai-panel .ai-regen-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

            #wx-ai-panel .ai-panel-input-area {
                flex: 0 0 auto; padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg-elev);
                display: flex; align-items: flex-end; gap: 8px; border-radius: 0 0 12px 12px;
            }
            #wx-ai-panel .ai-chat-inputwrap {
                flex: 1; display: flex; align-items: flex-end; box-sizing: border-box;
                background: var(--bg); border: 1px solid var(--border-2); border-radius: 17px;
                padding: 4px 6px 4px 14px; transition: border-color 0.2s, box-shadow 0.2s;
            }
            #wx-ai-panel .ai-chat-inputwrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(7, 193, 96, 0.25); }
            #wx-ai-panel .ai-chat-textarea {
                flex: 1; height: 24px; min-height: 24px; max-height: 100px;
                background: transparent; border: none; color: var(--text);
                padding: 0; font-size: 13px; line-height: 24px; resize: none; outline: none; font-family: inherit;
            }
            #wx-ai-panel .ai-chat-textarea::placeholder { color: var(--text-faint); }
            #wx-ai-panel .ai-chat-send {
                flex: none; width: 34px; height: 34px; padding: 0;
                display: inline-flex; align-items: center; justify-content: center;
                background: var(--accent); color: #fff; border: none; border-radius: 50%;
                cursor: pointer; font-size: 15px; line-height: 1;
                transition: background 0.2s, transform 0.1s;
            }
            #wx-ai-panel .ai-chat-send:hover { background: var(--accent-hover); }
            #wx-ai-panel .ai-chat-send:active { transform: scale(0.92); }
            #wx-ai-panel .ai-chat-send:disabled { background: var(--border-2); color: var(--text-faint); cursor: not-allowed; }
            #wx-ai-panel .ai-chat-send.ai-chat-stop { background: #d9363e; font-size: 15px; }
            #wx-ai-panel .ai-chat-send.ai-chat-stop:hover { background: #f5222d; }
            #wx-ai-panel .ai-chat-send.ai-chat-pill { width: auto; border-radius: 17px; padding: 0 16px; height: 34px; font-size: 13px; font-weight: bold; }

            #wx-ai-panel .ai-panel-settings {
                position: absolute; top: 53px; left: 12px; right: 12px;
                max-height: calc(100% - 130px); overflow-y: auto; overscroll-behavior: contain;
                padding: 16px; font-size: 12px; color: var(--text);
                background: var(--bg-settings); border: 1px solid var(--border-3); border-radius: 10px;
                box-shadow: 0 12px 32px var(--shadow);
                display: none; z-index: 10;
            }
            #wx-ai-panel .ai-panel-settings::before {
                content: "⚙️ 设置"; display: block; font-size: 13px; font-weight: bold;
                color: var(--accent); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-2);
            }
            #wx-ai-panel .ai-input { width: 100%; box-sizing: border-box; margin-top: 4px; margin-bottom: 8px; padding: 6px; background: var(--bg); border: 1px solid var(--border-2); color: var(--text); border-radius: 4px; font-family: inherit; font-size: 12px; line-height: 1.4; outline: none;}
            #wx-ai-panel .ai-settings-row { display: flex; gap: 8px; min-width: 0; }

            @media (max-width: 520px) {
                #wx-ai-panel {
                    right: 10px; left: 10px; top: 60px; width: auto; height: calc(100vh - 90px);
                    max-width: none; max-height: none;
                }
                #wx-ai-panel .ai-model-select { max-width: 130px; }
                #wx-ai-panel .ai-panel-header { padding: 10px 12px; }
                #wx-ai-panel .ai-panel-chat { padding: 12px; gap: 12px; }
            }
        `;
        document.head.appendChild(style);
    }

    function showInfoBar(m, t = 'info', d = 3000) {
        const e = document.querySelector('.wx-ai-infobar');
        if (e) e.remove();
        const i = document.createElement('div');
        i.className = `wx-ai-infobar ${t}`;
        i.textContent = m;
        document.body.appendChild(i);
        if (d > 0) {
            setTimeout(() => {
                if (i.parentNode) {
                    i.style.opacity = '0';
                    i.style.transform = 'translate(-50%, -50%) scale(0.9)';
                    setTimeout(() => i.remove(), 300);
                }
            }, d);
        }
        return i;
    }

    function escapeHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderMarkdown(src) {
        const text = String(src ?? "");
        if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
            const html = marked.parse(text);
            return DOMPurify.sanitize(html, {
                ADD_ATTR: ["target", "rel"]
            });
        }
        return escapeHtml(text).replace(/\n/g, "<br>");
    }

    // 获取微信公众号文章内容
    function fetchArticleText() {
        return new Promise((resolve, reject) => {
            const contentNode = document.getElementById('js_content');
            if (!contentNode) {
                return reject(new Error('未找到文章正文内容 (#js_content)'));
            }

            const titleNode = document.getElementById('activity-name');
            const authorNode = document.getElementById('js_name');

            const title = titleNode ? titleNode.innerText.trim() : document.title;
            const author = authorNode ? authorNode.innerText.trim() : '未知作者';
            currentArticleTitle = title;

            let text = contentNode.innerText;
            if (!text || text.trim() === '') {
                text = contentNode.textContent;
            }

            text = text.replace(/\n\s*\n/g, '\n').trim();

            if (!text) {
                return reject(new Error('文章内容为空'));
            }

            const finalContext = `文章标题：${title}\n公众号作者：${author}\n\n正文内容：\n${text}`;
            resolve(finalContext);
        });
    }

    function resetSessionTokens() {
        sessionTokens = { input: 0, output: 0 };
        const bar = document.getElementById("ai-token-bar");
        if (bar) bar.style.display = "none";
    }

    function updateTokenBar(usage) {
        const bar = document.getElementById("ai-token-bar");
        if (!bar) return;
        if (!usage || (typeof usage.prompt_tokens !== "number" && typeof usage.completion_tokens !== "number")) {
            if (sessionTokens.input === 0 && sessionTokens.output === 0) {
                bar.style.display = "none";
            }
            return;
        }

        const curIn = Number(usage.prompt_tokens || 0);
        const curOut = Number(usage.completion_tokens || 0);
        sessionTokens.input += curIn;
        sessionTokens.output += curOut;

        bar.innerHTML = `<span>本次: <sub>in</sub>${curIn} / <sub>out</sub>${curOut}</span><span>累计: <sub>in</sub>${sessionTokens.input} / <sub>out</sub>${sessionTokens.output}</span>`;
        bar.style.display = "flex";
    }

    function applyThinkingParams(payload, cfg) {
        const enabled = !!cfg.thinking;
        const provider = cfg.provider;
        const endpoint = cfg.endpoint || "";

        if (provider === "aliyun") {
            payload.enable_thinking = enabled;
        } else if (provider === "deepseek") {
            payload.thinking = { type: enabled ? "enabled" : "disabled" };
        } else {
            if (endpoint.includes("dashscope")) payload.enable_thinking = enabled;
            if (endpoint.includes("deepseek.com")) payload.thinking = { type: enabled ? "enabled" : "disabled" };
        }

        if (cfg.extraBody && cfg.extraBody.trim()) {
            try {
                const extra = JSON.parse(cfg.extraBody);
                Object.assign(payload, extra);
            } catch (e) {
                console.warn("[WX-AI] Extra Body JSON 解析失败:", e);
            }
        }
    }

    function requestAIStream(messages, onComplete, onError, assistantBubble) {
        if (!aiConfig.apiKey) {
            onError("请先点击右上角⚙️图标配置 API Key");
            return;
        }

        const selectedModel = document.getElementById('ai-model-select')?.value || aiConfig.model1;
        isRequesting = true;
        activeAssistantBubble = assistantBubble || null;
        updateChatSendButtonState();

        const payload = {
            model: selectedModel,
            messages: messages,
            stream: true,
            stream_options: { include_usage: true }
        };
        applyThinkingParams(payload, aiConfig);

        const seq = ++requestSeq;

        currentRequest = GM_xmlhttpRequest({
            method: "POST",
            url: aiConfig.endpoint,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${aiConfig.apiKey.trim()}`,
                "Accept": "text/event-stream"
            },
            data: JSON.stringify(payload),
            responseType: 'stream',
            onloadstart: async function (response) {
                if (seq !== requestSeq) return;
                let thinkingTimer = null;
                let thinkingSeconds = 0;
                let usageData = null;

                try {
                    const reader = response.response.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let buffer = '';
                    let reasoningContent = '';
                    let mainContent = '';

                    const updateDisplay = () => {
                        let html = '';
                        if (reasoningContent) {
                            const summaryText = mainContent
                                ? `🧠 思考过程 (耗时 ${thinkingSeconds}s)`
                                : `🧠 思考中… (${thinkingSeconds}s)`;
                            html += `<details class="wx-ai-thinking" style="margin-bottom: 8px;">
                                <summary>${summaryText}</summary>
                                <div style="color:var(--text-faint);font-size:12px;padding:8px;background:var(--bg-think);border-radius:6px;margin-top:4px;white-space:pre-wrap;">${escapeHtml(reasoningContent)}</div>
                            </details>`;
                        }
                        if (mainContent) {
                            html += renderMarkdown(mainContent);
                        } else if (reasoningContent) {
                            html += '<span style="color:var(--text-faint);">AI 深度思考中...</span>';
                        }
                        if (assistantBubble && seq === requestSeq) {
                            assistantBubble.innerHTML = html;
                            const chatContainer = document.getElementById('ai-panel-chat');
                            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
                        }
                    };

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (seq !== requestSeq) break;

                        buffer += decoder.decode(value, { stream: true });
                        let lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (let line of lines) {
                            line = line.trim();
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6);
                                if (dataStr === '[DONE]') continue;
                                try {
                                    const data = JSON.parse(dataStr);
                                    if (data.usage) {
                                        usageData = data.usage;
                                    }
                                    if (data.choices && data.choices[0] && data.choices[0].delta) {
                                        const delta = data.choices[0].delta;
                                        let updated = false;

                                        if (delta.reasoning_content) {
                                            reasoningContent += delta.reasoning_content;
                                            updated = true;
                                            if (!thinkingTimer) {
                                                thinkingSeconds = 0;
                                                thinkingTimer = setInterval(() => {
                                                    thinkingSeconds++;
                                                    updateDisplay();
                                                }, 1000);
                                            }
                                        }

                                        if (delta.content) {
                                            if (thinkingTimer) {
                                                clearInterval(thinkingTimer);
                                                thinkingTimer = null;
                                            }
                                            mainContent += delta.content;
                                            updated = true;
                                        }

                                        if (updated) {
                                            updateDisplay();
                                        }
                                    }
                                } catch (e) { }
                            }
                        }
                    }

                    if (thinkingTimer) {
                        clearInterval(thinkingTimer);
                        thinkingTimer = null;
                    }

                    if (seq === requestSeq) {
                        isRequesting = false;
                        currentRequest = null;
                        activeAssistantBubble = null;
                        updateDisplay();
                        if (usageData) updateTokenBar(usageData);
                        onComplete(mainContent || reasoningContent);
                        updateChatSendButtonState();
                    }
                } catch (err) {
                    if (thinkingTimer) clearInterval(thinkingTimer);
                    if (seq === requestSeq) {
                        isRequesting = false;
                        currentRequest = null;
                        activeAssistantBubble = null;
                        onError("流读取中断");
                        updateChatSendButtonState();
                    }
                }
            },
            onerror: function (err) {
                if (seq === requestSeq) {
                    isRequesting = false;
                    currentRequest = null;
                    activeAssistantBubble = null;
                    onError("网络请求失败，请检查配置或网络");
                    updateChatSendButtonState();
                }
            }
        });
    }

    function updateChatSendButtonState() {
        const btn = document.getElementById('ai-chat-send');
        const textarea = document.getElementById('ai-chat-textarea');
        if (!btn || !textarea) return;

        if (isRequesting) {
            btn.innerHTML = '⏹';
            btn.title = '点击终止生成';
            btn.className = 'ai-chat-send ai-chat-stop';
            btn.disabled = false;
        } else if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
            btn.innerHTML = '▶';
            btn.title = '请先配置 API Key';
            btn.className = 'ai-chat-send';
            btn.disabled = true;
            textarea.placeholder = '请先配置 API Key...';
        } else if (chatHistory.length === 0) {
            btn.innerHTML = '总结';
            btn.title = '生成文章总结';
            btn.className = 'ai-chat-send ai-chat-pill';
            btn.disabled = false;
            textarea.placeholder = '点击“总结”获取文章内容总结...';
        } else {
            btn.innerHTML = '▶';
            btn.title = '发送消息 (Enter)';
            btn.className = 'ai-chat-send';
            btn.disabled = false;
            textarea.placeholder = '向 AI 提问关于文章的内容...';
        }
    }

    function appendChatBubble(role, contentHTML) {
        const chatContainer = document.getElementById('ai-panel-chat');
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;
        bubble.innerHTML = contentHTML;
        chatContainer.appendChild(bubble);

        if (role !== 'assistant') {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        return bubble;
    }

    function attachRegenButton(bubble) {
        if (!bubble || bubble.querySelector(".ai-regen-btn")) return;
        const btn = document.createElement("button");
        btn.className = "ai-regen-btn";
        btn.type = "button";
        btn.innerHTML = "🔄 重新生成";
        btn.title = "重新生成此条 AI 回复";
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            regenerateLast(bubble);
        });
        bubble.appendChild(btn);
    }

    function regenerateLast(bubble) {
        if (isRequesting) {
            showInfoBar("请等待当前请求结束或点击终止按钮", "info");
            return;
        }
        if (chatHistory.length < 2) return;

        if (chatHistory[chatHistory.length - 1].role === "assistant") {
            chatHistory.pop();
        }

        bubble.innerHTML = '<span style="color:var(--text-faint);">AI 响应中...</span>';

        runChatStream(bubble, (text) => {
            chatHistory.push({ role: "assistant", content: text });
            attachRegenButton(bubble);
        });
    }

    function runChatStream(assistantBubble, onDone) {
        requestAIStream(
            chatHistory,
            (plainTextForHistory) => {
                if (typeof onDone === "function") onDone(plainTextForHistory);
            },
            (errMsg) => {
                if (assistantBubble) {
                    assistantBubble.innerHTML = `<span style="color:#f5222d;">❌ ${errMsg}</span>`;
                }
            },
            assistantBubble
        );
    }

    function triggerSummary(plainText) {
        const chatContainer = document.getElementById('ai-panel-chat');
        chatContainer.innerHTML = '';
        chatHistory = [];
        resetSessionTokens();

        const systemPrompt = "你是一个得力的文章内容总结与问答助手。请直接输出 Markdown 格式的排版内容。";
        const userPrompt = `${aiConfig.prompt}\n\n${plainText}`;

        chatHistory.push({ role: "system", content: systemPrompt });
        chatHistory.push({ role: "user", content: userPrompt });

        appendChatBubble('system', '正在阅读文章内容并生成总结...');
        const assistantBubble = appendChatBubble('assistant', '<span style="color:var(--text-faint);">AI 响应中...</span>');

        runChatStream(assistantBubble, (text) => {
            chatHistory.push({ role: "assistant", content: text });
            const sysPill = document.getElementById('ai-panel-chat').querySelector('.system');
            if (sysPill) sysPill.textContent = '总结完成，您可以继续提问👇';
            attachRegenButton(assistantBubble);
        });
    }

    function handleSendChat() {
        if (isRequesting) {
            stopCurrentGeneration();
            return;
        }

        if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
            const chatContainer = document.getElementById('ai-panel-chat');
            chatContainer.innerHTML = '<div class="chat-bubble system" style="color:#ffcc00">⚠️ 请先点击右上角 ⚙️ 配置您的 API Key。</div>';
            document.getElementById('ai-panel-settings-container').style.display = 'block';
            return;
        }

        if (chatHistory.length === 0) {
            ensureArticleAndExecuteGlobal(() => { handleAISummaryBtn(); });
            return;
        }

        const inputEl = document.getElementById('ai-chat-textarea');
        const text = inputEl.value.trim();
        if (!text) return;

        inputEl.value = '';
        inputEl.style.height = '24px';
        appendChatBubble('user', text);

        chatHistory.push({ role: "user", content: text });
        const assistantBubble = appendChatBubble('assistant', '<span style="color:var(--text-faint);">AI 响应中...</span>');

        const chatContainer = document.getElementById('ai-panel-chat');
        chatContainer.scrollTop = chatContainer.scrollHeight;

        runChatStream(assistantBubble, (plainTextForHistory) => {
            chatHistory.push({ role: "assistant", content: plainTextForHistory });
            attachRegenButton(assistantBubble);
        });
    }

    function handleAISummaryBtn() {
        const panel = document.getElementById('wx-ai-panel');
        const minTab = document.getElementById('wx-ai-minimized');

        panel.style.display = 'flex';
        minTab.style.display = 'none';

        if (chatHistory.length > 0) return;

        const chatContainer = document.getElementById('ai-panel-chat');
        if (!aiConfig.apiKey) {
            chatContainer.innerHTML = '<div class="chat-bubble system" style="color:#ffcc00">⚠️ 请先点击右上角 ⚙️ 配置您的 API Key。</div>';
            document.getElementById('ai-panel-settings-container').style.display = 'block';
            return;
        }

        chatContainer.innerHTML = '<div class="chat-bubble system">获取文章内容中...</div>';

        fetchArticleText().then(plainText => {
            currentArticleText = plainText;
            triggerSummary(plainText);
        }).catch(err => {
            chatContainer.innerHTML = `<div class="chat-bubble system" style="color:#f5222d;">❌ 提取内容失败: ${err.message}</div>`;
        });
    }

    function ensureArticleAndExecuteGlobal(actionCallback) {
        if (document.getElementById('js_content')) {
            actionCallback();
        } else {
            showInfoBar("当前页面未检测到公众号文章正文", "error");
        }
    }

    function makeTabDraggable(tab, panel) {
        let isDragging = false;
        let startY = 0;
        let startTop = 0;
        let hasMoved = false;

        tab.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            hasMoved = false;
            startY = e.clientY;
            const rect = tab.getBoundingClientRect();
            startTop = rect.top;
            tab.classList.add("dragging");
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dy = e.clientY - startY;
            if (Math.abs(dy) > 3) hasMoved = true;

            const newTop = Math.max(10, Math.min(window.innerHeight - 120, startTop + dy));
            tab.style.top = newTop + "px";
            tab.style.transform = "none";
        });

        window.addEventListener("mouseup", () => {
            if (!isDragging) return;
            isDragging = false;
            tab.classList.remove("dragging");

            const finalTop = tab.getBoundingClientRect().top;
            GM_setValue("wx_minTabTop", finalTop);
        });

        tab.addEventListener("click", (e) => {
            if (hasMoved) {
                e.stopImmediatePropagation();
                hasMoved = false;
            }
        });
    }

    function refreshModelSelect() {
        const select = document.getElementById("ai-model-select");
        if (!select) return;
        select.innerHTML = "";
        const m1 = aiConfig.model1 || "default-model";
        const m2 = aiConfig.model2 || "";

        const opt1 = document.createElement("option");
        opt1.value = m1;
        opt1.textContent = `${m1} (主)`;
        select.appendChild(opt1);

        if (m2) {
            const opt2 = document.createElement("option");
            opt2.value = m2;
            opt2.textContent = `${m2} (备)`;
            select.appendChild(opt2);
        }

        const storedLast = GM_getValue(providerKey("wx_ai_last_model", aiConfig.provider), "");
        if (storedLast && (storedLast === m1 || storedLast === m2)) {
            select.value = storedLast;
        } else {
            select.value = m1;
        }
    }

    function copyCurrentSummary() {
        if (!chatHistory || chatHistory.length === 0) {
            showInfoBar("尚无可复制的总结内容", "error");
            return;
        }
        let assistantText = "";
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === "assistant") {
                assistantText = chatHistory[i].content;
                break;
            }
        }
        if (!assistantText) {
            showInfoBar("未找到生成的总结内容", "error");
            return;
        }
        const textToCopy = (currentArticleTitle ? `【${currentArticleTitle}】\n\n` : "") + assistantText;
        if (typeof GM_setClipboard !== "undefined") {
            GM_setClipboard(textToCopy);
            showInfoBar("已复制总结 Markdown 到剪贴板", "success");
        } else {
            navigator.clipboard.writeText(textToCopy).then(() => {
                showInfoBar("已复制总结 Markdown 到剪贴板", "success");
            }).catch(() => {
                showInfoBar("复制失败", "error");
            });
        }
    }

    // 创建整个 AI UI 面板
    function createAIPanel() {
        if (document.getElementById('wx-ai-panel')) return;

        const minTab = document.createElement('div');
        minTab.id = 'wx-ai-minimized';
        minTab.innerHTML = `<span>AI总结</span>`;
        document.body.appendChild(minTab);

        makeTabDraggable(minTab, null);

        minTab.addEventListener('click', () => {
            ensureArticleAndExecuteGlobal(() => { handleAISummaryBtn(); });
        });

        const panel = document.createElement('div');
        panel.id = 'wx-ai-panel';
        panel.innerHTML = `
            <div class="ai-panel-header">
                <div class="ai-panel-header-left">
                    <span class="ai-panel-title">✨ AI</span>
                    <select id="ai-model-select" class="ai-model-select" title="切换模型"></select>
                    <span class="ai-refresh-btn" id="ai-refresh-btn" title="重新总结">🔄</span>
                </div>
                <div class="ai-panel-header-actions">
                    <span class="ai-icon-btn" id="ai-copy-btn" title="复制总结">📋</span>
                    <span class="ai-icon-btn" id="ai-clear-btn" title="清空对话">🗑️</span>
                    <span class="ai-icon-btn" id="ai-setting-toggle" title="设置">⚙️</span>
                    <span class="ai-icon-btn" id="ai-minimize-btn" title="收起到侧边">➖</span>
                </div>
            </div>

            <div class="ai-token-bar" id="ai-token-bar" style="display: none;"></div>

            <div class="ai-panel-chat" id="ai-panel-chat">
                <div class="chat-bubble system">准备就绪。点击下方“总结”开始。</div>
            </div>

            <div class="ai-panel-settings" id="ai-panel-settings-container">
                <div style="margin-bottom: 4px; color: var(--text-mute);">服务商与 API 配置:</div>
                <div class="ai-settings-row">
                    <select id="set-provider" class="ai-input" style="width: 38%; padding: 4px;">
                        <option value="aliyun" ${aiConfig.provider === 'aliyun' ? 'selected' : ''}>阿里云百炼</option>
                        <option value="deepseek" ${aiConfig.provider === 'deepseek' ? 'selected' : ''}>DeepSeek官方</option>
                        <option value="custom" ${aiConfig.provider === 'custom' ? 'selected' : ''}>自定义端点</option>
                    </select>
                    <div style="position: relative; width: 62%;">
                        <input type="password" id="set-apikey" class="ai-input" style="width: 100%; padding-right: 28px;" value="${escapeHtml(aiConfig.apiKey)}" placeholder="API Key (sk-...)">
                        <span id="ai-toggle-pwd" style="position: absolute; right: 6px; top: 8px; cursor: pointer; user-select: none; font-size: 13px;" title="显示/隐藏 Key">👁️</span>
                    </div>
                </div>
                <input type="text" id="set-endpoint" class="ai-input" value="${escapeHtml(aiConfig.endpoint)}" placeholder="自定义 API Endpoint" style="display: ${aiConfig.provider === 'custom' ? 'block' : 'none'};">

                <div class="ai-settings-row">
                    <input type="text" id="set-model1" class="ai-input" value="${escapeHtml(aiConfig.model1)}" placeholder="主模型">
                    <input type="text" id="set-model2" class="ai-input" value="${escapeHtml(aiConfig.model2)}" placeholder="备用模型">
                </div>
                <div style="margin: 4px 0 8px 0;">
                    <label style="color:var(--text); font-size:12px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" id="set-thinking" ${aiConfig.thinking ? 'checked' : ''}>
                        开启思考模式 (Reasoning)
                    </label>
                </div>
                <div style="margin: 0 0 4px 0; color: var(--text-mute);">预设总结模板:</div>
                <select id="set-prompt-template" class="ai-input">
                    <option value="summary" ${aiConfig.promptTemplate === 'summary' ? 'selected' : ''}>结构化全面总结</option>
                    <option value="keypoints" ${aiConfig.promptTemplate === 'keypoints' ? 'selected' : ''}>核心要点与金句提炼</option>
                    <option value="qa" ${aiConfig.promptTemplate === 'qa' ? 'selected' : ''}>核心问题 Q&A 解答</option>
                    <option value="custom" ${aiConfig.promptTemplate === 'custom' ? 'selected' : ''}>自定义 Prompt</option>
                </select>
                <div style="margin: 0 0 4px 0; color: var(--text-mute);">自定义 Prompt 内容:</div>
                <textarea id="set-prompt" class="ai-input" style="height: 54px; resize: vertical;" placeholder="要求 AI 如何进行总结...">${escapeHtml(aiConfig.prompt)}</textarea>
                
                <div style="margin: 4px 0 4px 0; color: var(--text-mute);">额外 Body 参数 (JSON 格式, 可选):</div>
                <textarea id="set-extrabody" class="ai-input" style="height: 40px; resize: vertical; font-family: monospace;" placeholder='例如: {"temperature": 0.7}'>${escapeHtml(aiConfig.extraBody || '')}</textarea>

                <button class="ai-chat-send ai-chat-pill" id="ai-save-btn" style="width:100%; margin-top:4px; height: 32px;">保存配置</button>
            </div>

            <div class="ai-panel-input-area">
                <div class="ai-chat-inputwrap">
                    <textarea id="ai-chat-textarea" class="ai-chat-textarea" placeholder="点击“总结”获取文章内容总结..."></textarea>
                </div>
                <button id="ai-chat-send" class="ai-chat-send">发送</button>
            </div>
        `;
        document.body.appendChild(panel);

        refreshModelSelect();

        // 切换模型保存选择
        document.getElementById('ai-model-select').addEventListener('change', function () {
            GM_setValue(providerKey("wx_ai_last_model", aiConfig.provider), this.value);
        });

        // 密码明暗切换
        document.getElementById('ai-toggle-pwd').addEventListener('click', function () {
            const input = document.getElementById('set-apikey');
            if (input.type === 'password') {
                input.type = 'text';
                this.textContent = '🔒';
            } else {
                input.type = 'password';
                this.textContent = '👁️';
            }
        });

        // 预设 Prompt 切换
        document.getElementById('set-prompt-template').addEventListener('change', function () {
            const promptInput = document.getElementById('set-prompt');
            if (PROMPT_TEMPLATES[this.value]) {
                promptInput.value = PROMPT_TEMPLATES[this.value];
            }
        });

        // 服务商切换联动
        document.getElementById('set-provider').addEventListener('change', function () {
            const newProv = this.value;
            const epInput = document.getElementById('set-endpoint');
            epInput.style.display = newProv === 'custom' ? 'block' : 'none';

            const provCfg = loadProviderConfig(newProv);
            document.getElementById('set-apikey').value = provCfg.apiKey || '';
            document.getElementById('set-endpoint').value = provCfg.endpoint || ENDPOINTS[newProv] || '';
            document.getElementById('set-model1').value = provCfg.model1 || '';
            document.getElementById('set-model2').value = provCfg.model2 || '';
            document.getElementById('set-thinking').checked = !!provCfg.thinking;
            document.getElementById('set-extrabody').value = provCfg.extraBody || '';
        });

        // Header Actions
        document.getElementById('ai-minimize-btn').addEventListener('click', () => {
            panel.style.display = 'none';
            minTab.style.display = 'flex';
        });

        document.getElementById('ai-copy-btn').addEventListener('click', () => {
            copyCurrentSummary();
        });

        document.getElementById('ai-clear-btn').addEventListener('click', () => {
            abortCurrentRequest();
            chatHistory = [];
            resetSessionTokens();
            const chatContainer = document.getElementById('ai-panel-chat');
            chatContainer.innerHTML = '<div class="chat-bubble system">对话记录已清空。点击“总结”开始。</div>';
            updateChatSendButtonState();
            showInfoBar("对话已清空", "info");
        });

        document.getElementById('ai-refresh-btn').addEventListener('click', () => {
            if (isRequesting) {
                showInfoBar("正在生成中，请先终止或等待完成", "info");
                return;
            }
            if (!currentArticleText) {
                ensureArticleAndExecuteGlobal(() => { handleAISummaryBtn(); });
                return;
            }
            triggerSummary(currentArticleText);
        });

        document.getElementById('ai-setting-toggle').addEventListener('click', () => {
            const box = document.getElementById('ai-panel-settings-container');
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
        });

        // 保存配置
        document.getElementById('ai-save-btn').addEventListener('click', () => {
            const selectedProv = document.getElementById('set-provider').value;

            for (let k in CONFIG_DICT) {
                const config = CONFIG_DICT[k];
                const el = document.getElementById(config.el);
                if (!el) continue;
                const val = config.isCheckbox ? el.checked : el.value;

                if (config.perProvider) {
                    GM_setValue(providerKey(config.key, selectedProv), val);
                } else {
                    GM_setValue(config.key, val);
                    aiConfig[k] = val;
                }
            }
            aiConfig.provider = selectedProv;
            Object.assign(aiConfig, loadProviderConfig(selectedProv));

            refreshModelSelect();
            updateChatSendButtonState();

            const btn = document.getElementById('ai-save-btn');
            btn.textContent = '已保存！';
            btn.style.background = '#52c41a';
            setTimeout(() => {
                btn.textContent = '保存配置';
                btn.style.background = 'var(--accent)';
                document.getElementById('ai-panel-settings-container').style.display = 'none';
            }, 1000);
        });

        document.getElementById('ai-chat-send').addEventListener('click', handleSendChat);
        document.getElementById('ai-chat-textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
            }
        });

        const textarea = document.getElementById('ai-chat-textarea');
        textarea.addEventListener('input', function () {
            this.style.height = '24px';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });

        updateChatSendButtonState();
    }

    function init() {
        addGlobalStyles();
        createAIPanel();

        if (typeof GM_registerMenuCommand !== "undefined") {
            GM_registerMenuCommand("✨ 打开/关闭 AI 面板", () => {
                const panel = document.getElementById("wx-ai-panel");
                const minTab = document.getElementById("wx-ai-minimized");
                if (!panel || !minTab) return;
                if (panel.style.display === "flex") {
                    panel.style.display = "none";
                    minTab.style.display = "flex";
                } else {
                    ensureArticleAndExecuteGlobal(() => { handleAISummaryBtn(); });
                }
            });
            GM_registerMenuCommand("⚙️ 助手配置", () => {
                const panel = document.getElementById("wx-ai-panel");
                const minTab = document.getElementById("wx-ai-minimized");
                const box = document.getElementById("ai-panel-settings-container");
                if (panel && minTab && box) {
                    panel.style.display = "flex";
                    minTab.style.display = "none";
                    box.style.display = "block";
                }
            });
        }

        console.log(`%c 🚀 微信文章AI助手 v${version} %c Cost ${Math.round(performance.now() - startTime)}ms`, "background:#07c160;color:white;padding:2px 6px;border-radius:3px 0 0 3px;", "background:#50E3C2;color:#003333;padding:2px 6px;border-radius:0 3px 3px 0;");
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
