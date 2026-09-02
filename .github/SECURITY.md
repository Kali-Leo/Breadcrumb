# 安全问题上报 / Reporting a vulnerability

## 怎么报

**请不要开公开 issue。** 到本仓库的 **Security** 标签页 → **Report a vulnerability**，
GitHub 会开一个只有维护者能看到的私密通告草稿，讨论全程不公开。

报告里请尽量带上：受影响的版本或 commit、复现步骤、以及你认为的影响面。
概念验证代码很有帮助，但不是必需的 —— 说不清细节也请先报，别因为写不完整就不报。

## 你能指望什么

- **7 天内**给出首次回复：我们是否复现出来了，以及打算怎么处理。
- 修复期间会告诉你进展。修好之后，如果你愿意，会在通告里署名致谢。
- 如果我们判断某个问题不修，会把理由讲清楚，而不是让报告石沉大海。

这是一个人在维护的项目，不是有值班表的团队。7 天是我们对自己的要求，不是 SLA。

## 支持范围

**只有最新的 release**。旧版本不打补丁 —— 修复会随下一个 release 发布，请升级。

`main` 分支上尚未发布的代码同样欢迎上报。

## 不在范围内

- 需要攻击者已经拿到你机器上的用户账号才能成立的问题（本地明文存储的 API 密钥属于
  **已知且已记录**的取舍，见 `documentation/privacy-and-cost.md`）。
- 浏览器版与 `kali-leo.github.io` 上其它 GitHub Pages 项目同源导致的数据可见性 ——
  这是**已知问题**，`apps/web/README.md` 的「存储」一节写明了，真正的修法是换独立域名。
- 第三方 AI 服务商自己的问题，请报给他们。

---

## How to report

**Please do not open a public issue.** Use this repository's **Security** tab →
**Report a vulnerability**. That opens a private draft advisory visible only to the
maintainers; the whole discussion stays private.

Include what you can: the affected version or commit, steps to reproduce, and what you
believe the impact is. A proof of concept helps but is not required — report it even if
you cannot pin down the details.

## What to expect

- A **first reply within 7 days**: whether we reproduced it and what we intend to do.
- Progress updates while a fix is in flight, and credit in the advisory if you want it.
- If we decide not to fix something, you get the reasoning rather than silence.

This is a project maintained by one person, not a team with an on-call rota. Seven days is
a commitment we hold ourselves to, not an SLA.

## Supported versions

**The latest release only.** Older releases do not get patches; fixes ship in the next
release, so upgrade. Unreleased code on `main` is in scope too.

## Out of scope

- Issues that require the attacker to already have your user account on your machine. The
  API key stored in plaintext locally is a **known, documented** trade-off — see
  `documentation/privacy-and-cost.md`.
- Data being readable from other GitHub Pages projects sharing the `kali-leo.github.io`
  origin with the browser edition. This is **known** and written up in the storage section
  of `apps/web/README.md`; the real fix is a separate domain.
- Problems in a third-party AI provider. Report those to the provider.
