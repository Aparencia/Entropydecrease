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
    // semantic-release 自动发布提交（chore(release): vX.Y.Z）的 body 由 release notes
    // 生成，天然含超长 commit URL 行；人工提交贴链接同样常见。
    // 行长限制在此场景只会拦截合法提交（已实际导致 v0.25.0 发布失败），故禁用。
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
