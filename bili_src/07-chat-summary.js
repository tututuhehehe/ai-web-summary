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

