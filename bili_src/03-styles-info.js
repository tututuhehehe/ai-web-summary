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
