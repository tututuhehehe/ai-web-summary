"use strict";

// 加载并执行合并后的用户脚本，暴露其 IIFE 内部的纯逻辑函数，供 node:test 使用。
// 不引入任何 npm 依赖：用 Node 内置的 vm 在受控环境中运行脚本，
// 并通过注入到 IIFE 末尾的导出块把需要测试的函数挂到 globalThis.__biliTest。

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "bilibili-subtitle-and-ai-summary.user.js");

function loadScriptApi() {
  // 先重新合并，确保测试对象与当前源码一致。
  execFileSync(process.execPath, [path.join(ROOT, "build.js")], {
    cwd: ROOT,
    stdio: "ignore",
  });

  let source = fs.readFileSync(OUT_FILE, "utf8");
  source = source.replace(/\}\)\(\);\s*$/, "");
  source += `
  globalThis.__biliTest = {
    providerKey,
    applyThinkingParams,
    normalizeSubtitleUrl,
    getSubtitleBody,
    formatSubtitleTime,
    subtitleBodyToText,
    rankSubtitleUrl,
    escapeHtml,
    escapeAttr,
    prepareTranscriptForPrompt,
    buildRequestMessages,
    lastModelKey,
  };
})();`;

  const store = new Map();
  const scriptEl = () => ({ textContent: "", remove() {} });
  const parentEl = { appendChild() {} };

  const context = {
    console,
    performance: { now: () => 0 },
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    GM_getValue: (key, def) => (store.has(key) ? store.get(key) : def),
    GM_setValue: (key, val) => {
      store.set(key, val);
    },
    GM_setClipboard: () => {},
    GM_xmlhttpRequest: () => {},
    GM_info: undefined,
    location: { href: "https://www.bilibili.com/video/BV1" },
    window: {
      addEventListener() {},
      dispatchEvent() {},
      innerHeight: 900,
      _biliSubtitleUrls: [],
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      createElement: () => scriptEl(),
      head: parentEl,
      documentElement: parentEl,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: OUT_FILE });
  return context.__biliTest;
}

module.exports = { loadScriptApi };
