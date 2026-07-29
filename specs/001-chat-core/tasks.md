# Tasks 001: Chat Core

- [ ] T1 `core-db`：Drizzle schema（settings / conversations / messages / llm_calls）+ sqlite-proxy 驱动接口 + 迁移 SQL
- [ ] T2 `core-llm`：OpenAI 兼容客户端（流式）+ Zod 响应校验 + 单元测试（mock fetch）
- [ ] T3 `core-llm`：计价模块（内置价格表 + 自定义单价 + usage→费用换算）+ 单元测试
- [ ] T4 `desktop`：接入 tauri-plugin-sql 与 plugin-http，Rust 侧配置 capabilities
- [ ] T5 `desktop`：对话 UI（会话列表极简版 + 消息流 + 输入框 + 流式渲染）
- [ ] T6 `desktop`：设置页（API 配置、网络总开关）+ 状态栏（本会话/今日费用、当前模型、网络状态）
- [ ] T7 集成：消息全链路落库 + core-bus 事件广播 + 离线开关拦截
- [ ] T8 验收：真实 DeepSeek API 走通一轮对话；补齐测试；更新 CHANGELOG 与 ADR
- [ ] T9 杂务：升级 CI actions 版本（消除 Node 20 弃用警告）
