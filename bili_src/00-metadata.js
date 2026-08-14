// ==UserScript==
// @name         B站字幕获取与AI总结助手
// @namespace    https://github.com/tututuhehehe/ai-web-summary
// @version      1.2.2
// @author       limoon
// @description  B站 bilibili 视频 番剧 字幕 总结 摘要 AI助手 DeepSeek
// @description:en  Bilibili video subtitle summary AI assistant (DeepSeek/OpenAI)
// @match        *://*.bilibili.com/video/*
// @match        *://*.bilibili.com/bangumi/play/*
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @run-at       document-start
// @connect      *
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/575450/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E4%B8%8EAI%E5%8A%A9%E6%89%8B%20%28%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91%E6%80%BB%E7%BB%93%29.meta.js
// ==/UserScript==

