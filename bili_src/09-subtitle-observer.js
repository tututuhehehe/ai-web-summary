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

