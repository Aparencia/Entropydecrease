/**
 * 命令面板注册表
 *
 * @ai-context: 全局命令注册中心，命令 id 需唯一；重复注册以后注册者覆盖。
 */
export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: 'navigation' | 'action' | 'settings' | 'content';
  shortcut?: string;
  execute: () => void | Promise<void>;
}

/**
 * 模糊匹配：将 query 拆分为字符，在 target 中按顺序查找（不要求连续）。
 * 返回匹配到的字符数，0 表示不匹配。
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      // 连续匹配加分
      if (lastMatchIndex === ti - 1) {
        score += 2;
      }
      // 单词开头匹配加分（空格后或字符串开头）
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') {
        score += 3;
      }
      lastMatchIndex = ti;
      qi++;
    }
  }

  // 只有 query 所有字符都匹配才返回分数
  return qi === q.length ? score : 0;
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      // 幂等：已注册的命令直接跳过（兼容 React Strict Mode 双重执行）
      return;
    }
    this.commands.set(command.id, command);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  search(query: string): Command[] {
    if (!query.trim()) {
      return this.getAll();
    }

    const results: Array<{ command: Command; score: number }> = [];

    for (const command of this.commands.values()) {
      const labelScore = fuzzyScore(query, command.label);
      const descScore = command.description
        ? fuzzyScore(query, command.description) * 0.7
        : 0;
      const totalScore = Math.max(labelScore, descScore);

      if (totalScore > 0) {
        results.push({ command, score: totalScore });
      }
    }

    // 按匹配度降序排列
    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.command);
  }
}

export const commandRegistry = new CommandRegistry();
