# Spec 002: 知识树 & 面包屑轨迹（M2 · 产品灵魂）

> 让"对话即数据"第一次发光：右栏实时长出知识结构，左栏自动记录"今天学会了什么"。

## 需求

### 知识树 🌳（右栏）
1. 每轮 AI 回复结束后（`chat:responseFinished`），后台用 LLM 从这轮问答中提取知识点，
   增量挂到该会话的知识树上（新建节点或挂到已有节点下）
2. 树实时渲染在右栏：缩进层级 + 节点名；当前轮新增的节点有轻微高亮
3. 点击节点 = **锚定**：输入框上方出现"正在讨论：×节点名"，下一条消息自动携带该节点上下文
4. 提取功能有独立开关（设置页），调用计入独立计价 purpose=`knowledge-tree`
5. 提取失败静默降级：对话完全不受影响（树只是暂时不长）

### 面包屑轨迹 🍞（左栏下半区）
1. 以"天"为单位展示学习足迹：当天新增的知识节点列表（"今天的面包屑"）
2. 每天第一次打开应用时，若昨天有足迹，用 LLM 生成一句温柔的总结（如
   "昨天你搞懂了闭包，还顺手理清了作用域链"）；开关独立，purpose=`trail`
3. 永不显示"你已经 N 天没学习"类内容（产品原则 1 红线）

## 验收标准

- [ ] 聊 3 轮不同主题的内容，右栏出现结构合理的树；重启后树还在
- [ ] 点击节点锚定后提问，AI 的回答明显围绕该节点展开
- [ ] 关闭知识树开关后对话正常、无额外 LLM 调用；状态栏费用不再增长 knowledge-tree 份额
- [ ] 轨迹面板展示今天的节点；昨日总结语气温柔、无压力词汇
- [ ] 提取用的 LLM 返回 JSON 全部过 Zod；解析失败不影响对话
- [ ] `pnpm typecheck && lint && test` 全绿；提取 prompt 的解析逻辑有单元测试

## 架构决策

- **提取即插件**：knowledge-tree 与 trail 作为 `packages/plugin-knowledge-tree`、
  `packages/plugin-trail`（无头逻辑）+ desktop 内的面板组件；通过 core-bus 订阅事件，
  验证"官方功能走插件总线"的架构承诺
- **core-llm 增加非流式 `chatJson`**：一次性返回 + Zod schema 注入 + `response_format: json_object`
- **数据**：新增迁移 `knowledge_nodes`（id, conversation_id, parent_id, label, summary,
  source_message_id, created_at）与 `trail_summaries`（date, content, created_at）
- **每环节独立开关**：settings 增加 `featureSwitches` JSON（默认全开，UI 在设置页）

## 非目标

- 跨会话全局知识图谱合并（记入 backlog，需要更谨慎的产品设计）
- 遗忘预测着色（M3，FSRS）
- 树的手动编辑/拖拽（backlog）
