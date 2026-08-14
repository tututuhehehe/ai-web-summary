# AI Agent 工作区上下文指南

## 项目概述

轻量级油猴（Tampermonkey）用户脚本集合。B 站脚本在视频/番剧页注入 AI 侧栏，提取 CC 字幕并调用 OpenAI 兼容接口做总结与追问；项目预留其他网页脚本扩展。

## 工作区结构

- `bili_src/`：B 站脚本源码模块，**日常修改入口**
- `bilibili-subtitle-and-ai-summary.user.js`：合并产物，勿直接手改
- `build.js`：零 npm 依赖合并脚本，`node build.js`
- `tests/`：Node 内置测试，`node --test tests/pure-functions.test.js`
- `wx-article-ai-summary.user.js`：微信脚本，暂未模块化
- `README*.md`：文档

## 拼装原则

- 源码在 `bili_src/*.js`，按文件名前缀（`00-`、`01-`…）排序后无分隔符拼接，生成根目录同名 `.user.js`。
- 每个片段必须以换行结尾；新增模块沿用数字前缀。
- 新增其他网页脚本时，在 `build.js` 的 `TARGETS` 加 `{ srcDir, outFile }`。
- 最终产物保持单文件自包含，运行时仍是 IIFE 闭包。

## 技术约束

- 原生 ES6+，不用 TypeScript、框架或 npm 依赖。
- 第三方库仅通过 `@require` 引入（marked、DOMPurify）。
- 外部 AI API 必须用 `GM_xmlhttpRequest`，禁止原生 `fetch`。
- 持久化用 `GM_setValue`/`GM_getValue`，禁用 `localStorage`。
- 新增权限需在 `// ==UserScript==` 中声明 `@grant`。
- B 站是 SPA，DOM 会异步渲染/替换，注意清理 observer 和定时器。

## AI 集成规范

- 兼容 OpenAI 端点，手动解析 SSE 流。
- 思考模式按服务商组装 payload：阿里云/硅基流动用 `enable_thinking`，DeepSeek 用 `thinking.type`。
- `reasoning_content` 与 `content` 分开渲染；思考框默认折叠，思考中标题每秒跳动“💭 思考中… (Ns)”，结束后“💭 思考过程 (耗时 Ns)”并及时 clearInterval。
- 流式回复中发送按钮变「终止」⏹，`abort()` 后保留已生成内容并追加「已终止」。
- payload 带 `stream_options: { include_usage: true }`；在 `if (!delta) continue` 前捕获 `data.usage`。

## 修改流程

1. 修改前完整阅读相关源码模块和最终合并产物。
2. 只改 `bili_src/` 模块，改完运行 `node build.js` 合并。
3. 纯逻辑变更运行 `node --test tests/pure-functions.test.js`；DOM、网络拦截、AI 流式部分在浏览器手测。
4. 新 UI 沿用既有深色 + 毛玻璃风格；提供完整函数/代码块，不丢零散片段。
