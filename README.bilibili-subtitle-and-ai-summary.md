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

- 自动捕获字幕接口，字幕菜单增加 `[复制]` 按钮。
- 右侧沉浸式 AI 侧边栏，可收起、可拖拽、位置持久化。
- 基于字幕生成 Markdown 总结，支持连续追问。
- 支持阿里云百炼、DeepSeek 官方、[硅基流动](https://cloud.siliconflow.cn/i/r2sHNZ7z)、自定义 OpenAI 兼容接口，各家独立保存配置。
- 支持思考模式，折叠展示思考过程及耗时。
- 快捷键：`s` 唤起/收起面板，`Esc` 打断生成。
- UI 跟随系统明暗模式。

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

内置服务商提供「开启思考模式」勾选；自定义服务商通过 `extra_body` JSON 输入框自行附加参数（如 `{"enable_thinking": true}`）。

### 自定义 Prompt

内置一套结构化总结 Prompt（视频主题 / 核心观点 / 分章节详解 / 关键案例与数据 / 可执行建议 / 一句话总结），输出语言与字幕一致。可按自己习惯修改。

## 常见问题

- **提示未找到字幕**：确认视频有可访问的 CC 字幕，部分视频需先在播放器手动点开一次字幕菜单。
- **请求失败**：检查 API Key、Endpoint（须为 Chat Completions 兼容接口）、模型名、服务商是否支持流式，以及脚本管理器是否允许 `GM_xmlhttpRequest` 与跨域连接。

## 隐私说明

- API Key、Endpoint、模型、Prompt、侧栏位置等仅通过用户脚本管理器本地存储。
- 字幕内容只发送到你配置的 AI API Endpoint，脚本无后端服务。

## 许可证

[MIT License](LICENSE)
