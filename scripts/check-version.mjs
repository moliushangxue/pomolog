#!/usr/bin/env node
// 发版前跑：npm run version:check
//
// 版本号散在四个文件里，漏改一个不会报错，只会让产物名字、Cargo 元数据、
// 界面显示三处各说各话 —— 这类错误要等到打 tag 之后才被发现。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const spots = [
  { file: "package.json", re: /"version"\s*:\s*"([^"]+)"/ },
  { file: "src-tauri/Cargo.toml", re: /^version\s*=\s*"([^"]+)"/m },
  { file: "src-tauri/tauri.conf.json", re: /"version"\s*:\s*"([^"]+)"/ },
  { file: "CHANGELOG.md", re: /^## \[(\d+\.\d+\.\d+)\]/m },
];

let bad = 0;
const found = [];

for (const { file, re } of spots) {
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    console.error(`✗ 读不到 ${file}`);
    bad++;
    continue;
  }
  const m = text.match(re);
  if (!m) {
    console.error(`✗ ${file} 里找不到版本号`);
    bad++;
    continue;
  }
  found.push({ file, version: m[1] });
}

for (const { file, version } of found) {
  console.log(`  ${version.padEnd(10)} ${file}`);
}

const versions = [...new Set(found.map((f) => f.version))];

if (versions.length > 1) {
  console.error(`\n✗ 版本号不一致：${versions.join(" / ")}`);
  bad++;
} else if (bad === 0) {
  console.log(`\n✓ 四处一致：${versions[0]}`);
}

process.exit(bad ? 1 : 0);
