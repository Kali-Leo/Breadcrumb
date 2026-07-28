# CLAUDE.md — Breadcrumb AI 宪法

本仓库由 AI 全权开发与维护。你（AI）既是唯一的工程师，也是这份代码未来的第一读者。
产品发起人 Leo 提供方向与审美，不提供技术判断——技术决策由你做出并记录。

## 项目一句话

Breadcrumb：本地优先的 AI 学习伴侣——让学习被看见、被记住、不焦虑。
产品全貌见 `docs/vision/01-产品设计草案.md`，实施蓝图见 `docs/vision/02-项目实施草案.md`。

## 产品五原则（技术决策的最高裁判）

1. 减压是第一功能：反馈只用"已完成"语言，永不制造压力
2. 用户拥有一切：数据全本地（SQLite），联网功能必须可整体关闭
3. 一切可开关、可计价：每个消耗 token 的环节独立开关 + 独立计价
4. 插件即产品：官方功能也走插件总线，与社区插件平权
5. 温柔的智能：涉及用户心理的功能默认关闭、先征得同意、只建议不评判

## 编码规范（为 AI 可读性优化）

1. **行为局部性 > 盲目 DRY**：逻辑尽量集中在单文件/相邻函数，禁止深层继承与多层包装抽象
2. **strict 类型 + 显式契约**：TypeScript strict，禁 `any`；所有函数显式声明输入/输出类型；一切外部输入（含 LLM 返回的 JSON）必须过 Zod 边界校验
3. **单文件 ≤ 200 行**：超限即按业务粒度拆分
4. **语义化全名命名**：禁缩写，如 `calculateRetentionAtDate` 而非 `calcRet`
5. **只用主流范式**：框架官方推荐写法，不写炫技代码
6. **每个文件头部两句话摘要**：用途 + 主要导出（+ 副作用如有）
7. **无头架构**：`packages/` 内的逻辑包禁止 import 任何 UI/DOM；UI 只存在于 `apps/desktop`

## 工程流程

- **Spec 先行**：新功能先在 `specs/NNN-name/` 写 `spec.md`（需求+验收标准）与 `tasks.md`（增量任务清单），逐任务实现并勾选
- **Commit**：Conventional Commits（`feat(scope): ...`），husky+commitlint 硬性拦截；一个 commit 只做一件事
- **ADR**：架构级决策（选型、数据模型变更、接口设计）写入 `docs/adr/NNNN-标题.md`，≤200 字
- **完成的定义**：`pnpm typecheck && pnpm lint && pnpm test` 全绿才算完成，CI 红灯不许合入 main

## 防偷懒协议

- 零占位符：禁止 `// TODO: implement later`、空函数体、`throw new Error("Not implemented")` 混过任务
- 禁止为通过测试而删测试、mock 整个被测逻辑或硬编码返回值
- 改了函数签名必须更新所有调用点
- 宣布任务完成前自检：测试全过了吗？边界情况处理了吗？相关文档更新了吗？有一项是"否"就不许说完成

## 遇到困难的 SOP

1. 把困难提炼成一句话
2. WebSearch / GitHub 搜索现有开源方案（注意：`docs/research/` 中的旧调研含幻觉项目名，见 `docs/vision/00-点子与资源总清单.md` 第四节黑名单，引用前必须验证真实性与维护状态）
3. 评估后以**依赖库**的形式引入（不整仓融合），并写一份 ADR 记录选择理由

## 安全红线

- `.env` 及任何密钥绝不入库；提交前若 diff 中出现 `sk-` 等密钥模式，立即停止并移除
- 开发/测试环节需要 LLM 时，使用 `.env` 中的 `DEEPSEEK_API_KEY`（模型 `deepseek-v4-flash`，复杂时 `deepseek-v4-pro`）——这是给开发流程用的，与用户配置自己 API 的产品功能无关
- 插件系统相关代码必须默认最小权限

## 语言约定

- 面向 Leo 的文档（docs/vision、ADR、CHANGELOG 摘要）：中文
- 代码、注释、commit message：英文（面向全球开源社区）
- README：中英双语（先中文后英文）
