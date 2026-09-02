# 🍞 Breadcrumb

**让学习被看见、被记住、不焦虑。**
*A local-first AI learning companion that makes learning visible, without ever nagging you.*

你和 AI 聊你想学的东西。它在旁边把你学过的内容整理成一张地图 ——
你不用记笔记，不用打卡，界面上也没有任何东西在催你。

You talk to an AI about whatever you want to learn. Alongside that, it quietly builds a map
of what you have covered. No note-taking, no checking in, and nothing anywhere that nags you.

---

## 打开就能用 / Try it in the browser

**[→ kali-leo.github.io/Breadcrumb](https://kali-leo.github.io/Breadcrumb/)** — 什么都不用装。

数据存在浏览器自己的存储里，一样不离开你的设备。功能比桌面版少一点
（本地嵌入模型、发音、发现页），[少了什么写在这里](apps/web/README.md)。
另外你的 AI 服务需要允许跨域请求 —— 有的服务商可以，有的不行。

Nothing to install; data still stays on your device. A few features are unavailable in a
browser — [apps/web/README.md](apps/web/README.md) says which, and why.

## 下载桌面版 / Download the desktop app

**[→ 最新版本 / Latest release](https://github.com/Kali-Leo/Breadcrumb/releases/latest)**

| 系统 | 下载哪个 |
|---|---|
| Windows | `.exe` 安装包，双击安装 |
| Linux | `.AppImage`（`chmod +x` 后双击即可运行，不用安装）或 `.deb`（Debian / Ubuntu）。两个都需要 glibc 2.38 或更新（Ubuntu 24.04+、Debian 13+、Fedora 39+）|

每次发布都附一份 `SHA256SUMS`（由构建出这些文件的那次 CI 一起产出）。想核对下载的话：
把它放到安装包旁边，`sha256sum --check --ignore-missing SHA256SUMS`；
Windows 用 `certutil -hashfile <文件名> SHA256` 再和文件里对应那行比对。

> macOS 暂未提供。没有 Apple 开发者账号做公证的话，Mac 用户会撞上一个过不去的
> "应用已损坏"对话框 —— 那比不提供更糟。
>
> macOS is not built yet: without Apple notarisation, a Mac build gives users a "damaged app"
> dialog they cannot get past, which is worse than offering nothing.

**你还需要一个 AI 服务账号。** 这个应用本身不含 AI，也不收费 ——
任何兼容 OpenAI 接口的服务都行（DeepSeek、通义千问、OpenAI…），
钱花在你自己的账号上。首次启动的引导会带你填。
跑在本机回环上的 http 服务（Ollama、LM Studio、llama.cpp…）同样可用；
非本机地址必须是 https —— 密钥是明文跟着请求头走的。

**You bring your own AI service.** The app contains no AI and charges nothing. Any
OpenAI-compatible endpoint works; you spend on your own account. A plain-http server on the
loopback interface (Ollama, LM Studio, llama.cpp…) works too; anything not on this machine
must be https. The first-run guide walks you through it.

---

## 它是什么样的

- **一张会长出来的地图。** 聊过的知识点自己变成岛屿和王国，久没碰的地方蒙上白雾。
  地图上没有任何数字、进度条或排名。
- **复习不用你安排。** 你重读一段、猜对一个词、给同学讲一遍 —— 这些本来就是复习，
  系统按 FSRS 记下来就好。没有"今天该复习 12 张卡"。
- **每天有同学来请教你。** 他们问的是你学过、但最久没碰的内容。讲一遍是最扎实的复习。
- **点开任何一个不认识的词。** 全屏只讲这一个词，你可以继续在解释里点词，
  左边长出一张地铁线路图。
- **随手求证。** AI 回答下面点一下，它去公开资料里核对，
  并且诚实区分"没找到佐证"和"我这次没查成"。
- **看看自己离一个职业有多远。** 把你学过的和 1,016 个真实职业（O*NET / ESCO 官方数据）
  放在一起对比。匹配刻意保守 —— 漏掉一个只是让数字诚实地偏低，错配一个是伪造客观。

---

## 三条不会退让的原则

1. **减压第一。** 没有连续天数、没有进度条、没有百分比、没有排行榜。
   这些不是"还没做" —— 热力图的代码算得出连续天数，并且刻意不显示它：
   一条断掉的连续记录读起来像鞭子。
2. **每个花钱的环节独立开关、独立计价。** 设置里的「开关与计价」会在你打开一个功能之前，
   先告诉你它一次大概花多少 —— 那个数字来自跑真实提示词的实测，
   并且有测试盯着它不许变成谎话。
3. **永不评判用户。** 猜错不扣分，久不学也不会被提醒。
   "没做到"这类说法在文案里是被测试挡住的。

> These are constraints you can grep for, not slogans. The heatmap computes streaks and
> deliberately refuses to render them; the spending page's per-use estimate is measured from
> the real prompts and a test re-measures it on every run.

---

## 你的数据

**一个 SQLite 文件，在你自己的电脑上。** 没有账号，没有云同步，没有服务器 ——
这个项目根本没有后端。仓库里也没有任何遥测、埋点或崩溃上报的代码。

会离开这台电脑的只有：你发给**你自己配置的**那个 AI 服务的消息；
你主动点「求证」时的检索；以及首次运行下载一次本地嵌入模型。
设置里的**网络总开关**能一次全部切断 —— 它是加在唯一那个出口上的结构性阻断，
不是散落各处的 `if`。

详见 **[隐私与花费](documentation/privacy-and-cost.md)**。

Everything lives in one SQLite file on your machine. No account, no sync, no server, no
telemetry. Full detail in [privacy-and-cost.md](documentation/privacy-and-cost.md).

---

## 文档 / Documentation

| | |
|---|---|
| [功能全览](documentation/features.md) | 每个功能是什么、为什么这样设计、代码在哪 |
| [架构](documentation/architecture.md) | 代码怎么组织，数据怎么流动 |
| [隐私与花费](documentation/privacy-and-cost.md) | 数据去哪、钱花在哪、怎么关掉 |
| [参与开发](documentation/development.md) | 本地跑起来、测试、发版 |

---

## 研究课题（公开披露）/ Research tasks (disclosure)

Breadcrumb 是公益项目。应用会在本地运行经项目方审查并签名的研究分析任务，并把结果展示给你。

- 分析**只在你的设备上**进行，只产出聚合统计；任务**不含可执行代码**，只是声明式配置
- **任何数据都不会自动离开你的设备**。上传通道尚未实现，一行代码都没有
- 每项结果注明机构与研究目的，可随时逐条删除，整个功能也可以关掉
- 样本不足时它输出"数据还不够，先不下结论"，**而不是数字 0**

Analyses run on your device only and produce aggregate statistics only. Tasks carry no
executable code — just a declarative, signature-verified config. Nothing leaves your device
automatically; the upload path specified in the design is not implemented. Every result names
its institution and purpose and can be deleted, and the whole feature can be switched off.

---

## 语言 / Languages

界面有十一种语言：简体中文、English、Español、Français、Português、Русский、العربية、
हिन्दी、Bahasa Indonesia、বাংলা、Kiswahili。每一份词条都完整 —— 半份翻译比没有更糟，
测试会拦住不完整的语言。第一次打开时，如果你的系统语言不在其中，应用先请你自己选一种，
而不是替你猜。AI 回答的语言默认跟界面走，也可以单独改掉、界面保持不变。

**加一种语言不需要改代码**：复制一个 locale 文件夹翻译，再加一行语言表数据。
测试会指出哪一条词条对不齐、占位符丢了、或者少了这门语言语法要求的复数形式。
做法见 [参与开发](documentation/development.md)。

Eleven interface languages, each of them complete. If your system language is not one of
them, the first screen asks you to pick rather than guessing for you. Adding a language is a
folder plus a data row — no code. See [development.md](documentation/development.md).

---

## 开发 / Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
cd apps/desktop && pnpm tauri dev
```

详见 [参与开发](documentation/development.md)。

---

## License

[AGPL-3.0](LICENSE) · 第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

本仓库由 AI 全权开发与维护，方向与审美由 Leo 把关。
This repository is developed and maintained by AI, with direction and taste from Leo.
