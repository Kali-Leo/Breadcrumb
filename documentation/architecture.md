# 架构 / Architecture

## 一张图

```
apps/desktop                 Tauri 2 外壳 + React 界面 + Rust 命令
  ├── src/
  │   ├── components/        React 组件，按功能分成 12 个目录：chat、map、focus、
  │   │                      diglot、goal、companion、discovery、feedback、
  │   │                      research、settings、trail、onboarding
  │   ├── lib/               副作用与编排，按功能分成 14 个目录：billing、chat、
  │   │                      companion、compare、diglot、factcheck、feedback、
  │   │                      focus、knowledge、map、planner、platform、research、trail
  │   ├── stores/            17 个 zustand store
  │   └── locales/           界面文案，一种语言一个目录（共 11 种）
  └── src-tauri/             Rust：7 个命令，业务逻辑一概不在这里

packages/                    27 个无界面的库，被 apps/desktop 直接以工作区依赖引入
  ├── core-*  (10)           总线、数据库（迁移是 core-db/src/migrations/ 这个目录，
  │                          按编号分段）、事件契约、i18n、LLM 客户端、教学契约、
  │                          文本（core-text）、向量（core-vectors）、
  │                          日历日（core-time）、确定性随机（core-random）
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
| `core-bus` | 42 行的类型化发布订阅。全应用一个实例，14 个事件（事件表在 `core-events`）。抛异常的订阅者会被捕获，不阻塞其他人。 |
| `core-db` | 47 个只追加的迁移（编号排到 0052；5 个曾上线又被删掉的编号记在 `RETIRED_MIGRATION_IDS` 里，永不复用）+ 手写 SQL 仓储，跑在一个注入的 `SqlClient` 上。 |
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

> **注意：没有运行时插件系统。** 2026-09-02 定下的结论：Breadcrumb 不做运行时插件加载 ——
> 没有加载器、没有 `./mods` 目录、没有动态加载、没有插件市场。`feature-*` 前缀就是字面意思——
> 功能模块，和 `core-*` 一样在构建期编译进来（这批包过去带的是 plugin 前缀，同一天改名）。
> 事件契约在 `packages/core-events`（原 `sdk`，曾附带的 `PluginManifest`/`PluginPermission`
> 死类型没有任何消费者、也没有加载器，已随这个结论一起删除）。

---

## 数据库

**SQLite，经 `tauri-plugin-sql`，文件 `breadcrumb.db`。**

迁移是只追加的数组。它现在是一个目录（`packages/core-db/src/migrations/`）：
按编号分段的 `NNNN-NNNN.ts` 各存一批，`index.ts` 里的拼接顺序**就是**迁移顺序。
共 47 条，编号排到 0052 —— 中间空掉的 0038/0039、0041~0043 是发现页拆除时删掉的，
它们记在 `RETIRED_MIGRATION_IDS` 里，编号永不复用（复用会在跑过旧版本的机器上被静默跳过）。
每个迁移**连同它自己的记账行**跑在一个事务里 —— 崩溃留下的是"干净地没应用"，
而不是"应用了一半"。

**原子性需要一个 Rust 命令。** 插件的连接池最多 10 条连接，
所以从前端分开发出的 `BEGIN` / `COMMIT` 会落在不同连接上，根本不构成事务。
`src-tauri/src/transactions.rs` 借用插件自己的池，把一批语句跑在一个 sqlx 事务里。

**40 张活跃表**（迁移里建过 51 张，其中 13 张已被后来的迁移 DROP 掉；这 40 张含
`_migrations` 那张记账表）。主要的几张：`conversations` / `messages`（带 `parent_id` 消息树）、
`llm_calls`（计价账本）、`knowledge_nodes_v2` / `node_sightings` / `node_embeddings`、
`knowledge_edges`、`node_aliases` / `node_merges` / `node_pair_verdicts`、
`interest_signals`、`mastery_claims`、`goals`、`diglot_*`、
`focus_sessions` / `focus_nodes`、`term_marks`、`factcheck_*`、`companion_*`、
`canonical_concepts` / `comparison_profiles`、`research_*`、`ai_failures`、`settings`。

**所有 SQL 都是参数化的。** 全仓库唯一的字符串插值是占位符个数（`ids.map(() => "?")`），
一共三处；级联删除和节点合并要碰的表名是写死在常量数组里的（`CONVERSATION_SCOPED_TABLES`、
`MERGE_REFERENCING_TABLES`，各有一个对着真实 schema 跑的漂移测试）——
没有任何用户或模型提供的文本会变成 SQL。

---

## LLM 客户端层

`packages/core-llm/`：

- **端点**（`completionsUrl.ts`）：`baseUrl` 拼成 `/chat/completions` 这一个地址，
  两个客户端共用，省得它们对"什么算可用端点"产生分歧。**必须是 https** ——
  只有回环地址（`127.0.0.1` / `localhost` / `[::1]`）允许明文 http，因为本机的
  Ollama / LM Studio / llama.cpp 没有证书。密钥是 Bearer 头，走明文就等于交出去。
  query 和 fragment 会被丢掉（`https://a.example/v1?x=` 否则会拼成一个悄悄错掉的地址）。
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

> **三道保险防着一个被劫持或恶意的端点把内存吃光**（端点是用户自己填的，所以这不是假想）：
> 单行 SSE 上限 100 万字符（`MAX_SSE_LINE_CHARS`，一条永不换行的响应否则会无限增长）；
> 一次回答全文上限 200 万字符（`MAX_STREAM_CONTENT_CHARS`，远超任何模型的上下文）；
> 首字节之后超时变成**滑动**的，每来一个 chunk 重新计时，连续 30 秒静默就断
> （`STREAM_IDLE_TIMEOUT_MS`）—— 长回答不会被切断，半死的连接也不会永远挂着。

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
> 所以代码里**每一个绝对余弦阈值都被换成了相对门** `μ + f·(best − μ)`。
> 那个 `f` 现在是全仓唯一的一个常数 `RELATIVE_GATE_FRACTION = 0.5`，定义在
> `packages/core-vectors/src/similarity.ts`，知识树、关系判定、浏览兴趣都从这里 re-export ——
> 以前是四份各自写死的拷贝，可以各改各的。
> 2026-08-28 的审计发现旧的绝对阈值 0.72 让 100% 的候选对通过，
> 使得对比匹配成为最大的一笔 LLM 开销，而有效输出率只有 0.023%。

---

## Rust 命令面（7 个）

| 命令 | 做什么 |
|---|---|
| `open_app_database` | 打开本应用自己的数据库并注册连接池 |
| `execute_sql_transaction` | 在一条连接上原子地跑一批语句 |
| `embed_texts` | 本地嵌入 |
| `optimize_fsrs_parameters` | 用你自己的复习记录拟合 FSRS 参数 |
| `piper_synthesize` | 调用用户自己配置的 Piper 做发音 |
| `start_interest_service` / `read_interest_service_token` | 启动并连接外部的浏览兴趣程序 |

**安全边界。**

- 前端**不能指定数据库文件**（`sql:allow-load` 已从权限集中移除，路径由 Rust 选定）。
- `piper_synthesize` 会校验它将要执行的到底是不是 Piper；兴趣程序的查找是一组固定路径，
  不枚举目录。
- **模型写出来的链接一律交给 opener 打开，不让 webview 自己导航过去。** 这个窗口没有地址栏，
  一个加载进来的页面和应用本身长得一模一样 —— 那是干净的钓鱼面。opener 的协议白名单里
  已经没有 `http://`。
- **导航守卫**（`lib.rs` 的 `navigation_guard` 插件）：主窗口只允许加载 `tauri:` 协议、
  `tauri.localhost`，以及**仅开发构建**下的 Vite 服务器；别的一律拒绝。
- **语言包下载先校验 sha256**：摘要随安装包一起发（`assets/language-packs/catalog.json`），
  对不上就拒绝，然后才轮到 Zod 契约校验。
- **外链抓取逐跳重检**：`fetchExternalPage` 自己跟随重定向（最多 3 跳），
  **每一跳都重新过一遍**回环/私有地址名单 —— 底下没有任何一层会再检查一次，
  一个 `302 Location: http://127.0.0.1:11434/…` 否则就能把本机服务的响应当"证据"读出来。
  响应体大小和总等待时间也都有上限。
- 有一份真实的 CSP（开发和生产各一份）。

详见 [隐私与花费](privacy-and-cost.md)。

---

## 状态管理

17 个 zustand store。**几个 store 有导入期副作用**（订阅事件总线），
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
