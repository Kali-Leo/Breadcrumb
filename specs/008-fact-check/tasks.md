# Tasks 008: 求真——事实核查

- [x] T1 `plugin-factcheck`：类型与 Zod schema（Claim / Evidence / Verdict）+
      声明提取与判定的 prompt 模块（移植 Loki 提示词精髓，MIT）+ 单元测试
- [x] T2 `plugin-factcheck`：EvidenceProvider 接口 + Wikipedia 实现 + DuckDuckGo 实现 +
      fetch-and-verify（可访问性验证）+ 单元测试（mock fetch）
- [ ] T3 `core-llm` / `core-db`：purpose `factcheck` 计价分账接入；核查结果落库
      （新迁移：factcheck_runs / factcheck_claims）
- [ ] T4 `desktop`：factcheckStore + 触发管线（手动按钮起步）+ 设置页开关区新增条目
- [ ] T5 `desktop`：消息旁核查标记 + 展开面板（佐证链接 / 温柔文案）
- [ ] T6 集成：`factcheck:finished` 事件广播；离线开关拦截；静默降级
- [ ] T7 验收：真实对话验证全部验收标准；更新 README 功能清单与 CHANGELOG
