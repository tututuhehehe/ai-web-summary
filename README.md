# AI 页面总结助手 Userscripts

> 一组轻量级浏览器用户脚本，在不同网页中注入沉浸式 AI 侧边栏，自动提取当前页面的核心内容，并通过兼容 OpenAI 接口的大语言模型进行总结与连续问答。

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 项目定位

这个仓库最初只服务于 B 站字幕提取与 AI 总结，现在开始扩展为“面向不同内容页面的 AI 总结助手”集合。每个脚本都保持零构建、单文件、自包含，适合直接安装到 Tampermonkey、Violentmonkey 等用户脚本管理器中使用。

当前包含：

| 脚本 | 适用页面 | 主要能力 | 专属文档 |
| --- | --- | --- | --- |
| `bilibili-subtitle-and-ai-summary.user.js` | B 站视频、番剧页面 | 提取 CC 字幕、复制字幕、AI 视频总结、基于字幕连续追问 | [README.bilibili-subtitle-and-ai-summary.md](README.bilibili-subtitle-and-ai-summary.md) |
| `wx-article-ai-summary.user.js` | 微信公众号文章页 | 提取文章标题、作者与正文、AI 文章总结、基于文章连续追问 | [README.wx-article-ai-summary.md](README.wx-article-ai-summary.md) |

## 共同特性

- 沉浸式右侧 AI 面板，不需要离开当前页面。
- 支持 Markdown 渲染，包括标题、列表、加粗、代码块和表格。
- 支持总结后继续追问，保留当前页面内容上下文。
- 内置阿里云百炼 DashScope、DeepSeek 官方接口配置。
- 支持自定义 OpenAI 兼容接口 Endpoint、API Key 和模型名。
- 支持主模型、备用模型快速切换。
- 支持自定义总结 Prompt。
- 支持 Reasoning/Thinking 模式，并将 `reasoning_content` 与正文内容分开展示。
- 所有配置通过 `GM_setValue` / `GM_getValue` 保存在本地浏览器环境。

## 安装方式

1. 安装用户脚本管理器：
   - [Tampermonkey](https://www.tampermonkey.net/)
   - [Violentmonkey](https://violentmonkey.github.io/)

2. 安装需要的脚本：
   - B 站脚本可从 GreasyFork 安装：
     [B站字幕获取与AI总结助手](https://greasyfork.org/zh-CN/scripts/575450-b%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8Eai%E6%80%BB%E7%BB%93%E5%8A%A9%E6%89%8B)
   - 微信公众号脚本可在脚本管理器中新建脚本，然后粘贴 `wx-article-ai-summary.user.js` 的完整内容。

3. 打开目标页面后，点击页面右侧的 `AI总结` 侧边按钮。

4. 首次使用时，点击面板右上角设置按钮，填写服务商、API Key、模型和 Prompt。

## B 站脚本

`bilibili-subtitle-and-ai-summary.user.js` 面向 B 站视频和番剧页面，支持字幕复制、字幕自动捕获、视频总结和基于字幕的连续追问。

详细说明请看：[README.bilibili-subtitle-and-ai-summary.md](README.bilibili-subtitle-and-ai-summary.md)

## 微信公众号脚本

`wx-article-ai-summary.user.js` 面向微信公众号文章页，打开文章后会在右侧注入同风格 AI 面板。它会读取页面中的文章标题、公众号作者和正文内容，然后交给 AI 生成总结。

详细说明请看：[README.wx-article-ai-summary.md](README.wx-article-ai-summary.md)

## 配置说明

脚本面板中的配置项包括：

- `服务商`：阿里云百炼、DeepSeek 官方或自定义接口。
- `API Key`：对应服务商的密钥，仅保存在本地用户脚本存储中。
- `Endpoint`：选择自定义服务商时填写 OpenAI 兼容的 Chat Completions 地址。
- `主模型 / 备用模型`：例如 `deepseek-v4-flash`、`deepseek-v4-pro`、`qwen-plus`、`deepseek-reasoner` 等。
- `开启思考模式`：为支持推理输出的模型附加对应参数。
- `自定义总结 Prompt`：控制首次总结的结构、重点和输出风格。

服务商适配：

- 阿里云百炼：使用 `enable_thinking` 控制思考模式。
- DeepSeek：使用 `thinking: { type: "enabled" | "disabled" }` 控制思考模式。
- 自定义 Endpoint：如果地址包含 `dashscope` 或 `deepseek.com`，脚本会尝试自动附加相应思考参数。

## 隐私与安全

- API Key、模型名、Endpoint 和 Prompt 通过用户脚本管理器的存储能力保存在本地。
- 页面内容只会发送到你在设置中配置的 AI API Endpoint。
- 仓库不包含后端服务，也不会额外收集、转发或上传你的数据。

## 开发约定

- 原生 JavaScript ES6+，不使用 TypeScript。
- 不引入 npm、打包器或构建流程。
- 每个用户脚本保持单文件自包含。
- 第三方库仅通过用户脚本元数据 `@require` 引入，目前使用 `marked.js` 渲染 Markdown。
- 新增外部请求能力时，必须在用户脚本元数据中声明相应 `@grant` / `@connect`。

## 许可证

本项目采用 [MIT License](LICENSE) 许可。
