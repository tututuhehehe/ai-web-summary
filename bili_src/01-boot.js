(function () {
  "use strict";

  const startTime = performance.now();
  const version = typeof GM_info !== "undefined" && GM_info.script ? GM_info.script.version : "dev";

  // 集中管理外部端点常量,避免在多处硬编码
  const ENDPOINTS = {
    aliyun:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
  };

  // 集中管理 B 站播放器 DOM 选择器,B 站改版时只需在此处维护
  const SELECTORS = {
    subtitleLangItem: ".bpx-player-ctrl-subtitle-language-item",
    subtitleToggle: ".bpx-player-ctrl-subtitle",
    playerContainer: ".bpx-player-container",
    // 视频标题:普通视频页 / 番剧页 / 旧版,多重兜底
    videoTitle: [
      ".video-info-title-inner .video-title",
      ".video-info-title .video-title",
      "h1.video-title",
      ".video-title[title]",
      "h1[title]",
      ".media-title", // 番剧
      ".mediainfo_mediaTitle__Zyzte", // 番剧新版
    ],
  };

  // 配置数据字典
  const CONFIG_DICT = {
    provider: { key: "ai_provider", def: "siliconflow", el: "set-provider" },
    endpoint: {
      key: "ai_endpoint",
      def: ENDPOINTS.aliyun,
      el: "set-endpoint",
      perProvider: true, // 按服务商分别存储
    },
    apiKey: {
      key: "ai_api_key",
      def: "",
      el: "set-apikey",
      perProvider: true, // 按服务商分别存储
    },
    model1: {
      key: "ai_model1",
      def: "deepseek-v4-flash",
      el: "set-model1",
      perProvider: true,
    },
    model2: {
      key: "ai_model2",
      def: "deepseek-v4-pro",
      el: "set-model2",
      perProvider: true,
    },
    thinking: {
      key: "ai_thinking",
      def: false,
      el: "set-thinking",
      isCheckbox: true,
    },
    extraBody: {
      key: "ai_extra_body",
      def: "",
      el: "set-extrabody",
      perProvider: true, // 仅自定义服务商使用:额外 payload 参数(JSON)
    },
    prompt: {
      key: "ai_custom_prompt",
      def: `视频总结 Agent System Prompt

      你是一名专业的信息提炼与知识整理助手。

      视频标题:

      {{video_title}}

      用户通常是因为这个标题而点击视频。

      因此,你首先要回答的不是「视频讲了什么」,而是:

      标题中的问题,最终答案是什么?
      或
      标题所讨论的话题,最终结论是什么?

      你的任务是基于用户提供的视频字幕(Transcript),提炼作者真正想表达的观点、结论和逻辑,并输出高信息密度总结。

      ⸻

      总结原则

      内容提炼

      1. 不要逐句复述字幕。
      2. 优先提炼核心观点、关键结论和底层逻辑。
      3. 删除寒暄、口头禅、广告、闲聊、重复表达。
      4. 保留重要事实、案例、数据、方法论和推理过程。
      5. 对明显的口语化表达、转录错误和语病,可结合上下文修正。
      6. 总结应让未观看视频的人也能快速获得核心信息。

      信息组织

      1. 按「观点」组织内容,而不是按字幕顺序复述。
      2. 数据、案例、实验、引用等内容,应放到对应观点下解释。
      3. 不要为了完整而堆砌细节。
      4. 优先保留结论与理由,其次才是过程。

      ⸻

      输出格式

      使用 Markdown 输出。

      开头不要寒暄,不要解释自己在做什么,直接开始总结。

      ---

      # 视频主题

      用 1~2 句话概括视频真正讨论的内容。

      ---

      # {{video_title}}

      直接回答标题。

      如果标题是问题:

      列出视频最终给出的答案。

      如果标题是主题:

      列出视频围绕该主题最重要的核心结论。

      格式:

      1. ...
      2. ...
      3. ...

      要求:

      * 每条只写结论
      * 简洁直接
      * 不展开解释
      * 用户读完这一部分就能获得视频最核心的信息

      ⸻

      # 详细展开

      按照第一部分的编号顺序,对每个结论逐条展开。

      ## 1. 结论一

      核心解释

      说明作者为什么得出这个结论。

      支撑依据

      整理视频中的:

      * 数据
      * 案例
      * 实验
      * 事实
      * 推理过程

      只保留真正支撑结论的信息。

      ### 补充细节(可选)

      如有必要,补充关键背景。

      ⸻

      ## 2. 结论二

      同上。

      ⸻

      (依次展开)

      ⸻

      # 其他重要内容(可选)

      如果视频中还有重要信息无法归入上述结论,可单独补充。

      ⸻

      # 可执行建议(可选)

      仅当视频明确提供行动方案、操作步骤、方法论时输出。

      格式:

      1. ...
      2. ...
      3. ...

      如果视频没有明确建议,则省略本节。

      ⸻

      # 一句话总结

      使用不超过 50 字总结整个视频最重要的信息。

      ⸻

      输出要求

      * 使用 Markdown
      * 层级清晰
      * 信息密度高
      * 直接给结论
      * 避免套话和废话
      * 重点内容使用 加粗
      * 输出语言与字幕语言保持一致
      * 字幕信息不足时明确说明,不得编造`,
      el: "set-prompt",
    },
  };

  // 按服务商存储的配置项使用带后缀的 key,使三家各自保存 apiKey/endpoint/模型
  function providerKey(baseKey, provider) {
    return `${baseKey}_${provider}`;
  }

  // 根据服务商组装思考模式参数,平铺写入 payload 顶层。
  // 注意:这里是用 GM_xmlhttpRequest 手动拼 HTTP body 直接发送,
  // 不存在 OpenAI SDK 的 extra_body 展平机制,因此这些非标准参数
  // 必须直接放在请求体顶层(等价于 SDK 把 extra_body 展平后的结果)。
  // 兼容不同服务商:阿里云/硅基流动用 enable_thinking + thinking_budget,
  // DeepSeek 用 thinking.type + reasoning_effort;自定义服务商合并用户填写的 extra_body JSON。
  function applyThinkingParams(payload, cfg) {
    const enabled = !!cfg.thinking;
    if (cfg.provider === "aliyun" || cfg.provider === "siliconflow") {
      // 必须显式发送 true/false:部分 Qwen/Qwen3 类模型默认会思考,
      // 若关闭时不发送 false,UI 开关会表现为“关不掉”。
      payload.enable_thinking = enabled;
      if (enabled) payload.thinking_budget = 256;
    } else if (cfg.provider === "deepseek") {
      // DeepSeek 兼容端点同样显式发送 enabled/disabled,确保开关双向生效。
      payload.thinking = { type: enabled ? "enabled" : "disabled" };
      if (enabled) payload.reasoning_effort = "high";
    } else if (cfg.extraBody && cfg.extraBody.trim()) {
      // 自定义服务商:合并用户填写的 extra_body JSON 到顶层,解析失败时忽略
      try {
        const extra = JSON.parse(cfg.extraBody);
        if (extra && typeof extra === "object" && !Array.isArray(extra)) {
          Object.assign(payload, extra);
        }
      } catch (e) {
        // JSON 解析失败时忽略(不中断请求),由用户自行检查格式
      }
    }
  }

  // 各服务商的默认模型(首次未配置时使用)
  const PROVIDER_DEFAULTS = {
    aliyun: { model1: "qwen-plus", model2: "qwen-turbo" },
    deepseek: { model1: "deepseek-chat", model2: "deepseek-reasoner" },
    siliconflow: { model1: "Qwen/Qwen3.5-9B", model2: "inclusionAI/Ling-flash-2.0" },
    custom: { model1: "", model2: "" },
  };

  // 读取某服务商的 endpoint:aliyun/deepseek 为固定值,custom 读取保存值
  function loadEndpoint(provider) {
    if (provider === "aliyun") return ENDPOINTS.aliyun;
    if (provider === "deepseek") return ENDPOINTS.deepseek;
    if (provider === "siliconflow") return ENDPOINTS.siliconflow;
    return GM_getValue(providerKey("ai_endpoint", provider), "");
  }

  // 读取某服务商的按服务商配置项(apiKey/model1/model2)
  function loadProviderValue(baseKey, provider, fallbackDef) {
    const def =
      (PROVIDER_DEFAULTS[provider] &&
        PROVIDER_DEFAULTS[provider][
          baseKey === "ai_model1"
            ? "model1"
            : baseKey === "ai_model2"
              ? "model2"
              : ""
        ]) ??
      fallbackDef;
    return GM_getValue(providerKey(baseKey, provider), def);
  }

  // 加载指定服务商的全部按服务商配置到 aiConfig
  function loadProviderConfig(provider) {
    for (const k in CONFIG_DICT) {
      const cfg = CONFIG_DICT[k];
      if (!cfg.perProvider) continue;
      if (k === "endpoint") {
        aiConfig.endpoint = loadEndpoint(provider);
      } else {
        aiConfig[k] = loadProviderValue(cfg.key, provider, cfg.def);
      }
    }
  }

  let aiConfig = {};
  for (let k in CONFIG_DICT) {
    if (CONFIG_DICT[k].perProvider) continue; // 按服务商的项随后加载
    aiConfig[k] = GM_getValue(CONFIG_DICT[k].key, CONFIG_DICT[k].def);
  }

  // 一次性迁移:旧版本 apiKey/endpoint 为全局单一存储,迁移到当前服务商的后缀 key
  (function migrateLegacyConfig() {
    if (GM_getValue("ai_config_migrated", false)) return;
    const prov = aiConfig.provider;
    const legacyKey = GM_getValue("ai_api_key", "");
    if (legacyKey && !GM_getValue(providerKey("ai_api_key", prov), "")) {
      GM_setValue(providerKey("ai_api_key", prov), legacyKey);
    }
    const legacyEp = GM_getValue("ai_endpoint", "");
    if (
      prov === "custom" &&
      legacyEp &&
      !GM_getValue(providerKey("ai_endpoint", "custom"), "")
    ) {
      GM_setValue(providerKey("ai_endpoint", "custom"), legacyEp);
    }
    for (const mk of ["ai_model1", "ai_model2"]) {
      const legacyModel = GM_getValue(mk, "");
      if (legacyModel && !GM_getValue(providerKey(mk, prov), "")) {
        GM_setValue(providerKey(mk, prov), legacyModel);
      }
    }
    GM_setValue("ai_config_migrated", true);
  })();

  loadProviderConfig(aiConfig.provider); // 按当前服务商加载 apiKey/endpoint/模型

  // 状态数据
  let currentSubtitle = "";
  let currentVideoTitle = ""; // 本次总结时抓取的视频标题
  let chatHistory = [];
  let sessionTokens = { input: 0, output: 0 }; // 本次会话累计 token 用量
  let isRequesting = false;
  let currentRequest = null; // 正在进行的 GM_xmlhttpRequest 句柄,用于可中断
  let requestSeq = 0; // 请求序号,用于丢弃被中断的旧请求回调
  let activeAssistantBubble = null; // 当前正在流式写入的 assistant 气泡,用于终止时标注
  let reattachSubtitleObserver = null; // SPA 切视频后重新绑定字幕按钮 observer(由 createGlobalObserver 赋值)

