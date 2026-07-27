# 微信公众号文章 AI 助手

> 面向微信公众号文章页的沉浸式 AI 总结与问答用户脚本。打开文章后，一键提取标题、作者和正文内容，并通过兼容 OpenAI 接口的大语言模型生成结构化总结与沉浸式对话。

## 脚本信息

- 文件名：`wx-article-ai-summary.user.js`
- 脚本名：微信公众号文章 AI 助手 (沉浸式总结/对话)
- 适用页面：`*://mp.weixin.qq.com/s/*`
- 当前版本：`1.2.0`
- 依赖：通过 `@require` 引入 `marked.js` 与 `DOMPurify`
- 许可证：MIT

## 功能亮点

- **文章内容自动提炼**：自动读取微信公众号文章正文区域 `#js_content`，同时提取文章标题 `#activity-name` 和公众号作者 `#js_name`。
- **现代化 Glassmorphic UI 风格**：全深色毛玻璃自适应视觉设计，与 B 站助手 UI 完全统一。
- **常驻侧边栏与自由拖拽**：右侧常驻 `AI总结` 悬浮按钮支持上下拖拽并自动记忆位置 (`wx_minTabTop`)。
- **流式对话与一键终止 (⏹)**：支持 SSE 流式实时响应，生成过程中发送按钮变为可中断终止按钮（⏹），保留已生成内容。
- **深度思考 (Reasoning) 计时器**：规范折叠框（`<details>`）默认收起，支持秒级跳动计时（如 `🧠 思考中... (12s)`），完成思考后展示耗时。
- **多服务商按需隔离配置**：支持阿里云百炼、DeepSeek 官方和自定义端点，API Key、Endpoint、模型列表及思考模式独立隔离保存。
- **预设 Prompt 模板与 Extra Body**：内置全面总结、核心金句、Q&A 解答模板，支持用户自定义扩展 Extra Body JSON 参数。
- **Token 用量精准统计**：解析流式数据中的 `usage` 字段，实时展示本次请求与当前会话累计的 Token 输入/输出消耗。
- **快捷操作与 Markdown 安全渲染**：集成「复制总结（📋）」、「清空对话（🗑️）」与气泡底部的「重新生成（🔄）」，并且通过 `DOMPurify` 严格过滤 XSS 安全隐患。

## 安装方式

1. 安装用户脚本管理器：
   - [Tampermonkey](https://www.tampermonkey.net/)
   - [Violentmonkey](https://violentmonkey.github.io/)

2. 在脚本管理器中新建脚本。

3. 将 `wx-article-ai-summary.user.js` 的完整内容粘贴进去并保存。

4. 打开任意微信公众号文章页面。

5. 页面右侧出现 `AI总结` 悬浮按钮后即可使用。

## 快速使用

1. 打开一篇微信公众号文章，地址形如：
   `https://mp.weixin.qq.com/s/...`

2. 点击页面右侧的 `AI总结` 悬浮按钮。

3. 首次使用时，点击右上角⚙️设置按钮：
   - 选择服务商（阿里云百炼 / DeepSeek官方 / 自定义）
   - 填写 API Key（支持👁️密码可见性切换）
   - 选择或输入主模型 / 备用模型
   - 选择预设 Prompt 模板或自定义 Prompt
   - 可选勾选开启思考模式或配置 Extra Body JSON

4. 保存配置后，点击底部 `总结` 按钮开始解析总结。

5. 总结完成后，可在底部输入框继续针对文章进行沉浸式追问。

## 配置说明

### 服务商

支持以下服务商并对配置项进行独立隔离保存：

- `阿里云百炼`：默认 Endpoint 为 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- `DeepSeek官方`：默认 Endpoint 为 `https://api.deepseek.com/chat/completions`
- `自定义`：手动填写 OpenAI 兼容的 Chat Completions Endpoint

### 思考模式 (Reasoning)

开启后，脚本会根据服务商自动适配 payload：

- 阿里云百炼：`enable_thinking: true`
- DeepSeek：`thinking: { type: "enabled" }`

思考过程在面板中默认闭合折叠，思考过程中实时显示已消耗秒数。

## 隐私说明

- 所有 API Key、Endpoint、模型和 Prompt 仅存放在油猴本地存储（`GM_setValue`）中。
- 提取的文章数据仅发送给用户自行配置的 AI API 服务商，无第三方服务器传输。

## 许可证

本脚本随项目采用 [MIT License](LICENSE)。
