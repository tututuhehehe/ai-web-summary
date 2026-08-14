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
