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

`docs/`、`specs/`、`CLAUDE.md` 和 `.claude/` 不在这个仓库里 ——
它们是开发过程的内部工作层。你需要知道的东西应该都在 `documentation/` 里；
如果不在，那是文档的缺陷，欢迎提 issue。
