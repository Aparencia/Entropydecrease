/**
 * AiProviderSettings — Provider 管理面板（v0.11.6 M1，BYOK 多端点）。
 *
 * @ai-context: 列表卡片（名称/状态/默认模型/密钥/默认标记）+ 操作（编辑/测试/
 *              启用/删除/设默认）+ "添加 Provider"向导（预设模板：SiliconFlow/
 *              DeepSeek/OpenRouter/Ollama/自定义）。密钥只写不回传——视图仅
 *              显示"已配置"；测试连接走 ai_provider_test（最小 chat 请求）。
 *
 * @line-limit-exemption: 329 行（300 上限）——v0.11.6 M1 code-review 修复
 *               （确认弹窗/内联密钥输入/presetOptions/textarea 模型列表）后越线，
 *               已登记 docs/standards/line-limit-exemptions.md。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiProviderInput, AiProviderView } from "../types";

const btn: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  minWidth: 0,
};

/** 预设模板（前端向导数据源——I-3 兜底；后端 ai_provider_presets 优先，v0.12.0 M4 默认链 DeepSeek 首位） */
const PRESET_OPTIONS: { kind: AiProviderInput["kind"]; name: string; baseUrl: string; models: string }[] = [
  { kind: "openAiCompat", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: "deepseek-v4-flash-vision-exp" },
  { kind: "openAiCompat", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", models: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B" },
  { kind: "openAiCompat", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: "openai/gpt-4o-mini" },
  { kind: "ollama", name: "Ollama（本地）", baseUrl: "http://127.0.0.1:11434/v1", models: "qwen2.5:7b" },
];

export default function AiProviderSettings() {
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [keyInputId, setKeyInputId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  // I-3：预设双源——后端 ai_provider_presets 优先，失败回退内置常量
  const [presetOptions, setPresetOptions] = useState(PRESET_OPTIONS);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      setProviders(await invoke<AiProviderView[]>("ai_provider_list"));
    } catch (e) {
      setMsg({ kind: "err", text: `读取 Provider 列表失败：${e}` });
    }
    // I-3：预设双源——从后端拉取预设模板，失败保持内置常量兜底
    try {
      const presets = await invoke<AiProviderView[]>("ai_provider_presets");
      setPresetOptions(presets.map((p) => ({ kind: p.kind as AiProviderInput["kind"], name: p.name, baseUrl: p.baseUrl, models: p.models[0] ?? "" })));
    } catch { /* 保持内置常量兜底 */ }
  };

  const run = async (op: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg({ kind: "ok", text: "处理中…" });
    try {
      await op();
      if (okText) setMsg({ kind: "ok", text: okText });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `${e}` });
    } finally {
      setBusy(false);
    }
  };

  const testProvider = (id: string) =>
    run(async () => {
      const reply = await invoke<string>("ai_provider_test", { id });
      setMsg({ kind: "ok", text: `连接成功：${reply}` });
    });

  const removeProvider = (id: string) => {
    if (!window.confirm("删除后该 Provider 配置与密钥将永久清除，且不可恢复。确定删除？")) return;
    run(() => invoke("ai_provider_remove", { id }), "已删除");
  };

  const setDefault = (id: string) =>
    run(() => invoke("ai_set_default_provider", { id }), "已设为默认");

  const toggleEnabled = (p: AiProviderView) =>
    run(
      () =>
        invoke("ai_provider_update", {
          id: p.id,
          input: {
            name: p.name,
            kind: p.kind,
            baseUrl: p.baseUrl,
            models: p.models,
            defaultModel: p.defaultModel,
            enabled: !p.enabled,
            fallbackOrder: p.fallbackOrder,
          },
        }),
      p.enabled ? "已禁用" : "已启用",
    );

  const clearKey = (id: string) => {
    if (!window.confirm("清除后密钥不可恢复（需重新输入）。确定清除？")) return;
    run(() => invoke("ai_provider_clear_key", { id }), "密钥已清除");
  };

  return (
    <div style={{ fontSize: 12, color: "#1f2937" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI 服务提供商</span>
        <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => setShowAdd(true)} disabled={busy}>
          ＋ 添加 Provider
        </button>
      </div>

      {providers.length === 0 && (
        <div style={{ color: "#9ca3af", marginBottom: 8 }}>
          尚未配置 Provider——添加后即可启用 AI 功能（支持 SiliconFlow/DeepSeek/OpenRouter/Ollama 本地等）。
        </div>
      )}

      {providers.map((p) => (
        <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{p.name}</span>
            {p.isDefault && <span style={{ color: "#0d9488", fontWeight: 600 }}>● 默认</span>}
            <span style={{ color: p.enabled ? "#0d9488" : "#9ca3af" }}>{p.enabled ? "已启用" : "已禁用"}</span>
            {p.hasKey && <span style={{ color: "#6b7280" }}>密钥已配置</span>}
          </div>
          <div style={{ color: "#6b7280", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.baseUrl} · {p.defaultModel}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => setEditing(p)} disabled={busy}>编辑</button>
            <button style={btn} onClick={() => void testProvider(p.id)} disabled={busy}>测试连接</button>
            {!p.isDefault && <button style={btn} onClick={() => void setDefault(p.id)} disabled={busy}>设为默认</button>}
            <button style={btn} onClick={() => void toggleEnabled(p)} disabled={busy}>{p.enabled ? "禁用" : "启用"}</button>
            {p.hasKey ? (
              <button style={btn} onClick={() => void clearKey(p.id)} disabled={busy}>清除密钥</button>
            ) : (
              <button style={btn} onClick={() => { setKeyInputId(p.id); setKeyInput(""); }} disabled={busy}>配置密钥</button>
            )}
            {!p.isDefault && (
              <button style={{ ...btn, color: "#dc2626" }} onClick={() => void removeProvider(p.id)} disabled={busy}>删除</button>
            )}
          </div>
          {keyInputId === p.id && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                style={inputStyle}
                type="password"
                placeholder="API 密钥"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }}
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await invoke("ai_provider_save_key", { id: p.id, apiKey: keyInput.trim() });
                    setKeyInput("");
                    setKeyInputId(null);
                  }, "密钥已保存");
                }}
              >
                保存
              </button>
              <button
                style={btn}
                onClick={() => {
                  setKeyInputId(null);
                  setKeyInput("");
                }}
              >
                取消
              </button>
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <ProviderForm
          presetOptions={presetOptions}
          onCancel={() => setShowAdd(false)}
          onDone={(text) => {
            setShowAdd(false);
            setMsg({ kind: "ok", text });
            void load();
          }}
          onError={(text) => setMsg({ kind: "err", text })}
        />
      )}

      {editing && (
        <ProviderForm
          presetOptions={presetOptions}
          initial={editing}
          onCancel={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setMsg({ kind: "ok", text });
            void load();
          }}
          onError={(text) => setMsg({ kind: "err", text })}
        />
      )}

      {msg && (
        <div style={{ fontSize: 11, color: msg.kind === "ok" ? "#0d9488" : "#dc2626", marginTop: 4 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

/** Provider 表单（添加/编辑共用：预设模板 + 字段 + 密钥） */
function ProviderForm({
  initial,
  onCancel,
  onDone,
  onError,
  presetOptions = PRESET_OPTIONS,
}: {
  initial?: AiProviderView;
  onCancel: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
  presetOptions: { kind: AiProviderInput["kind"]; name: string; baseUrl: string; models: string }[];
}) {
  const [preset, setPreset] = useState(presetOptions[0]);
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [models, setModels] = useState(initial?.models.join("\n") ?? "");
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const applyPreset = (i: number) => {
    const p = presetOptions[i];
    setPreset(p);
    if (!initial) {
      setName(p.name);
      setBaseUrl(p.baseUrl);
      setModels(p.models);
      setDefaultModel(p.models);
    }
  };

  const submit = async () => {
    const modelList = models.split("\n").map((m) => m.trim()).filter(Boolean);
    if (!name.trim() || !baseUrl.trim() || modelList.length === 0 || !defaultModel.trim()) {
      onError("请填写名称、端点、模型列表与默认模型");
      return;
    }
    const input: AiProviderInput = {
      name: name.trim(),
      // 编辑时保留原 kind（预设只影响新增向导）
      kind: initial?.kind ?? preset.kind,
      baseUrl: baseUrl.trim(),
      models: modelList,
      defaultModel: defaultModel.trim(),
      enabled: initial?.enabled ?? true,
      fallbackOrder: initial?.fallbackOrder ?? [],
      apiKey: apiKey.trim() || undefined,
    };
    setBusy(true);
    try {
      if (initial) {
        await invoke("ai_provider_update", { id: initial.id, input });
        onDone("已保存");
      } else {
        await invoke("ai_provider_add", { input });
        onDone("已添加");
      }
    } catch (e) {
      onError(`${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid #0d9488", borderRadius: 6, padding: 10, marginBottom: 10, background: "#fafafa" }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{initial ? "编辑 Provider" : "添加 Provider"}</div>
      {!initial && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ marginRight: 6 }}>模板：</span>
          {presetOptions.map((p, i) => (
            <button
              key={p.name}
              style={{ ...btn, marginRight: 4, background: preset.name === p.name ? "#0d9488" : "#fff", color: preset.name === p.name ? "#fff" : "#1f2937", border: "none" }}
              onClick={() => applyPreset(i)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input style={inputStyle} placeholder="名称（如：我的 DeepSeek）" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={{ ...inputStyle, width: 160 }} placeholder="端点 URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </div>
      <div style={{ marginBottom: 6 }}>
        <textarea
          style={{ ...inputStyle, resize: "vertical" }}
          rows={2}
          placeholder="模型列表（每行一个）"
          value={models}
          onChange={(e) => setModels(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input style={inputStyle} placeholder="默认模型" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
        <input
          style={{ ...inputStyle, width: 200 }}
          type="password"
          placeholder={initial?.hasKey ? "已配置 · 留空不改" : "API 密钥"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void submit()} disabled={busy}>
          保存
        </button>
        <button style={btn} onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  );
}
