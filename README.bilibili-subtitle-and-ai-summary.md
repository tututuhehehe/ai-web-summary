# B 站字幕获取与 AI 总结助手

> 在 B 站视频 / 番剧页一键提取字幕，用 AI 生成高信息密度总结，并围绕视频内容连续追问。

[![GreasyFork](https://img.shields.io/badge/GreasyFork-安装脚本-blue.svg)](https://greasyfork.org/zh-CN/scripts/575450)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 👉 一键安装

**[点击这里前往 GreasyFork 安装脚本](https://greasyfork.org/zh-CN/scripts/575450)**

> 需先安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 用户脚本管理器。

## 它能做什么？

看完一个长视频太累？这个脚本会在 B 站右侧加入一个轻量 AI 面板，自动读取当前视频字幕，然后帮你：

- **一键总结视频**：直接提炼主题、结论、关键依据和行动建议。
- **复制 CC 字幕**：字幕菜单里新增 `[复制]` 按钮。
- **连续追问**：总结后可以继续问“这段什么意思？”“作者结论可靠吗？”“提到的方法怎么做？”
- **支持思考模式**：可折叠查看 AI 推理过程和耗时。
- **可随时终止生成**：流式回复中点击 `⏹` 即可停止，保留已生成内容。
- **Token 用量显示**：服务商返回 usage 时，会显示本次与累计消耗。
- **适配 B 站 SPA**：切换视频后自动重置状态。
- **深色 / 浅色模式自适应**，侧边栏可拖拽、可收起。

## 支持的 AI 服务商

脚本支持兼容 OpenAI Chat Completions 格式的接口，内置：

- **硅基流动**：`https://api.siliconflow.cn/v1/chat/completions`
- **DeepSeek 官方**：`https://api.deepseek.com/chat/completions`
- **阿里云百炼**：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- **自定义接口**：填写完整 Chat Completions 地址即可

每个服务商会独立保存：API Key、Endpoint、主模型、备用模型。

## 使用方法

1. 安装脚本。
2. 打开一个带 CC 字幕的 B 站视频或番剧页面。
3. 点击页面右侧的 `AI总结`。
4. 首次使用时点右上角 ⚙️，填写 API Key 和模型名。
5. 关闭设置后，脚本会自动读取字幕并生成总结。
6. 总结完成后，可在底部继续追问视频内容。

## 常用快捷键

- `s`：唤起 / 收起 AI 面板。
- `Esc`：生成中用于中断；非生成时用于取消输入或收起面板。
- `Enter`：发送追问。
- `Shift + Enter`：换行。

## 思考模式说明

内置服务商可直接勾选「开启思考模式」。脚本会按服务商自动附加参数：

- 阿里云 / 硅基流动：`enable_thinking: true/false`
- DeepSeek：`thinking: { type: "enabled" / "disabled" }`

自定义服务商可在 `extra_body` 中手动填写参数，例如：

```json
{"enable_thinking": true}
```

> 不同模型对思考参数支持不同。如果接口报 unsupported parameter，请换支持推理的模型，或关闭思考模式。

## 字幕与上下文处理

- 复制字幕时输出纯文本。
- AI 总结时会自动给字幕附加时间戳，方便定位内容。
- 字幕过长时会保留开头和结尾，并提示省略量，避免超出模型上下文。
- 多轮追问会自动裁剪过早上下文，降低 Token 消耗。

## 常见问题

### 提示未找到字幕？

请确认视频本身有 CC 字幕。部分视频需要先手动点开一次播放器字幕菜单，再重新点击 `AI总结`。

### 请求失败？

请检查 API Key、Endpoint、模型名是否正确，以及该模型是否支持流式输出。

### Token 用量不显示？

只有服务商在流式响应末尾返回 `usage` 时才会显示；不返回则自动隐藏。

### 思考模式开关没效果？

通常是当前模型不支持对应推理参数，或服务商参数格式不同。可尝试换模型、关闭思考模式，或用自定义接口的 `extra_body` 手动配置。

## 隐私说明

- API Key、模型、Prompt 等配置只保存在本地用户脚本管理器中。
- 字幕内容只会发送到你自己配置的 AI API Endpoint。
- 脚本没有后端服务器。
- AI 输出会经过 Markdown 解析和 XSS 清洗后再显示。

## 许可证

[MIT License](LICENSE)
