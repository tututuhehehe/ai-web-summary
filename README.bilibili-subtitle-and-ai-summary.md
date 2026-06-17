# B 站字幕获取与 AI 助手

> 面向 B 站视频和番剧页面的字幕提取、AI 总结与连续问答用户脚本。捕获当前视频的 CC 字幕作为上下文，通过兼容 OpenAI 接口的大语言模型生成结构化视频总结。

[![GreasyFork](https://img.shields.io/badge/GreasyFork-安装脚本-blue.svg)](https://greasyfork.org/zh-CN/scripts/575450)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 👉 一键安装

**[点击这里前往 GreasyFork 安装脚本](https://greasyfork.org/zh-CN/scripts/575450)**

> 需先安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 用户脚本管理器，再点击上方链接安装。

## 🎬 演示

https://github.com/user-attachments/assets/e8bb1bde-c194-42d7-b278-549e11e56229

## 脚本信息

- 文件：`bilibili-subtitle-and-ai-summary.user.js`
- 适用页面：`*://*.bilibili.com/video/*`、`*://*.bilibili.com/bangumi/play/*`
- 依赖：通过 `@require` 引入 `marked.js`
- 许可证：MIT

## 功能亮点

- 自动捕获 B 站字幕接口，并在字幕菜单中增加 `[复制]` 按钮。
- 右侧 `AI总结` 沉浸式侧边栏，可收起、可上下拖拽且位置持久化。
- 基于字幕生成结构化 Markdown 总结，并支持围绕视频继续追问。
- 生成中可随时「终止」，也可对最后一条回答「重新生成」。
- 顶部显示本次请求与本次会话累计的输入/输出 token 用量（需接口返回 usage）。
- 支持阿里云百炼、DeepSeek 官方、硅基流动、自定义 OpenAI 兼容接口，**各家各自独立保存 API Key / Endpoint / 模型**。
- 支持 Reasoning/Thinking 模式，折叠展示思考过程并显示思考耗时。
- 设置无需保存按钮：再次点击 ⚙️ 或点击面板内非设置区域即自动保存关闭。
- 快捷键：`s` 唤起 / 收起 AI 总结面板，`Esc` 打断当前正在生成的回复（输入状态下不触发）。
- UI 跟随系统明暗模式（`prefers-color-scheme`）。

## 安装与使用

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 从 [GreasyFork](https://greasyfork.org/zh-CN/scripts/575450) 安装脚本。
3. 打开带 CC 字幕的视频/番剧页，点击右侧 `AI总结`。
4. 首次使用点右上角 ⚙️ 配置服务商、API Key、主/备模型、思考模式、自定义 Prompt。
5. 关闭设置后脚本会自动加载字幕并生成总结，之后可在底部继续追问。

## 配置说明

### 服务商

内置四种，**API Key / Endpoint / 主备模型各自独立保存**，切换服务商会自动载入各自上次的配置：

- `硅基流动`（推荐，[新用户注册送 50 元代金券](https://cloud.siliconflow.cn/i/r2sHNZ7z)）：固定 Endpoint `https://api.siliconflow.cn/v1/chat/completions`
- `DeepSeek官方`：固定 Endpoint `https://api.deepseek.com/chat/completions`
- `阿里云百炼`：固定 Endpoint `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- `自定义`：手动填写完整的 OpenAI 兼容 Chat Completions 地址，例如 `https://api.openai.com/v1/chat/completions`（脚本不会自动补 `/v1/chat/completions`）

### 模型

每家各有主模型、备用模型两个输入框，保存后可在面板顶部下拉切换。可用模型取决于你的服务商账号权限。

### 思考模式

阿里云、DeepSeek、硅基流动提供「开启思考模式」勾选，开启后按服务商附加 payload：阿里云 `enable_thinking: true`，DeepSeek `thinking: { type: "enabled" }`，硅基流动 `enable_thinking: true`。

**自定义服务商**没有这个勾选，改为提供一个 `extra_body`（JSON）输入框：你填写的 JSON 会被合并进请求参数，需要思考就自行填入对应字段，例如：

```json
{"enable_thinking": true}
```

或

```json
{"reasoning_effort": "high"}
```

是否显示「思考耗时」取决于接口是否返回 `reasoning_content`，与各家一致，无需额外配置。

### 自定义 Prompt

内置一套结构化总结 Prompt（视频主题 / 核心观点 / 分章节详解 / 关键案例与数据 / 可执行建议 / 一句话总结），输出语言与字幕一致。可按自己习惯修改。

## 工作原理

1. 拦截页面 `XMLHttpRequest` / `fetch`，记录字幕接口地址。
2. 从页面脚本与运行时请求中提取 `subtitle` / `ai_subtitle` 字幕 JSON URL。
3. 点击 `AI总结` 后用 `GM_xmlhttpRequest` 获取字幕并向 AI API 发起流式请求。
4. 手动解析 SSE，将正文渲染为 Markdown，`reasoning_content` 放入可折叠的思考区域。

## 常见问题

- **提示未找到字幕**：确认视频有可访问的 CC 字幕，部分视频需先在播放器手动点开一次字幕菜单。
- **请求失败**：检查 API Key、Endpoint（须为 Chat Completions 兼容接口）、模型名、服务商是否支持流式，以及脚本管理器是否允许 `GM_xmlhttpRequest` 与跨域连接。

## 隐私说明

- API Key、Endpoint、模型、Prompt、侧栏位置等仅通过用户脚本管理器本地存储。
- 字幕内容只发送到你配置的 AI API Endpoint，脚本无后端服务。

## 许可证

[MIT License](LICENSE)
