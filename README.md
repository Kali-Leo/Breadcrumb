# 🍞 Breadcrumb

> 本地优先的 AI 学习伴侣：让学习被看见、被记住、不焦虑。
> A local-first AI learning companion: making learning visible, memorable, and anxiety-free.

## 这是什么？

和 AI 对话学习的人越来越多，但对话是线性的——学了什么、学到哪了、忘了多少，全都看不见。
Breadcrumb 把你与 AI 的每次学习对话变成看得见的痕迹：

- 🌳 **知识树**：对话时，屏幕一侧实时长出你正在学的知识结构，学习不再迷失
- 🍞 **面包屑轨迹**：自动记录"你今天学会了什么"——不打卡、不催促，只给成就感
- 🧠 **遗忘地图**：基于 FSRS 算法预测每个知识点的记忆保留率，备考者能看到"考试那天我还记得多少"
- 🔍 **求真**：一键为 AI 的回答查证事实——提取声明、检索公开资料、给出温柔的佐证结论，链接实测可访问才展示
- 🌤 **心晴**（默认关闭）：从对话觉察你的学习状态，深夜挫败时说一句"睡一觉再战它也许更划算"

## 产品五原则

1. **减压是第一功能**——一切反馈用"已完成"的语言，永不使用"你落后了"的语言
2. **用户拥有一切**——数据全部本地存储，断网可用，联网功能有总开关
3. **一切可开关、可计价**——每个消耗 token 的环节独立开关 + 独立计价器
4. **插件即产品**——官方功能也是插件，与社区开发者平权
5. **温柔的智能**——涉及心理的功能默认关闭、先征得同意、只建议不评判

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

## 状态

🚧 早期开发中。产品设计见 [docs/vision](docs/vision/)，工程规范见 [CLAUDE.md](CLAUDE.md)。

## 技术栈

Tauri 2 · React · TypeScript (strict) · SQLite · pnpm workspaces

## 开发

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # 质量检查
cd apps/desktop && pnpm tauri dev           # 启动桌面应用
```

## English

Breadcrumb turns your AI-assisted learning conversations into visible traces: a live-growing
knowledge tree, an automatic "done list" of what you actually learned, and an FSRS-powered
forgetting map that shows how much you'll remember on exam day. Local-first (SQLite, offline-capable),
every AI-consuming feature has its own switch and cost meter, and the whole product is built on a
plugin bus — official features are plugins too, on equal footing with community ones.

## License

[AGPL-3.0](LICENSE) · 第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
