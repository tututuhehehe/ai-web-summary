# AI Agent 工作区上下文指南

## 1. 项目概述
本项目是一个轻量级的油猴（Tampermonkey/Greasemonkey）用户脚本，名为“B站字幕获取与AI助手”。
它在 B 站视频/番剧页面中注入自定义 UI，用于提取闭路字幕（CC 字幕），并利用兼容 OpenAI 接口的大语言模型（LLMs）提供视频内容总结和沉浸式对话交互。

## 2. 工作区结构
这是一个无构建工具（Zero-build-tool）的工作区，仅包含两个文件：
- `bilibili-subtitle-and-ai-summary.user.js`: 核心应用程序。它包含完整的用户脚本，包括元数据块（Metadata）、注入的 CSS、DOM 操作逻辑和 AI 流式请求逻辑。
- `README.md`: 项目的说明文档。

## 3. 技术栈与限制
- **语言**：原生 JavaScript (ES6+)。不使用 TypeScript。
- **框架**：无。不使用 React、Vue 或 jQuery。仅使用纯原生 DOM API 进行操作。
- **第三方库**：仅通过用户脚本元数据中的 `@require` 标签全局引入。B 站脚本引入了 `marked.js`（Markdown 解析）与 `DOMPurify`（渲染前 XSS 清洗，AI 输出的 Markdown 经 `marked.parse` 后必须先 `DOMPurify.sanitize` 再写入 innerHTML）；微信公众号脚本目前仅引入 `marked.js`。**绝对不要**尝试引入 npm 依赖或构建工具。
- **运行环境**：在用户脚本管理器（Tampermonkey/Violentmonkey）下运行的浏览器环境。

## 4. 严格的开发规范

### 4.1. 用户脚本元数据 (Metadata)
- 绝不要删除或随意修改 `.user.js` 文件顶部的 `// ==UserScript==` 元数据声明块。
- 任何需要的新权限（例如跨域请求、存储）都必须使用 `@grant` 明确声明。

### 4.2. 单文件架构
- 所有逻辑（CSS 注入、UI 创建、状态管理、网络请求）必须保持自包含在 `bilibili-subtitle-and-ai-summary.user.js` 文件的 IIFE `(function() { ... })();` 闭包主体中。请勿建议将代码拆分为多个模块或文件。

### 4.3. DOM 操作与 B站 SPA 架构
- B站是一个单页面应用（SPA）。DOM 元素可能会异步渲染，或者在不完全刷新页面的情况下发生路由导航和内容替换。
- 在等待原生 B 站 UI 元素（如字幕菜单）渲染出现时，请谨慎使用 `MutationObserver` 或轮询（`setInterval`），并注意及时清理定时器。

### 4.4. 网络请求 (CORS)
- **严重警告**：绝对不要使用原生的 `fetch` API 来调用外部 AI API（如阿里云或 DeepSeek）。由于 `*.bilibili.com` 的严格跨域（CORS）限制，原生 `fetch` 会被浏览器拦截。
- 务必使用 `GM_xmlhttpRequest` 进行外部 API 调用。确保正确处理 `responseType: 'stream'` 以逐块解析 AI 的 Server-Sent Events (SSE) 流式响应。

### 4.5. 状态管理
- 必须使用 `GM_setValue` 和 `GM_getValue` 进行持久化配置（API Key、模型选择、自定义 Prompt 等）。不要使用浏览器的 `localStorage`。

### 4.6. AI API 集成
- 脚本主要与兼容 OpenAI 格式的端点进行交互。
- 需要手动解析 `GM_xmlhttpRequest` 触发的流数据，并处理 SSE 格式。
- 脚本支持多服务商配置（阿里云 DashScope、DeepSeek 官方、自定义）。
- **特异性处理**：需要特别注意“思考/推理”模式（Reasoning）在不同厂商间 payload 的差异（例如阿里云的 `enable_thinking: true` vs DeepSeek 的 `thinking: { type: "enabled" }`），并在 UI 更新中将 `reasoning_content`（思考过程）与标准 `content`（正文）分开处理和渲染。
- **思考框 UI 规范**：渲染 `reasoning_content` 的折叠框（`<details>`）必须**默认折叠**，不要默认展开。思考进行中（正文 `content` 尚未出现）时，折叠标题应显示**已思考秒数**并一秒一秒跳动（如“💭 思考中… (Ns)”，需用 setInterval 计时而非依赖 chunk 到达），让用户明确知道 AI 在思考而非卡死；思考结束后标题恢复为“💭 思考过程 (耗时 Ns)”，并需及时 clearInterval。
- **生成终止 UI 规范**：大模型流式回复过程中，发送按钮应变为可点击的「终止」按钮（⏹），点击后调用 `abort()` 中断请求，保留已生成内容并追加「已终止」标记。
- **Token 用量显示**：payload 需附加 `stream_options: { include_usage: true }`，以便接口在流末（通常是 delta 为空、仅含 `usage` 的 chunk）返回 `prompt_tokens`（输入）/`completion_tokens`（输出）。解析时需在 `if (!delta) continue` 之前捕获 `data.usage`。顶部 token 条优先展示接口返回的真实用量，接口未返回时隐藏。

## 5. Agent 执行指令
当被要求修改代码或修复 bug 时，请务必遵守以下步骤：
1. 在做出修改前，优先完整阅读 `bilibili-subtitle-and-ai-summary.user.js` 文件。
2. 确保任何新增加的 UI 元素都继承脚本中已确立的深色模式及毛玻璃（Glassmorphism）CSS 视觉风格。
3. 提供修改时，请给出**完整的函数或代码块**，而不要只提供零散的代码片段，因为零散片段很难在庞大的单文件架构中准确定位和粘贴。