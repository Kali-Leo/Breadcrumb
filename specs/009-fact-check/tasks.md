# Tasks 008: 求真——事实核查

- [x] T1 `plugin-factcheck`：类型与 Zod schema（Claim / Evidence / Verdict）+
      声明提取与判定的 prompt 模块（移植 Loki 提示词精髓，MIT）+ 单元测试
- [x] T2 `plugin-factcheck`：EvidenceProvider 接口 + Wikipedia 实现 + DuckDuckGo 实现 +
      fetch-and-verify（可访问性验证）+ 单元测试（mock fetch）
- [x] T3 `core-db`：purpose `factcheck` 计价分账接入；核查结果落库
      （迁移 0005：factcheck_runs / factcheck_claims + 仓储）
- [x] T4 `desktop`：factcheckStore + 手动触发管线 + 设置页开关（求真核查、大陆网络模式）
- [x] T5 `desktop`：消息下方「🔍 求证」按钮 + 展开面板（佐证链接 / 温柔文案）
- [x] T6 集成：`factcheck:finished` 事件广播；离线/未配置 API 温和提示；失败静默降级
- [ ] T7 验收：Leo 真实对话验证全部验收标准（含大陆网络实测）；更新 CHANGELOG
