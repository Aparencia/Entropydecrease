/**
 * @ai-context
 * commitlint 配置：校验 Conventional Commits，type 集合与 .releaserc.json releaseRules 严格对齐。
 * Commitlint config aligned with semantic-release commit-analyzer release rules.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'style', 'test', 'build', 'ci', 'chore'],
    ],
    // 中文 subject 不适用大小写规则
    'subject-case': [0],
  },
};
