# Spec 001: Chat Core（对话心脏）

> M1 里程碑。让 Breadcrumb 第一次能真正对话，并让用户看到每一分花费。

## 需求

1. **API 配置**：用户在设置页配置 OpenAI 兼容 API（base URL / key / 模型名），保存在本地 SQLite；key 不以明文出现在日志中
2. **对话**：用户可创建会话、发送消息、收到 AI 流式回复；会话与消息全部落库，重启后可见
3. **计价**：每次 LLM 调用记录 input/output token 数；界面状态栏实时显示「本次会话花费 + 今日花费」；价格按模型单价表计算（内置常见模型价格，允许用户自定义单价）
4. **离线开关**：全局网络开关关闭时，所有 API 调用被拒绝并给出温和提示（产品原则 2）
5. **事件广播**：消息发送/回复完成时通过 core-bus 广播 `chat:messageSent` / `chat:responseFinished`（为知识树等未来插件供数）

## 验收标准

- [ ] 配置 DeepSeek API 后能完成一轮真实对话，重启应用后历史仍在
- [ ] 状态栏显示的费用与 API 返回的 usage 计算一致
- [ ] 关闭网络开关后发送消息 → 收到温和的离线提示，无网络请求发出
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 全绿；核心逻辑（计价、消息流转）有单元测试
- [ ] 所有 LLM 返回的 JSON 过 Zod 校验后才进入系统

## 架构决策（详见 ADR-0002/0003）

- **数据层**：`packages/core-db` = Drizzle schema（单文件 schema.ts）+ sqlite-proxy 驱动，实际 SQL 由 Tauri 端 `tauri-plugin-sql` 执行
- **LLM 层**：`packages/core-llm` = 纯 TS 的 OpenAI 兼容客户端（无头、可单测）；网络请求经 `@tauri-apps/plugin-http` 绕过 CORS；流式输出
- **UI**：`apps/desktop` 三栏布局的中栏（对话）+ 底部状态栏（费用/模型/网络开关）；左右栏留空位（M2 填充）

## 非目标（明确不做）

- 多模型路由、本地模型（M4+）
- 知识树/轨迹（M2，但事件先埋好）
- 每环节独立 API 配置（结构预留 `purpose` 字段，UI 后置）
