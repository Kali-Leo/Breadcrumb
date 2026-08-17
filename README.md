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

## 开发 / Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # quality gates
cd apps/desktop && pnpm tauri dev           # run the desktop app
```

## License

[AGPL-3.0](LICENSE) · 第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
