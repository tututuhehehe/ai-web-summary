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

