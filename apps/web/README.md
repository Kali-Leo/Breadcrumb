# Breadcrumb — 浏览器版 / Browser edition

打开一个网址就能用，什么都不用装。数据存在浏览器自己的存储里，一样不离开你的设备。

Open a URL and use it — nothing to install. Data lives in the browser's own storage and, as
on the desktop, never leaves your device.

**这不是桌面版的替代品**，是同一个应用的第二种运行方式。桌面版能做的更多（见下面「少了什么」）。

---

## 它是怎么做到的

`apps/web` **没有自己的功能代码**。它构建的是 `apps/desktop/src` ——
同一个 React 应用、同一批组件、同一套 store、同一份文案。

两个版本之间只有**四个模块**不同，由 Vite 别名替换：

| 桌面版 | 浏览器版 |
|---|---|
| `@tauri-apps/plugin-sql`（原生 SQLite 文件） | SQLite 编译成 WebAssembly，存在浏览器的 OPFS 里 |
| `@tauri-apps/api/core`（Rust 命令） | 浏览器实现，做不到的诚实报错 |
| `@tauri-apps/plugin-http`（Rust 发请求） | 浏览器自己的 `fetch` |
| `@tauri-apps/plugin-opener` | `window.open`，同样限制协议白名单 |

**所以桌面版加一个功能，这一版当天就有。** 没有第二份实现会漂移。

> 代价是有的：Tailwind 从构建根目录找类名，而这一版的构建根是 `apps/web`，组件却在
> `apps/desktop/src`——首发那版因此只带了基础层、一条工具类都没有，页面整个是裸的
> （2026-08-31 上线，2026-09-01 发现并修：`App.css` 里显式写 `@source "./**/*.{ts,tsx}"`）。
> 这类"跨目录构建"的坑不会有编译错误，只会安静地少东西，改构建配置后请截图看一眼。

数据库用的是 `opfs-sahpool` 这个 VFS，它**不需要跨源隔离（COOP/COEP）** ——
也就是说这个版本可以放在任何静态托管上，不用配特殊响应头。这正是"打开就能用"的前提。

47 个迁移在 SQLite-wasm 上逐条跑通并有测试盯着
（`src/shims/sqlite.migrations.test.ts`）—— 不同的 SQLite 构建、不同的驱动、
不同的绑定层，底下压着几千行手写 SQL，这是这一版最大的风险点，所以它是被测的。
四个替身模块也各有测试：命令分发表、协议白名单、重定向转换、数据库协议本身
（`src/shims/*.test.ts`）。

---

## ⚠️ 一件必须先知道的事：CORS

桌面版的网络请求是 Rust 发的，在浏览器的安全模型之外，所以**任何 AI 服务都能用**。
浏览器版的请求是网页发的，所以**你的 AI 服务必须允许跨域请求**。

**多数主流服务商可以直连。** 2026-09-02 实测预检通过的有：DeepSeek、OpenAI、Moonshot、
智谱、通义、Groq、OpenRouter、SiliconFlow。填上密钥就能用，不用做别的。

**本机端点用不了。** Ollama、LM Studio 这一类跑在你自己电脑上的服务，
这一版连不上：页面是 https 的，本机端点是 http 的，浏览器会拦下来。想用它们请用桌面版。

如果填好了密钥却一直失败，先在浏览器控制台看看是不是 CORS ——
应用本身分不清"被跨域挡下"和"网断了"，两者报的是同一个错。

> Most mainstream providers work directly: DeepSeek, OpenAI, Moonshot, Zhipu, Tongyi, Groq,
> OpenRouter and SiliconFlow all passed a preflight check on 2026-09-02. What cannot work is a
> local endpoint — Ollama, LM Studio and the like — because this page is served over https and
> those listen on plain http, which the browser blocks. Use the desktop build for those.

---

## 少了什么

诚实列出来。这些都是浏览器给不了的能力，不是没写完：

| 少了什么 | 影响 | 为什么 |
|---|---|---|
| **FSRS 参数按人拟合** | 用库的默认参数 | 需要 Rust 那个 crate。它本来也只在 400 次复习之后才触发 |
| **本地发音（Piper）** | 退回浏览器自己的语音合成 | Piper 是本机程序，网页起不了进程 |
| **发现页** | 这一版没有入口 | 它要连本机 21456 端口上的另一个程序。网页连本地端口正是浏览器该拦的事，所以侧栏里不放这个入口，也不去轮询那个端口 |
| **手机浏览器** | 能用，但还没有专门为小屏设计 | 2026-09-03 起：窄屏或竖屏时侧栏收成抽屉、记忆宫殿改上下堆叠、触屏手势齐全（轻点选中、再点进入、双指捏合返回、划词出「专注」按钮）。平板上完整可用；手机屏幕上信息会挤，但不再有算不出宽度或退不出来的问题 |

**本地嵌入模型现在有了。** 和桌面版同一个模型（`multilingual-e5-small`），在 Web Worker 里
用 transformers.js 跑，q8 量化版与桌面向量的余弦 ≥ 0.995。它**不在首屏下载**：
第一次真的要用到时才取那 113 MB，并且归网络总开关管——开关关着就直接降级，不偷偷联网。
下载源先探测 `huggingface.co`，不通再退 `hf-mirror.com`；ONNX 运行时的 wasm 从本站同源目录发，
不走 jsDelivr。模型存在浏览器的 Cache API 里，之后完全离线。

**其余全部照常**：对话与学习模式、知识地图（含地形生成）、专注模式、生词标注与猜词、
学习目标、对比树（1,016 个职业的数据是随包的）、事实核查、每日来请教你的同学、
研究课题平台、以及计价与全部开关。

**语言学习是可用的。** 9 个语言对里，`zh:en` 随包，另外 8 个从本站同源目录下载
（`/Breadcrumb/language-packs/`，由部署流程从 GitHub Releases 搬过来，
文件与 Release 资产逐字节相同，装之前照样核对 SHA-256）。
早先直接向 GitHub Releases 下载在浏览器里是 100% 失败的：资产两跳重定向都不带 CORS 头。

---

## 可安装 / 离线

这一版是个 PWA：地址栏里会出现"安装"，装完在自己的窗口里跑，没有浏览器界面。
iOS 上没有安装提示，要自己「分享 → 添加到主屏幕」（也建议这么做：Safari 会清理
七天没打开过的网站数据，已添加到主屏的应用不受这条计时器约束）。

**装好之后断网也能开。** Service Worker 在第一次访问时把**应用外壳**存下来 ——
脚本、样式、地图的美术、SQLite 的 wasm 和它的 Worker，约 6.3 MB / 61 个文件。
外壳是一次性整批下载的（少一个文件整次安装就作废），所以大件不放里面：

| 不进预缓存 | 什么时候缓存 |
|---|---|
| 24 MB 的字体分片（95 片，只按需要的那几片下） | 第一次用到那一片 |
| 两个职业数据集、mermaid、随包的中英词包 | 第一次打开用到它的界面 |
| 下载来的语言包（`/Breadcrumb/language-packs/*.json`） | 装的时候 |
| ONNX 运行时（`/Breadcrumb/ort/`）与 113 MB 的嵌入模型 | 第一次用嵌入时（模型由 transformers.js 自己的 Cache 管，不经 Service Worker） |

也就是说：**第一次访问很快，离线能力随着你用它而变完整**。
完全没浏览过就断网，缺的是那些还没碰过的界面，不是应用本身。
离线时点到一个还没缓存过的界面，那一块会空着（侧栏和别的页照常）；网络回来后**刷新一次**
它就有了 —— 浏览器会记住这一页里失败过的脚本，不刷新不会再去取。

更新是自动的（`registerType: "autoUpdate"`），不弹"有新版本"的对话框。

> Installable and offline-capable. The service worker precaches the shell — scripts,
> stylesheet, map artwork, SQLite's wasm and worker (~6.3 MB) — and caches everything heavy
> the first time it is actually used. A first visit stays fast; offline coverage completes
> itself as you use the app. A view you never opened before going offline stays blank until
> you are back online and reload once — the page remembers a script that failed to load. On
> iOS, add it to the home screen by hand: that also exempts its storage from WebKit's
> seven-day eviction timer.

---

## 存储

数据在浏览器的 **OPFS**（源私有文件系统）里。

**隔离的单位是「源」，不是网址路径。** 这一版部署在 `kali-leo.github.io` 上，与该账号下
其它所有 GitHub Pages 项目**同源** —— 那些页面上的脚本能打开这里的 `breadcrumb.db`，
读出包括 API 密钥在内的全部数据。别的网站读不到，同源的兄弟项目读得到。
介意的话请用桌面版。

> OPFS is isolated per **origin**, not per path. This build is served from
> `kali-leo.github.io`, the same origin as every other GitHub Pages project under that
> account, so script on any of those pages can open this app's `breadcrumb.db` and read
> everything in it, API key included. Other websites cannot; sibling projects on the same
> origin can. Use the desktop build if that matters to you.

- **无痕模式 / 禁用存储 / 浏览器太旧时**：应用照常工作，但**关掉标签页就没了**。
  这种情况启动时会有一条横幅明说是哪一种，不会让你白写一天。
- **多标签页**：数据库一次只允许一个标签页打开。在第二个标签页里打开这个应用，
  那一页会挂出横幅并变成临时会话，**在那一页里做的事不会存进库里**。
  回到原来那个标签页继续，或者关掉它再刷新。
- **清除浏览器数据会连它一起清掉**。这是浏览器的规矩，不是这个应用的选择。
  在意的话用桌面版。
- 启动时会调 `navigator.storage.persist()` 请浏览器不要在磁盘紧张时回收这块存储。
  Chrome 静默决定，Firefox 会弹一次询问，Safari 只对加到主屏的网页应用授予。
  没拿到授权也照常能用，只是浏览器保留了以后回收的权利。

---

## 备份与恢复

浏览器版的数据只存在这一个浏览器里，所以设置页最下面有「备份与恢复」：

- **导出一份备份** —— 下载整个数据库文件（`breadcrumb-YYYY-MM-DD.db`）。
  这就是桌面版能直接打开的那种 SQLite 文件。
- **从备份恢复** —— 选一个备份文件，确认后替换当前全部数据，然后页面刷新。
  文件先要过三道校验（SQLite 文件头、512 字节对齐、有可用槽位）才会写进去，
  选错文件不会动到现有数据。恢复是不可逆的，所以要点两次。

桌面版没有这一节：那边数据库本来就是磁盘上的一个文件，复制它就是备份。

> The browser edition keeps everything in this one browser, so Settings has a backup section:
> export the whole database as a file, or restore from one (which replaces everything and asks
> you to confirm first). The file is an ordinary SQLite database, the same shape the desktop
> build reads.

---

## 本地跑起来

```bash
pnpm install
pnpm --filter @breadcrumb/web dev
```

构建：

```bash
pnpm --filter @breadcrumb/web build          # 部署到 /Breadcrumb/（GitHub Pages）
BASE_PATH=/ pnpm --filter @breadcrumb/web build   # 部署到域名根目录
```

测试（跑真实迁移）：

```bash
pnpm --filter @breadcrumb/web test
```
