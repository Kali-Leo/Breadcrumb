# 🍞 Breadcrumb

> 🚧 早期开发中，正式介绍编写中。
> 🚧 In early development; a proper introduction is on its way.

## 研究任务（公开披露）

Breadcrumb 是公益项目。应用会在本地运行经项目方审查并签名的研究分析任务（由合作教育研究机构提交），
并把结果展示给你。要点：

- 分析**只在你的设备上**进行，只产出聚合统计（如分布、均值），任务**不含可执行代码**（仅声明式统计配置）
- **任何数据都不会自动离开你的设备**——是否把某项结果分享给研究（未来版本）由你逐次明示决定
- 每项结果都注明机构与研究目的，你可以随时删除任何结果
- 可在设置中整体关闭此功能

**Research tasks (disclosure).** Breadcrumb locally runs research analyses that are reviewed and
signed by the project (submitted by partner education researchers) and shows you the results.
Analyses run on your device only, produce aggregate statistics only, and contain no executable
code (declarative configs). Nothing ever leaves your device automatically — sharing any result
with research (future versions) requires your explicit per-study consent. Every result names its
institution and purpose, can be deleted at any time, and the whole feature can be switched off
in settings.

## 语言 / Languages

界面目前有简体中文与英文，两份词条都完整（半份翻译比没有更糟，测试会拦住不完整的语言）。
AI 回答的语言默认跟界面走；模型在某种语言上明显更弱时，设置页会说一句，并允许把回答语言
单独换掉、界面保持不变。

**加一种语言**（不需要改代码）：

1. 复制 `apps/desktop/src/locales/en/` 成 `apps/desktop/src/locales/<bcp47>/`，逐条翻译；
   `{{name}}` 这样的占位符要原样保留。
2. 在 `packages/core-i18n/src/languages.ts` 的表里加一行：语言自己的名字（endonym）、书写方向、
   文字所属的字体族、`franc` 会返回的 ISO 639-3 码，以及模型在这门语言上的水平判断；
   翻完了把 `shipped` 改成 `true`。
3. 在 `apps/desktop/src/i18n/index.ts` 里把新目录接进 `resources`。
4. `pnpm --filter @breadcrumb/desktop test` —— 词条对不齐、空串、占位符丢失、
   或者混进了施压措辞，测试会直接报出是哪一条。

开发时选单里还有一个 `Pseudo (RTL)`：英文词条自动加长约 35% 并强制从右往左排，
用来在没有真实翻译之前就暴露截断和方向问题。它不会进入用户装到的版本。

The interface ships in Simplified Chinese and English, both complete. To add a language, copy
`apps/desktop/src/locales/en/` to a new BCP-47 folder, translate every string (keeping
`{{placeholders}}` intact), add a row to the table in `packages/core-i18n/src/languages.ts`,
register the folder in `apps/desktop/src/i18n/index.ts`, and run the desktop tests — they fail
on missing keys, empty strings, dropped placeholders and pressure wording.

## 开发 / Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # quality gates
cd apps/desktop && pnpm tauri dev           # run the desktop app
```

## License

[AGPL-3.0](LICENSE) · 第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
