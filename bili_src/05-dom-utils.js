
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

