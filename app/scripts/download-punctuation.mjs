/**
 * 下载标点恢复模型（ct-transformer 中英 int8，~100MB）——ADR-012 F4-2 模型分发。
 *
 * @ai-context: sherpa-onnx OfflinePunctuation 的标点恢复模型——重打分未通过的
 *              final 文本补语义标点（实时链路观感提升）；模型缺失时引擎零开销
 *              降级（无标点，现状行为），不阻断 ASR。
 * @ai-context: 主源 hf-mirror 国内镜像（ranger810 int8 量化版，单文件更小），
 *              备选官方 fp32 仓库；文件放入 src-tauri/models/punctuation/
 *              （不入库，.gitignore——与 streaming-zipformer 同模式）。
 * @ai-context: 文件必须与 lib.rs punctuation_model() 的路径约定完全匹配。
 *
 * 用法：node scripts/download-punctuation.mjs
 * 要求：Node.js ≥ 18（fetch + AbortSignal.timeout）
 */

import { mkdir, writeFile, rename, stat, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_FILES = ["model.int8.onnx"];

/** 主源：int8 量化镜像（hf-mirror 国内镜像） */
const MIRROR_BASE =
  "https://hf-mirror.com/ranger810/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/resolve/main";
/** 备选：官方 fp32 仓库（体积更大，仅主源不可用时回退） */
const OFFICIAL_BASE =
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12/resolve/main";

/** 模型版本标记（变更时触发旧文件清理，防新旧混用） */
const MODEL_VERSION = "ct-transformer-zh-en-int8-2024-04-12";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.resolve(__dirname, "../src-tauri/models/punctuation");

/** 下载单个文件（最多重试 3 次；.part 原子重命名，防截断残留被误判为有效） */
async function downloadFile(name, targetDir, bases) {
  const target = path.join(targetDir, name);
  const partTarget = `${target}.part`;
  // 已有完整文件则跳过
  try {
    const info = await stat(target);
    if (info.size > 0) {
      console.log(`[跳过] ${name} 已存在（${info.size} 字节）`);
      return;
    }
  } catch {
    // 不存在则下载
  }

  for (const base of bases) {
    const url = `${base}/${name}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[下载] ${name} (${attempt}/3): ${url}`);
        const res = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(30 * 60_000), // 30 分钟总超时
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const expected = Number(res.headers.get("content-length") ?? 0);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error("空文件");
        if (expected > 0 && buf.length !== expected) {
          throw new Error(`大小不符（期望 ${expected}，实得 ${buf.length}）`);
        }
        // 原子写入：先 .part 后 rename
        await writeFile(partTarget, buf);
        await rename(partTarget, target);
        console.log(`[完成] ${name}（${buf.length} 字节）`);
        return;
      } catch (err) {
        console.warn(`  ${name} 第 ${attempt} 次失败: ${err.message}`);
      }
    }
  }
  console.error(`[失败] ${name} 下载失败，请手动放置到 ${targetDir}`);
}

/** 清理模型目录中的 onnx 文件（版本迁移用） */
async function cleanDirModels(targetDir) {
  let cleaned = 0;
  try {
    const entries = await readdir(targetDir);
    for (const name of entries) {
      if (name.endsWith(".onnx") || name.endsWith(".part")) {
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
  // 版本迁移：标记不匹配 → 清理旧文件（与 streaming-asr 同模式）
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
  // int8 镜像优先，官方 fp32 回退（文件名相同：model.int8.onnx 不存在于官方仓库时
  // 自动失败并尝试下一源——官方仓库文件名实际为 model.onnx，故备选源也尝试该名）
  for (const name of MODEL_FILES) {
    await downloadFile(name, TARGET_DIR, [MIRROR_BASE, OFFICIAL_BASE]);
  }
  // 官方 fp32 文件名兜底（主源完全不可用时）：下载后必须重命名回 model.int8.onnx——
  // 六轮审查修复：lib.rs punctuation_model() 只认该文件名，旧实现兜底下载
  // "成功"但运行时永远加载不到（静默降级 + 脚本误报全部完成）
  if (MODEL_FILES.every((n) => !fileExists(path.join(TARGET_DIR, n)))) {
    await downloadFile("model.onnx", TARGET_DIR, [OFFICIAL_BASE]);
    if (await fileExists(path.join(TARGET_DIR, "model.onnx"))) {
      await rename(
        path.join(TARGET_DIR, "model.onnx"),
        path.join(TARGET_DIR, "model.int8.onnx"),
      );
      console.log("[完成] 官方 fp32 兜底已重命名为 model.int8.onnx（运行时路径约定）");
    }
  }
  await writeFile(versionFile, MODEL_VERSION, "utf8");
  console.log("全部完成。缺失文件请手动放置后重启应用。");
}

async function fileExists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
