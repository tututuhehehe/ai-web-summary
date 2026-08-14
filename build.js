#!/usr/bin/env node
"use strict";

// 依赖为 0 的合并脚本：按文件名字典序读取各页面源码目录下的模块片段，
// 把它们拼接成对应的 .user.js 单文件产物。
// 每个片段必须以换行结尾，拼接时不额外插入分隔符，保证生成结果稳定。
//
// 新增其他网页脚本时，在 TARGETS 里加一项即可，例如：
//   { srcDir: "wx_src", outFile: "wx-article-ai-summary.user.js" }

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TARGETS = [
  { srcDir: "bili_src", outFile: "bilibili-subtitle-and-ai-summary.user.js" },
];

function buildTarget({ srcDir, outFile }) {
  const srcPath = path.join(ROOT, srcDir);
  const files = fs
    .readdirSync(srcPath)
    .filter((name) => name.endsWith(".js"))
    .sort();

  if (files.length === 0) {
    throw new Error(`${srcDir} 目录下没有 .js 模块片段`);
  }

  const parts = files.map((name) =>
    fs.readFileSync(path.join(srcPath, name), "utf8"),
  );
  fs.writeFileSync(path.join(ROOT, outFile), parts.join(""), "utf8");

  console.log(`已合并 ${files.length} 个模块 -> ${outFile}`);
  for (const name of files) {
    console.log(`  ${srcDir}/${name}`);
  }
}

function main() {
  for (const target of TARGETS) {
    buildTarget(target);
  }
}

main();
