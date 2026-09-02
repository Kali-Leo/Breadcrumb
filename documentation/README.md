# Breadcrumb 文档 / Documentation

本目录是 Breadcrumb 的公开文档。写给三类人：想知道这东西到底是什么的使用者、
想改它的开发者、以及想确认它有没有偷偷做什么的人。

This directory is Breadcrumb's public documentation, written for three readers: someone
deciding whether to use it, someone wanting to change it, and someone checking whether it
does anything behind their back.

| 文档 | 内容 |
|---|---|
| [功能全览 / Features](features.md) | 每个功能是什么、怎么用、背后怎么实现的 |
| [架构 / Architecture](architecture.md) | 代码怎么组织，数据怎么流动，为什么这么分 |
| [隐私与花费 / Privacy and cost](privacy-and-cost.md) | 数据去了哪里、钱花在哪里、怎么关掉 |
| [参与开发 / Development](development.md) | 本地跑起来、测试、发版 |

## 一句话

Breadcrumb 是一个本地优先的 AI 学习伴侣：你和 AI 聊你想学的东西，它在旁边把你学过的
内容整理成一张地图。你不用记笔记，不用打卡，也没有任何东西在催你。

Breadcrumb is a local-first AI learning companion. You talk to an AI about what you want to
learn, and alongside that it builds a map of what you have covered. No note-taking, no
checking in, and nothing anywhere that nags you.

## 三条产品原则

这些不是标语，是代码里能查到的约束：

1. **减压第一。** 界面上没有连续天数、没有进度条、没有百分比、没有排行榜。
   这些不是"还没做"，是明确拒绝做的 —— 热力图的代码算得出连续天数，
   并且刻意不显示它（`packages/feature-feedback/src/activity.ts`）。
2. **每个耗 token 的环节独立开关、独立计价。** 设置里的「开关与计价」页把每个会花钱的
   功能列出来，标明它一次大概花多少、至今花了多少，并且每个都能单独关掉。
3. **永不评判用户。** 猜错不扣分，久不学习不会被提醒，"没做到"这种说法在文案里
   是被测试挡住的（`apps/desktop/src/locales/copyGate.test.ts`）。

## 它不做什么

- 不做账号，不做云同步。你的数据在你自己的电脑上，一个 SQLite 文件里。
- 不内置 AI。你自己带一个兼容 OpenAI 接口的服务账号，钱花在你自己的账号上。
- 不收集使用统计。仓库里没有任何遥测、埋点或崩溃上报的代码。

## 现在的状态

v0.1.0 是第一个可下载的版本。功能上分三档，文档里会逐个标注：

- **成熟**：对话与学习模式、知识地图、专注模式、事实核查、语言学习。
- **能用但年轻**：学习目标、对比树、每日请教你的同学、研究课题平台。
- **需要外部配合**：发现页需要另一个项目（`feed-mode`）的本地程序才能有数据。
