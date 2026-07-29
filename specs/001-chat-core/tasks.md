# Tasks 001: Chat Core

- [x] T1 `core-db`：行类型 + append-only 迁移 SQL + 手写 SQL 仓储（settings / conversations / messages / llm_calls，见 ADR-0002）
- [x] T2 `core-llm`：OpenAI 兼容客户端（流式）+ Zod 响应校验 + 单元测试（mock fetch）
- [x] T3 `core-llm`：计价模块（内置价格表 + 自定义单价 + usage→费用换算）+ 单元测试
- [x] T4 `desktop`：接入 tauri-plugin-sql 与 plugin-http，Rust 侧配置 capabilities
- [x] T5 `desktop`：对话 UI（会话列表极简版 + 消息流 + 输入框 + 流式渲染）
- [x] T6 `desktop`：设置页（API 配置、网络总开关）+ 状态栏（本会话/今日费用、当前模型、网络状态）
- [x] T7 集成：消息全链路落库 + core-bus 事件广播 + 离线开关拦截
- [x] T8 验收：Leo 实测真实对话走通（2026-07-29）；价格表已按官方页核实（v4-flash/v4-pro）
- [x] T9 杂务：升级 CI actions 版本（消除 Node 20 弃用警告）
