/**
 * 下载流式 ASR 模型（zipformer 中文 fp16，~300MB）——ADR-003 模型分发。
 *
 * @ai-context: 2026-08 升级为 2025-06-30 新版中文 zipformer（fp16，替代 2023-02-20
 *              旧双语包，性能与准确性显著提升）；hf-mirror 国内镜像逐文件下载；
 *              文件放入 src-tauri/models/streaming-zipformer/（不入库，.gitignore）。
 * @ai-context: 文件名与官方仓库 csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30
 *              一致，必须与 lib.rs streaming_asr_models() 的路径约定完全匹配。
 *
 * 用法：node scripts/download-streaming-asr.mjs
 */

import { mkdir, writeFile, rename, stat, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_FILES = [
  "encoder.fp16.onnx",
  "decoder.fp16.onnx",
  "joiner.fp16.onnx",
  "tokens.txt",
];

const MIRROR_BASE =
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30/resolve/main";

/** 模型版本标记（写入 .model-version；升级时变更以触发旧文件清理，防新旧混用） */
const MODEL_VERSION = "zh-fp16-2025-06-30";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.resolve(__dirname, "../src-tauri/models/streaming-zipformer");

/** 下载单个文件（最多重试 3 次；下载到 .part 后原子重命名，防截断残留被误判为有效） */
async function downloadFile(name, targetDir) {
  const target = path.join(targetDir, name);
  const partTarget = `${target}.part`;
  // 已有完整文件则跳过（修复审查 M7：仅当文件存在且非空，且无 .part 残留时跳过）
  try {
    const info = await stat(target);
    if (info.size > 0) {
      console.log(`[跳过] ${name} 已存在（${info.size} 字节）`);
      return;
    }
  } catch {
    // 不存在则下载
  }

  const url = `${MIRROR_BASE}/${name}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[下载] ${name} (${attempt}/3): ${url}`);
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30 * 60_000), // 30 分钟总超时（审查 L14：防网络挂起永久悬挂）
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const expected = Number(res.headers.get("content-length") ?? 0);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error("空文件");
      if (expected > 0 && buf.length !== expected) {
        throw new Error(`大小不符（期望 ${expected}，实得 ${buf.length}）`);
      }
      // 原子写入：先 .part 后 rename，中断残留不会污染目标文件
      await writeFile(partTarget, buf);
      await rename(partTarget, target);
      console.log(`[完成] ${name}（${buf.length} 字节）`);
      return;
    } catch (err) {
      console.warn(`  ${name} 第 ${attempt} 次失败: ${err.message}`);
    }
  }
  console.error(`[失败] ${name} 下载失败，请手动放置到 ${targetDir}`);
}

/** 清理模型目录中的 onnx/tokens 文件（版本迁移用） */
async function cleanDirModels(targetDir) {
  let cleaned = 0;
  try {
    const entries = await readdir(targetDir);
    for (const name of entries) {
      if (name.endsWith(".onnx") || name === "tokens.txt" || name.endsWith(".part")) {
        await unlink(path.join(targetDir, name)).catch(() => {});
        cleaned++;
      }
    }
  } catch {
    // 目录不存在等
  }
  return cleaned;
}

async function main() {
  await mkdir(TARGET_DIR, { recursive: true });
  console.log(`目标目录: ${TARGET_DIR}`);
  // 版本迁移：标记不匹配 → 全量清理旧文件（2026-08 升级教训：新旧 tokens.txt 混用导致词表不匹配）
  const versionFile = path.join(TARGET_DIR, ".model-version");
  let versionMismatch = true;
  try {
    const v = await readFile(versionFile, "utf8");
    versionMismatch = v.trim() !== MODEL_VERSION;
  } catch {
    // 无标记 → 视为需要迁移
  }
  if (versionMismatch) {
    const cleaned = await cleanDirModels(TARGET_DIR);
    console.log(`[模型升级] 版本标记不匹配（期望 ${MODEL_VERSION}），已清理 ${cleaned} 个旧文件`);
  }
  for (const name of MODEL_FILES) {
    await downloadFile(name, TARGET_DIR);
  }
  await writeFile(versionFile, MODEL_VERSION, "utf8");
  console.log("全部完成。缺失文件请手动放置（ModelScope 备选源）后重启应用。");
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
