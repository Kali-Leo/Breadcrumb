# 参与开发 / Development

## 需要什么

- **Node 24+** 和 **pnpm 11**（`packageManager` 已在根 `package.json` 里钉住版本）
- **Rust stable**
- **Linux 还需要**：`libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev`

## 跑起来

```bash
pnpm install
cd apps/desktop && pnpm tauri dev
```

第一次启动会下载本地嵌入模型（约 120MB）。没有它应用照常工作，
只是地图聚类、节点去重和猜词判定会降级。

想用应用的话还需要一个兼容 OpenAI 接口的 AI 服务账号 ——
首次启动的引导会问你要。

## 质量门

```bash
pnpm typecheck    # 全工作区 tsc
pnpm lint         # biome
pnpm test         # vitest，全工作区
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
```

CI 跑同样这些，外加 `cargo audit` 和仅限生产依赖的 `pnpm audit`。

**供应链那一侧的约定**：`.github/workflows/` 里**每一个第三方 action 都钉到 commit SHA**
（后面跟一条 `# vX.Y.Z` 注释说明这个 SHA 是哪个版本），所以一次被劫持的 tag 推送影响不到构建；
代价是钉死的 action 拿不到安全修复，所以 `.github/dependabot.yml` 每周替 npm、cargo 和
github-actions 三个生态开更新 PR —— **升级靠 dependabot，不靠手改**（补丁和小版本合成一个 PR，
大版本单独开，好好读）。漏洞报告的去处写在 `.github/SECURITY.md`。

> **质量门全绿不等于测完。** 这个项目有过三个 spec 全绿交付、应用一打开全是运行时报错的
> 事故。改动涉及新功能、管线或多文件重构时，请在真实应用里走通一遍验收路径，
> 并确认控制台没有报错。

## 代码约定

- **`packages/` 里不放 React、不放 Tauri、不放网络调用。** 纯函数加 Zod 契约，
  需要 IO 的地方由调用方注入。这让每个包都能在 Node 里直接测。
- **每个文件顶部写 `Purpose:` 和 `Main exports:`。** 不是装饰 ——
  它是找东西的索引。
- **单文件 200 行上限。** 超了就拆。
- **TypeScript strict**，外部边界一律 Zod 校验（LLM 响应、外部服务、磁盘上的数据）。
- **Conventional Commits。** 提交信息说清楚"为什么"，而不只是"改了什么"。

## 离线数据管线（`scripts/`）

`scripts/` 下有两条**手动**数据管线（目录里另有几个零散的开发小工具）。
它们**不被 CI 调用**，也不参与应用构建 —— 产物是已经入库的数据文件，平时没人需要跑它们。

**语言包构建**（`scripts/language-packs/`）。两个入口：`build-pack.mjs`（通用管线，
任意语言对，数据来自 Wiktionary/kaikki + 词频表）和 `build-zh-en.mjs`（中英专用的
CC-CEDICT 管线，产物随安装包一起发）。**所有上游文件都钉在 `upstream.lock.json` 里**
（URL、commit SHA、sha256、字节数），下载后摘要对不上就拒绝构建 ——
所以一个被投毒或被悄悄换掉的上游到不了学习者的机器上。**要更新某个上游，就得改这个锁文件**：
把新文件下下来，`sha256sum` 一遍，把摘要和大小两个数字粘进去；
`commits` 那一段的 SHA 用 `gh api repos/<owner>/<repo>/commits/master --jq .sha` 重新查。
详情见 `scripts/language-packs/README.md`。

**职业 / 概念数据**（`scripts/canonical/`）。把 O*NET、ESCO、MDN 课程和课标的原始文件
变成入库的 TypeScript 数据。其中带 LLM 抽取的那几步（`extract-kebiao.mjs`、
`extract-mdn.mjs`、`extract-postings.mjs`）要读 `DEEPSEEK_API_KEY`，
所以必须用 **`node --env-file=.env`** 跑（见 `.env.example`）；纯转换的那几步
（`extract-onet.mjs`、`extract-esco.mjs`、`gen-data.mjs`）不需要密钥，也不联网发请求。

## 加一门界面语言

1. 复制 `apps/desktop/src/locales/en/` 成 `apps/desktop/src/locales/<code>/`，翻译。
2. 在 `packages/core-i18n/src/languages.ts` 里加一行数据。

不需要改代码 —— 文件夹是构建期发现的。测试会检查键集完全一致、占位符对齐、
以及该语言语法要求的每个 CLDR 复数类别都齐全。

## 改了提示词之后

如果改动会影响一次调用的大小，账单页上的估价就过期了。跑：

```bash
npx vitest run --root apps/desktop src/lib/billing/purposeUsage.test.ts
```

它会用真实的构造函数重新测量并和 `packages/core-llm/src/purposeCatalogue.ts` 比对。
不一致就把新数字填进去 —— **不要放宽容差**。

## 加一个模型的价格

只改一个地方：`packages/core-llm/src/modelCatalogue.ts` 加一条。

每条必须带 `source`（**服务商自己的定价页**，不是聚合网站或博客）和 `verifiedAt`。
这条规矩是有来由的：这张表最初是照聚合网站写的，和官方页逐条核对后发现大部分是错的。

一个模型按几种货币销售就写几张费率卡；有分时段定价就填 `offPeak`；
有批量折扣就填 `batchMultiplier`。其余的（币种选择器出不出现、
"延迟后台任务能不能省钱"）都从这一条推导。

## 发版

推一个 `v*` 标签，`.github/workflows/release.yml` 会在各平台构建安装包
并挂到一个草稿 release 上。

```bash
git tag -a v0.2.0 -m "..." && git push origin v0.2.0
```

macOS 刻意不构建：没有 Apple 开发者账号做公证的话，用户会撞上一个过不去的
"应用已损坏"对话框 —— 那比不提供更糟。

## 模拟测试（simlab）

`packages/simlab` 用 DeepSeek 扮演学生人格，在真实 SQLite 上重放应用的抽取/关系判定/
兴趣管线，并用机械判官检查结果。它会**真的花钱**，所以有一个花费护栏
（`--budgetCny`）。它永远不进产品构建。

## 目录里没有的东西

开发过程的内部工作层（设计文档、决策记录、AI 规则文件）不在这个仓库里。
所以**公开文档里不应该出现指向它们的路径** —— 结论要么写进 `documentation/`，要么就没有。
你需要知道的东西应该都在 `documentation/` 里；如果不在，那是文档的缺陷，欢迎提 issue。
