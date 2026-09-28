"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScriptApi } = require("./load-script");

const api = loadScriptApi();

test("providerKey 按服务商拼出带后缀的 key", () => {
  assert.equal(api.providerKey("ai_api_key", "deepseek"), "ai_api_key_deepseek");
  assert.equal(api.providerKey("ai_model1", "aliyun"), "ai_model1_aliyun");
});

test("applyThinkingParams: 阿里云/硅基流动", () => {
  const payload = {};
  api.applyThinkingParams(payload, {
    provider: "aliyun",
    thinking: true,
    extraBody: "",
  });
  assert.equal(payload.enable_thinking, true);
  assert.equal(payload.thinking_budget, 256);

  const off = {};
  api.applyThinkingParams(off, {
    provider: "siliconflow",
    thinking: false,
    extraBody: "",
  });
  assert.equal(off.enable_thinking, false);
  assert.equal(Object.hasOwn(off, "thinking"), false);
});

test("applyThinkingParams: DeepSeek", () => {
  const payload = {};
  api.applyThinkingParams(payload, {
    provider: "deepseek",
    thinking: true,
    extraBody: "",
  });
  assert.equal(payload.thinking.type, "enabled");
  assert.equal(payload.reasoning_effort, "high");

  const off = {};
  api.applyThinkingParams(off, {
    provider: "deepseek",
    thinking: false,
    extraBody: "",
  });
  assert.equal(off.thinking.type, "disabled");
  assert.equal(Object.hasOwn(off, "reasoning_effort"), false);
});

test("applyThinkingParams: 自定义服务商合并 extra_body", () => {
  const payload = { model: "test-model" };
  api.applyThinkingParams(payload, {
    provider: "custom",
    thinking: false,
    extraBody: '{"enable_thinking":true,"top_p":0.9}',
  });
  assert.equal(payload.model, "test-model"); // 既有字段不被覆盖
  assert.equal(payload.enable_thinking, true);
  assert.equal(payload.top_p, 0.9);
});

test("applyThinkingParams: 非法 extra_body 忽略而不抛错", () => {
  const payload = {};
  assert.doesNotThrow(() =>
    api.applyThinkingParams(payload, {
      provider: "custom",
      thinking: false,
      extraBody: "not-json",
    }),
  );
  assert.equal(Object.hasOwn(payload, "enable_thinking"), false);
});

test("normalizeSubtitleUrl 补全协议并反转义斜杠", () => {
  assert.equal(
    api.normalizeSubtitleUrl("//example.com/subtitle/a.json"),
    "https://example.com/subtitle/a.json",
  );
  assert.equal(
    api.normalizeSubtitleUrl("https:\\/\\/example.com\\/subtitle\\/a.json"),
    "https://example.com/subtitle/a.json",
  );
});

test("getSubtitleBody 兼容 body 与 data.body", () => {
  const body = [{ content: "a" }];
  assert.deepEqual(api.getSubtitleBody({ body }), body);
  assert.deepEqual(api.getSubtitleBody({ data: { body } }), body);
  assert.throws(() => api.getSubtitleBody({}));
});

test("formatSubtitleTime 格式化时间戳", () => {
  assert.equal(api.formatSubtitleTime(0), "00:00");
  assert.equal(api.formatSubtitleTime(65), "01:05");
  assert.equal(api.formatSubtitleTime(3665), "01:01:05");
  assert.equal(api.formatSubtitleTime("x"), "");
});

test("subtitleBodyToText 按需输出时间戳并跳过空行", () => {
  const body = [
    { content: "第一句", from: 0 },
    { content: "", from: 1 },
    { content: "第二句", from: 65 },
  ];
  assert.equal(
    api.subtitleBodyToText(body, { withTimestamps: true }),
    "[00:00] 第一句\n[01:05] 第二句",
  );
  assert.equal(api.subtitleBodyToText(body), "第一句\n第二句");
});

test("rankSubtitleUrl 优先中文字幕与正文", () => {
  const chineseJson = api.rankSubtitleUrl(
    "https://example.com/subtitle/zh-hans/1.json?lan=zh",
  );
  const noise = api.rankSubtitleUrl("https://example.com/subtitle/report/list");
  assert.ok(chineseJson > noise);
});

test("escapeHtml / escapeAttr 转义", () => {
  const raw = `<img src=x onerror="1">&'`;
  assert.equal(
    api.escapeHtml(raw),
    "&lt;img src=x onerror=&quot;1&quot;&gt;&amp;&#39;",
  );
  assert.equal(api.escapeAttr(raw), api.escapeHtml(raw));
});

test("prepareTranscriptForPrompt 长文本裁剪并提示省略量", () => {
  const short = "短字幕";
  const shortResult = api.prepareTranscriptForPrompt(short);
  assert.equal(shortResult.text, short);
  assert.equal(shortResult.note, "");

  const long = "字".repeat(70000);
  const longResult = api.prepareTranscriptForPrompt(long);
  assert.ok(longResult.text.length < 70000);
  assert.match(longResult.note, /已保留开头和结尾并省略中间约/);
});

test("buildRequestMessages 裁剪过长上下文并保留系统消息", () => {
  const short = [
    { role: "system", content: "sys" },
    { role: "user", content: "u" },
  ];
  assert.deepEqual(api.buildRequestMessages(short), short);

  const long = [
    { role: "system", content: "sys" },
    ...Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: String(i),
    })),
  ];
  const result = api.buildRequestMessages(long);
  assert.equal(result[0].role, "system");
  assert.ok(result.length < long.length);
});

test("lastModelKey 生成按服务商存储的模型 key", () => {
  assert.equal(api.lastModelKey("aliyun"), "ai_last_model_aliyun");
});
