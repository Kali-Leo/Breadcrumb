# 架构 / Architecture

## 一张图

```
apps/desktop                 Tauri 2 外壳 + React 界面 + Rust 命令
  ├── src/                   React：视图、zustand store、lib（副作用与编排）
  ├── src-tauri/             Rust：6 个命令，业务逻辑一概不在这里
  └── src/locales/           界面文案（zh-CN、en）

packages/                    27 个无界面的库，被 apps/desktop 直接以工作区依赖引入
  ├── core-*  (10)           总线、数据库、事件契约、i18n、LLM 客户端、教学契约、
  │                          文本、向量、日历日、确定性随机
  ├── feature-* (15)         各个功能的纯逻辑
  └── demo-seed / simlab (2) 演示数据 / 仅开发期的模拟测试框架
```

**分层原则：`packages/` 里没有 React、没有 Tauri、没有网络。** 它们是纯函数加 Zod 契约。
需要数据库或网络的地方由调用方注入。这让每个包都能在 Node 里直接跑测试，
也让模拟测试框架能重放真实管线。

---

## 各包的职责

### core（10 个）

| 包 | 负责 |
|---|---|
| `core-bus` | 42 行的类型化发布订阅。全应用一个实例，17 个事件。抛异常的订阅者会被捕获，不阻塞其他人。 |
| `core-db` | 45 个只追加的迁移 + 手写 SQL 仓储，跑在一个注入的 `SqlClient` 上。 |
| `core-events` | 跨模块事件的类型契约。没有运行时插件系统，见下方注意事项。 |
| `core-i18n` | 语言注册表、语言协商、回答语言指令。 |
| `core-llm` | OpenAI 兼容的流式/JSON 客户端、重试、模型价目表、计价。 |
| `core-random` | FNV-1a 字符串哈希与 mulberry32 种子随机。库代码一律不调 `Math.random()`：地形、证据排序、人格扰动都从种子回放得出同一结果。 |
| `core-teaching` | 教学契约提示词。桌面端和 simlab 共用同一份，防止两边漂移。 |
| `core-text` | 纯文本处理：词表分词的中文切词，以及句边界查找。 |
| `core-time` | 「今天是哪一天」只在这里回答一次：按机器本地时区切日。热力图、研究相关性、每日摘要、宫殿布局必须切在同一条线上。 |
| `core-vectors` | 向量运算：打包归一化嵌入、全对相似度地形，以及余弦与相对门限（`RELATIVE_GATE_FRACTION`，全仓一个常数）。 |

### feature（15 个）

`knowledge-tree`（抽取与去重）、`graph`（关系判定）、`memory`（掌握度与三层）、
`planner`（推荐与前沿）、`map`（地形与聚类）、`interest`（心理信号）、
`browsing-interest`（浏览兴趣桥）、`explore`（专注模式与生词）、`diglot-weave`（语言学习）、
`compare`（对比树）、`factcheck`（事实核查）、`feedback`（热力图与趋势）、
`companion`（同学与记忆流）、`research`（研究课题）、`trail`（会话摘要，目前仅 simlab 使用）。

### 其余两个（2 个）

| 包 | 负责 |
|---|---|
| `demo-seed` | 演示用的示例数据生成：一棵可信的知识树与配套事件，供空库首次启动和 simlab 起手用。 |
| `simlab` | 仅开发期的模拟测试框架：合成人格重放真实管线，给判官台跑分。不进产品构建。 |

> **注意：没有运行时插件系统。** Breadcrumb 不做运行时插件加载（ADR-0035，2026-09-02 裁定）：
> 没有加载器、没有 `./mods` 目录、没有动态加载、没有插件市场。`feature-*` 前缀就是字面意思——
> 功能模块，和 `core-*` 一样在构建期编译进来。事件契约在 `packages/core-events`（原 `sdk`，
> 曾附带的 `PluginManifest`/`PluginPermission` 死类型已随裁定删除）。

---

## 数据库

**SQLite，经 `tauri-plugin-sql`，文件 `breadcrumb.db`。**

迁移是只追加的数组（`packages/core-db/src/migrations.ts`），每个迁移**连同它自己的
记账行**跑在一个事务里 —— 崩溃留下的是"干净地没应用"，而不是"应用了一半"。

**原子性需要一个 Rust 命令。** 插件的连接池最多 10 条连接，
所以从前端分开发出的 `BEGIN` / `COMMIT` 会落在不同连接上，根本不构成事务。
`src-tauri/src/transactions.rs` 借用插件自己的池，把一批语句跑在一个 sqlx 事务里。

**约 40 张活跃表。** 主要的几张：`conversations` / `messages`（带 `parent_id` 消息树）、
`llm_calls`（计价账本）、`knowledge_nodes` / `node_sightings` / `node_embeddings`、
`knowledge_edges`、`interest_signals`、`mastery_claims`、`goals`、
`diglot_*`、`focus_sessions` / `focus_nodes`、`term_marks`、`factcheck_*`、
`companion_*`、`ai_failures`、`settings`。

**所有 SQL 都是参数化的。** 全仓库唯一的字符串插值是占位符个数（`ids.map(() => "?")`）
和一个由 Zod 枚举选出的表名 —— 没有任何用户或模型提供的文本会变成 SQL。

---

## LLM 客户端层

`packages/core-llm/`：

- **流式**（`client.ts`）：SSE，带 `stream_options: {include_usage: true}`，
  并读取服务商报告的**缓存命中 token 数**。读取器是**读干净而不是取消** ——
  取消一个已完成的 Tauri http 响应会让一个已分离的 promise 变成 rejection。
- **JSON**（`jsonClient.ts`）：`response_format: json_object`，整个入口 `temperature: 0`
  钉死（"从这里过去的每一件事都是判断"），Zod 校验，**恰好一次纠正重试**，
  把校验错误喂回去。用量累加在一个能在异常中存活的盒子里，
  所以 `ChatJsonError.usage` 永远是可计费的。
- **重试**（`retry.ts`）：2 次传输层重试，可重试状态码 `{429,500,502,503,529}`，
  等抖动退避（500ms 起、8s 封顶），尊重 `Retry-After`；
  非流式整请求 120s 超时，流式只对**首字节**计 60s。

### 计价

`apps/desktop/src/lib/billing/metering.ts` 是 `llm_calls` 的**唯一写入者**，
所有调用点都从这里过，所以定价和币种逻辑没法在各处漂移。

价目在 `packages/core-llm/src/modelCatalogue.ts`，每条都带**读自哪个官方定价页**
和**谁在哪天核对过**。一个模型按它被销售的每种货币各有一张费率卡；
有峰谷定价的按调用发生的时刻结算；缓存命中的那部分按命中价单独计算。
不在表里的模型记 0 花费，界面直说估不出来。

每次调用的 token 用量是**实测**的（`lib/billing/purposeUsage.measure.ts` 跑真实的提示词构造函数），
一个测试每次都重新测量并比对，防止改了提示词之后账单页上的数字变成谎话。

---

## 本地嵌入

**`multilingual-e5-small`（ONNX），经 Rust 的 `fastembed`，在进程内跑**
（`src-tauri/src/embeddings.rs`）。首次运行下载一次（约 120MB）到应用数据目录，
之后完全离线。每段文本按 E5 惯例加 `"query: "` 前缀。

用在：地图聚类、节点去重、关系候选排序、正典概念锚定、猜词判定、
语言学习的上下文新颖度、浏览兴趣匹配。**零 token，从不计价**，
每个使用者在它返回 null 时都能优雅降级。

> **这一层有一条反复出现的教训。** e5 会把所有真实的成对相似度挤在 0.80~0.95 之间，
> 所以代码里**每一个绝对余弦阈值都被换成了相对门** `μ + 0.5·(best − μ)`。
> 2026-08-28 的审计发现旧的绝对阈值 0.72 让 100% 的候选对通过，
> 使得对比匹配成为最大的一笔 LLM 开销，而有效输出率只有 0.023%。

---

## Rust 命令面（6 个）

| 命令 | 做什么 |
|---|---|
| `open_app_database` | 打开本应用自己的数据库并注册连接池 |
| `execute_sql_transaction` | 在一条连接上原子地跑一批语句 |
| `embed_texts` | 本地嵌入 |
| `optimize_fsrs_parameters` | 用你自己的复习记录拟合 FSRS 参数 |
| `piper_synthesize` | 调用用户自己配置的 Piper 做发音 |
| `start_interest_service` / `read_interest_service_token` | 启动并连接外部的浏览兴趣程序 |

**安全边界。** 前端**不能指定数据库文件**（`sql:allow-load` 已从权限集中移除，
路径由 Rust 选定）；`piper_synthesize` 会校验它将要执行的到底是不是 Piper；
兴趣程序的查找是一组固定路径，不枚举目录；有一份真实的 CSP；
外部 URL 抓取拒绝回环与私有地址。详见 [隐私与花费](privacy-and-cost.md)。

---

## 状态管理

18 个 zustand store。**几个 store 有导入期副作用**（订阅事件总线），
所以 `App.tsx` 里有几行只为副作用而存在的 import —— 那不是多余的。

事件链：
- `chat:responseFinished` → 记忆刷新、知识抽取、同学检查、讲解评级
- `knowledge:nodesExtracted` → 生词门、关系判定、兴趣抽取、推荐重算
- `knowledge:edgesUpdated` / `interest:updated` / `mastery:updated` → 推荐重算

---

## 多语言

**两条独立的语言轴**：界面语言，和 AI 回答的语言。回答语言默认跟随界面，
除非用户显式改掉 —— 一次静默的切换会意味着"孩子用自己的语言提问，
得到一个他读不懂的回答"。

**提示词一律用中文撰写**，只在最后追加一条 `【语言】…` 指令指明目标语言，
由 `lib/platform/llmConfig.ts` 这唯一的配置装配点附加。
一条运行时绊线（`replyLanguage.ts`，懒加载 `franc`）检测到回答语言不对时，
用更强硬的指令重试一次。

**加一门语言不需要改代码**：`import.meta.glob("../locales/*/*.json")` 在构建期发现文件夹。
唯一贴近代码的一步是在 `core-i18n/src/languages.ts` 里加**一行数据**。
文字方向和字体栈从那一行推导（按书写系统，不按语言）。

**包只产出键，不产出字符串**（`CopyMessage { key, params }`）。
测试卡得很死：跨语言的键集必须完全一致、不能有空串、非中文目录里不能残留汉字、
占位符必须对齐、该语言语法要求的每个 CLDR 复数类别都必须齐全、
包里发出的每个键都必须能在真实目录里解析、以及一份压力/操控词表要扫过每一条叶子字符串。

---

## simlab（仅开发期）

`packages/simlab` —— 用 DeepSeek 扮演的学生人格、一个跑真实 SQLite 的会话运行器
（重放应用真正的抽取/关系判定/兴趣/同义词门管线）、一个花费护栏，
以及几个机械判官（不变量、指标、黄金基线、压力词表、教学纪律）。

它只是桌面应用的 `devDependency`，永远不进构建。
