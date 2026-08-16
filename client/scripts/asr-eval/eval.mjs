/**
 * 识别评估入口 — CER + 热词命中率评测（P0-1）
 *
 * @ai-context: 课堂/技能语料的识别质量评测 CLI。三种引擎模式：
 *   --local 直接加载 sherpa-onnx-node 本地转写（Node ABI 与 Electron 不一致
 *   时会失败并给出提示，见下）；--cloud 走 AI 网关 transcribe 端点；
 *   --file 直接评测语料中预置的识别文本（无引擎依赖，供 CI/自检）。
 * 语料格式见 corpus/README.md（JSON manifest，不入库）。
 * @ai-context EN: CLI entry for recognition quality evaluation (CER + hotword
 * hit-rate). --file mode evaluates pre-recorded transcripts with no engine
 * dependency (CI-friendly); --local / --cloud invoke local sherpa or the AI
 * gateway respectively.
 *
 * 用法：
 *   node scripts/asr-eval/eval.mjs --file          # 离线评测语料内嵌识别文本
 *   node scripts/asr-eval/eval.mjs --cloud         # 经网关转写后评测
 *   node scripts/asr-eval/eval.mjs --local         # 本地 sherpa 转写（Electron ABI 提示）
 *   node scripts/asr-eval/eval.mjs --self-test     # 算法自检（合成样例）
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCer, aggregateCer, normalizeText } from './lib/cer.mjs';
import { computeHotwordHitRate, aggregateHotwordHitRate } from './lib/hotwordHit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus');
const MANIFEST = path.join(CORPUS_DIR, 'manifest.json');
const GATEWAY_URL = process.env.ENTROPY_GATEWAY_URL ?? 'http://127.0.0.1:8000';

// ── 语料读取 ──────────────────────────────────────────────

async function loadCorpus() {
  try {
    await access(MANIFEST);
  } catch {
    console.error('[asr-eval] 语料清单缺失：', MANIFEST);
    console.error('[asr-eval] 请按 corpus/README.md 准备语料后重试；算法验证可用 --self-test');
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  return manifest.items ?? [];
}

async function loadTranscripts(items) {
  const resolved = [];
  for (const item of items) {
    const refPath = path.join(CORPUS_DIR, item.referenceFile);
    const ref = await readFile(refPath, 'utf8');
    let hypothesis = item.hypothesis ?? '';
    if (item.hypothesisFile) {
      hypothesis = await readFile(path.join(CORPUS_DIR, item.hypothesisFile), 'utf8');
    }
    resolved.push({
      id: item.id,
      label: item.label ?? item.id,
      mode: item.mode ?? 'auto',
      terms: item.terms ?? [],
      reference: ref,
      hypothesis,
    });
  }
  return resolved;
}

// ── 云端转写 ──────────────────────────────────────────────

async function transcribeCloud(items) {
  const out = [];
  for (const item of items) {
    try {
      const audio = await readFile(path.join(CORPUS_DIR, item.audioFile));
      const resp = await fetch(`${GATEWAY_URL}/api/v1/asr/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64: audio.toString('base64'),
          language: item.language ?? 'zh',
          sample_rate: item.sampleRate ?? 16000,
          channels: item.channels ?? 1,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        console.error(`[asr-eval] 转写失败 ${item.id}: HTTP ${resp.status}`);
        out.push({ ...item, hypothesis: '', engineError: `HTTP ${resp.status}` });
        continue;
      }
      const data = await resp.json();
      out.push({ ...item, hypothesis: data.text ?? '', engine: data.model_used ?? 'unknown' });
    } catch (err) {
      console.error(`[asr-eval] 转写失败 ${item.id}:`, err.message);
      out.push({ ...item, hypothesis: '', engineError: err.message });
    }
  }
  return out;
}

// ── 本地 sherpa 转写（Electron ABI 提示） ────────────────

async function transcribeLocal(items) {
  let sherpa;
  try {
    sherpa = (await import('sherpa-onnx-node')).default ?? (await import('sherpa-onnx-node'));
  } catch (err) {
    console.error('[asr-eval] 无法在纯 Node 环境加载 sherpa-onnx-node（native addon ABI 与 Electron 不一致是预期现象）。');
    console.error('[asr-eval] 请在 Electron 主进程环境内跑本地转写，或使用 --cloud 模式。');
    console.error('[asr-eval] 原始错误：', err.message);
    process.exit(2);
  }
  // 注意：模型路径沿用主进程配置（client/electron/ai/local-asr/config.ts 的模型目录），
  // 需要 ENV LOCAL_ASR_MODEL_DIR 指定 encoder/decoder/joiner/tokens 所在目录
  const modelDir = process.env.LOCAL_ASR_MODEL_DIR;
  if (!modelDir) {
    console.error('[asr-eval] 请设置 LOCAL_ASR_MODEL_DIR 指向本地 zipformer 模型目录（encoder/decoder/joiner/tokens）。');
    process.exit(2);
  }
  const createRecognizer = sherpa.createOnlineRecognizer ?? sherpa.OnlineRecognizer;
  const recognizer = typeof createRecognizer === 'function' && createRecognizer.length === 1 && !createRecognizer.prototype
    ? createRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: path.join(modelDir, 'encoder.onnx'),
          decoder: path.join(modelDir, 'decoder.onnx'),
          joiner: path.join(modelDir, 'joiner.onnx'),
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
      },
      enableEndpoint: true,
      endpointConfig: {
        rule1: { minTrailingSilence: 2.4 },
        rule2: { minTrailingSilence: 2.0, minUtteranceLength: 10 },
        rule3: { minUtteranceLength: 20 },
      },
    })
    : new createRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: path.join(modelDir, 'encoder.onnx'),
          decoder: path.join(modelDir, 'decoder.onnx'),
          joiner: path.join(modelDir, 'joiner.onnx'),
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
      },
      enableEndpoint: true,
      endpointConfig: {
        rule1: { minTrailingSilence: 2.4 },
        rule2: { minTrailingSilence: 2.0, minUtteranceLength: 10 },
        rule3: { minUtteranceLength: 20 },
      },
    });

  const out = [];
  for (const item of items) {
    try {
      const audio = await readFile(path.join(CORPUS_DIR, item.audioFile));
      // WAV 16-bit PCM → Float32（简化：假定语料统一 16kHz 16bit 单声道 WAV，格式见 corpus/README）
      const pcm = wavToFloat32(audio);
      const stream = recognizer.createStream();
      const CHUNK = 1600;
      for (let offset = 0; offset < pcm.length; offset += CHUNK) {
        const chunk = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
        if (stream.acceptWaveform.length <= 1) {
          stream.acceptWaveform({ samples: chunk, sampleRate: 16000 });
        } else {
          stream.acceptWaveform(16000, chunk);
        }
        while (recognizer.isReady(stream)) recognizer.decode(stream);
      }
      stream.inputFinished();
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      stream.free?.();
      out.push({ ...item, hypothesis: result.text ?? '', engine: 'zipformer-local' });
    } catch (err) {
      console.error(`[asr-eval] 本地转写失败 ${item.id}:`, err.message);
      out.push({ ...item, hypothesis: '', engineError: err.message });
    }
  }
  return out;
}

/** WAV（16kHz/16bit/单声道 PCM）→ Float32Array；非预期格式抛错（P0-5 采样率前置校验口径一致） */
function wavToFloat32(wav) {
  if (wav.length < 44) throw new Error('WAV 头缺失');
  const sampleRate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const bits = wav.readUInt16LE(34);
  if (sampleRate !== 16000 || channels !== 1 || bits !== 16) {
    throw new Error(`语料音频格式须为 16kHz/16bit/单声道 WAV（实际 ${sampleRate}Hz/${bits}bit/${channels}ch）`);
  }
  const data = wav.subarray(44);
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = data.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

// ── 输出与自检 ────────────────────────────────────────────

function buildReport(items, engineLabel) {
  const perItem = items.map((item) => {
    const cer = computeCer(item.reference, item.hypothesis, item.mode);
    const hw = computeHotwordHitRate(item.reference, item.hypothesis, item.terms ?? []);
    return { id: item.id, label: item.label, engine: item.engine ?? engineLabel, ...cer, hotwordHitRate: hw.hitRate, hotwordMisses: hw.misses };
  });
  const aggregate = aggregateCer(items);
  const hwAgg = aggregateHotwordHitRate(items);
  return { generatedAt: new Date().toISOString(), engine: engineLabel, aggregateCer: aggregate, aggregateHotword: hwAgg, items: perItem };
}

/** 算法自检：合成样例断言 CER/热词命中率行为（CI 可跑，无引擎依赖） */
async function selfTest() {
  let failed = 0;
  const assertClose = (name, actual, expected, eps = 1e-9) => {
    const ok = Math.abs(actual - expected) <= eps;
    if (!ok) {
      failed++;
      console.error(`[self-test] FAIL ${name}: expected ${expected}, got ${actual}`);
    } else {
      console.log(`[self-test] PASS ${name} = ${actual}`);
    }
  };
  const assertEq = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failed++;
      console.error(`[self-test] FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    } else {
      console.log(`[self-test] PASS ${name}`);
    }
  };

  // CER：完全相同 → 0
  assertClose('cer-identical', computeCer('熵减是一款学习软件', '熵减是一款学习软件').cer, 0);
  // CER：全角/半角归一化不影响（ＡＢＣ → ABC）
  assertClose('cer-normalize', computeCer('ＡＢＣ', 'ABC').cer, 0);
  // CER：单字符替换 → 1/7
  assertClose('cer-substitution', computeCer('今天讲线性代数', '今天讲线性代数课').cer, 1 / 7);
  // CER：聚合 = 单条一致
  assertClose('cer-aggregate',
    aggregateCer([
      { reference: '今天讲线性代数', hypothesis: '今天讲线性代数' },
      { reference: '求矩阵的逆', hypothesis: '求矩阵的逆' },
    ]), 0);
  // 热词命中：替换后纠正命中
  const hw = computeHotwordHitRate('卷积神经网络', '卷积神经网络', ['卷积神经网络']);
  assertClose('hotword-hit', hw.hitRate, 1);
  assertEq('hotword-hit-list', hw.hits, ['卷积神经网络']);
  // 热词未命中（错字）→ miss，且不计 notInRef
  const hwMiss = computeHotwordHitRate('梯度下降法', '梯度下减法', ['梯度下降法']);
  assertClose('hotword-miss', hwMiss.hitRate, 0);
  assertEq('hotword-miss-list', hwMiss.misses, ['梯度下降法']);
  assertEq('hotword-miss-notInRef', hwMiss.notInRef, []);
  // notInRef 不计入分母
  const hwNotInRef = computeHotwordHitRate('机器学习', '机器学习', ['机器学习', '量子纠缠']);
  assertClose('hotword-notInRef-rate', hwNotInRef.hitRate, 1);
  assertEq('hotword-notInRef-list', hwNotInRef.notInRef, ['量子纠缠']);
  // 空参考
  assertClose('cer-empty-ref', computeCer('', '').cer, 0);
  assertClose('cer-empty-ref-hyp', computeCer('', '多余内容').cer, 1);

  // 归一化等价性
  assertEq('normalize', normalizeText('　全角ＡＢＣ　  '), '全角ABC');

  if (failed > 0) {
    console.error(`[asr-eval] self-test 失败 ${failed} 项`);
    process.exit(1);
  }
  console.log('[asr-eval] self-test 全部通过');
}

// ── 主入口 ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--self-test') ? 'self-test'
    : args.includes('--local') ? 'local'
    : args.includes('--cloud') ? 'cloud'
    : args.includes('--file') ? 'file'
    : args.includes('--help') ? 'help' : null;

  if (mode === 'help' || !mode) {
    console.log('用法: node scripts/asr-eval/eval.mjs [--file|--cloud|--local|--self-test|--help]');
    console.log('  --file       离线评测语料中预置的识别文本（无引擎依赖）');
    console.log('  --cloud      经 AI 网关转写后评测（ENTROPY_GATEWAY_URL 可覆盖网关地址）');
    console.log('  --local      本地 sherpa 转写（需 LOCAL_ASR_MODEL_DIR；Electron ABI 见文档）');
    console.log('  --self-test  算法自检（合成样例，无引擎/语料依赖）');
    process.exit(0);
  }

  if (mode === 'self-test') {
    await selfTest();
    return;
  }

  const rawItems = await loadCorpus();
  let items = await loadTranscripts(rawItems);
  let engineLabel = 'pre-recorded';

  if (mode === 'cloud') {
    items = await transcribeCloud(rawItems);
    engineLabel = 'gateway-cloud';
  } else if (mode === 'local') {
    items = await transcribeLocal(rawItems);
    engineLabel = 'local-sherpa';
  }

  const report = buildReport(items, engineLabel);
  const outDir = path.join(__dirname, 'results');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `report-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(outFile, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[asr-eval] 聚合 CER = ${(report.aggregateCer * 100).toFixed(2)}%（${items.length} 条）`);
  console.log(`[asr-eval] 热词命中率 = ${(report.aggregateHotword.hitRate * 100).toFixed(2)}%（命中 ${report.aggregateHotword.totalHit}/${report.aggregateHotword.totalInRef}）`);
  if (report.aggregateHotword.topMisses.length > 0) {
    console.log('[asr-eval] 高频未命中术语 Top 5：',
      report.aggregateHotword.topMisses.slice(0, 5).map(([t, n]) => `${t}×${n}`).join('、'));
  }
  console.log(`[asr-eval] 报告已写入: ${outFile}`);
}

main().catch((err) => {
  console.error('[asr-eval] 执行失败：', err);
  process.exit(1);
});
