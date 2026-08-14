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
