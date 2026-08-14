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
                    <textarea id="set-extrabody" class="ai-input" style="height: 60px; resize: vertical; margin-bottom: 0; font-family: monospace; font-size: 12px;" placeholder='例如:{"enable_thinking": true} 或 {"reasoning_effort": "high"}'>${escapeHtml(aiConfig.extraBody || "")}</textarea>
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

