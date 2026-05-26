# B 站字幕获取与 AI 助手

> 面向 B 站视频和番剧页面的字幕提取、AI 总结与连续问答用户脚本。它会捕获当前视频的 CC 字幕，将字幕整理为上下文，并通过兼容 OpenAI 接口的大语言模型生成结构化视频总结。

[![GreasyFork](https://img.shields.io/badge/GreasyFork-安装脚本-blue.svg)](https://greasyfork.org/zh-CN/scripts/575450-b站字幕获取与ai助手-沉浸式翻译-总结)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 脚本信息

- 文件名：`bilibili-subtitle-and-ai-summary.user.js`
- 脚本名：B站字幕获取与AI助手 (沉浸式翻译/总结)
- 适用页面：`*://*.bilibili.com/video/*`、`*://*.bilibili.com/bangumi/play/*`
- 依赖：通过 `@require` 引入 `marked.js`
- 许可证：MIT

## 功能亮点

- 自动捕获 B 站字幕接口地址。
- 在 B 站字幕菜单中增加 `[复制]` 按钮，一键复制字幕纯文本。
- 页面右侧提供可收起的 `AI总结` 沉浸式侧边栏。
- 基于当前视频字幕生成 Markdown 格式视频总结。
- 总结完成后可继续围绕视频内容追问。
- 支持阿里云百炼、DeepSeek 官方和自定义 OpenAI 兼容接口。
- 支持主模型、备用模型切换。
- 支持自定义总结 Prompt。
- 支持 Reasoning/Thinking 模式，并折叠展示思考过程。
- 对 B 站 SPA 页面跳转做了处理，进入新视频页时会刷新以重置脚本状态。

## 安装方式

1. 安装用户脚本管理器：
   - [Tampermonkey](https://www.tampermonkey.net/)
   - [Violentmonkey](https://violentmonkey.github.io/)

2. 从 GreasyFork 安装脚本：
   [B站字幕获取与AI助手](https://greasyfork.org/zh-CN/scripts/575450-b站字幕获取与ai助手-沉浸式翻译-总结)

3. 打开任意带有 CC 字幕的 B 站视频或番剧页面。

4. 页面右侧出现 `AI总结` 后即可使用。

## 快速使用

1. 打开带有 CC 字幕的视频或番剧页面。

2. 点击右侧 `AI总结`。

3. 首次使用时，点击右上角设置按钮，配置：
   - 服务商
   - API Key
   - 主模型 / 备用模型
   - 是否开启思考模式
   - 自定义总结 Prompt

4. 保存配置后，脚本会尝试自动加载字幕资源并生成总结。

5. 总结完成后，可以在底部输入框继续提问，例如：
   - “这个视频主要讲了什么？”
   - “帮我列出时间线和关键观点。”
   - “这段内容里有哪些可执行建议？”
   - “把视频总结成适合发朋友圈的短文。”

## 字幕复制

脚本会在播放器字幕语言菜单中为字幕项追加 `[复制]` 按钮。点击后会尝试读取当前字幕接口数据，并将字幕纯文本复制到剪贴板。

如果没有立即出现复制按钮，可以先打开一次播放器字幕菜单，等待脚本检测到字幕菜单节点。

## 配置说明

### 服务商

内置三种选择：

- `阿里云百炼`：默认 Endpoint 为 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- `DeepSeek官方`：默认 Endpoint 为 `https://api.deepseek.com/chat/completions`
- `自定义`：手动填写 OpenAI 兼容的 Chat Completions Endpoint

### 模型

脚本提供主模型和备用模型两个输入框。保存后，可以在面板顶部下拉框中快速切换。

示例：

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `deepseek-chat`
- `deepseek-reasoner`
- `qwen-plus`
- `qwen-max`

具体可用模型取决于你的服务商账号和接口权限。

### 思考模式

开启后，脚本会根据服务商附加不同 payload：

- 阿里云百炼：`enable_thinking: true`
- DeepSeek：`thinking: { type: "enabled" }`

如果使用自定义 Endpoint，脚本会根据地址中是否包含 `dashscope` 或 `deepseek.com` 尝试自动适配。

### 自定义 Prompt

默认 Prompt 会要求 AI 根据视频字幕提取核心观点，并用结构化 Markdown 详细总结。你可以改成更符合自己观看习惯的指令，例如：

```text
请按以下结构总结视频：
1. 一句话结论
2. 主要内容
3. 关键时间线
4. 值得记录的观点
5. 可以继续追问的问题
```

## 工作原理

脚本加载后会：

1. 注入深色 AI 面板样式。
2. 拦截页面中的 `XMLHttpRequest` 和 `fetch`，记录字幕相关接口地址。
3. 从页面脚本和运行时请求中提取 `subtitle` / `ai_subtitle` 字幕 JSON URL。
4. 在 B 站字幕菜单中追加复制按钮。
5. 点击 `AI总结` 后，自动获取字幕文本。
6. 使用 `GM_xmlhttpRequest` 向已配置的 AI API 发起流式请求。
7. 手动解析 SSE 返回数据，将正文内容渲染为 Markdown。
8. 如果响应中包含 `reasoning_content`，将其放入可折叠的“思考过程”区域。

## 常见问题

### 为什么提示未找到字幕？

请确认当前视频本身带有可访问的 CC 字幕。部分视频没有官方字幕，或字幕资源需要先在播放器中手动点开一次字幕菜单才能触发加载。

### 为什么自动获取字幕超时？

可以手动点击一下播放器的字幕设置或字幕语言项，然后再点击 `AI总结` 或 `[复制]` 重试。

### 为什么发送按钮不可用？

通常是还没有配置 API Key。点击面板右上角设置按钮，填写并保存后再试。

### 为什么请求失败？

请检查：

- API Key 是否正确。
- Endpoint 是否为 Chat Completions 兼容接口。
- 模型名是否可用。
- 当前服务商是否支持流式输出。
- 用户脚本管理器是否允许 `GM_xmlhttpRequest` 和跨域连接。

## 隐私说明

- API Key、Endpoint、模型和 Prompt 仅通过用户脚本管理器本地存储保存。
- 视频字幕内容只会发送到你配置的 AI API Endpoint。
- 脚本没有后端服务，不会把内容发送到仓库作者或其他额外服务器。

## 与微信公众号脚本的区别

| 对比项 | B 站脚本 | 微信公众号脚本 |
| --- | --- | --- |
| 内容来源 | 视频 CC 字幕接口 | 文章 DOM 正文 |
| 适用页面 | B 站视频、番剧 | 微信公众号文章 |
| 额外能力 | 字幕复制、字幕自动捕获 | 文章标题、作者和正文提取 |
| 主题色 | B 站蓝色 | 微信绿色 |

## 许可证

本脚本随项目采用 [MIT License](LICENSE)。
