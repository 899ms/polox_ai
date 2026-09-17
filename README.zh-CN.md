<p align="center">
  <img src="public/brand/polox-logo.png" alt="PoloX AI 标志" width="140" />
</p>

<h1 align="center">PoloX AI — Agent 驱动的多模态生成工作台</h1>

<p align="center">
  生成、编辑与修改，无需手动操作生成器；用聊天搞定一切，结果呈现在无限画布上。
</p>

<p align="center">
  <a href="LICENSE">MIT 协议</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  💬微信：SaihholdZhao<br />
  📪邮箱：<a href="mailto:saihhold.chiu@gmail.com">saihhold.chiu@gmail.com</a><br />
  𝕏 X：<a href="https://x.com/saihholdzhao">@saihholdzhao</a>
</p>

<p align="center">
  遇到无法解决的问题，请通过 <a href="https://discord.gg/FwN6s664Dh">Discord</a> 联系我。
</p>


<div style="overflow-x: auto; white-space: nowrap; max-width: 100%; margin: 1rem 0 1.5rem; padding-bottom: 0.5rem;">
  <img src="docs/images/polox-readme-01-hero.jpeg" alt="PoloX AI — Agent 原生创作平台" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-02-unified-space.jpeg" alt="PoloX AI — Agent 对话与无限画布统一工作区" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-03-skills.jpeg" alt="PoloX AI 技能 — Product Hunt、App Store Graphics、草图生图、标注编辑等" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-04-models.jpeg" alt="PoloX AI — 一站式图像与视频模型工作区" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-05-utilities.jpeg" alt="PoloX AI — 图片与视频日常工具" height="280" style="display: inline-block; border-radius: 8px;" />
</div>

## 简介

本项目是 [PoloX AI](https://polox.ai) 的开源版本，与 [Lovart](https://lovart.ai)、[Crepal](https://crepal.ai) 同属 AI 创作平台。PoloX 采用 **Agent 原生**的产品设计：以 Agent 对话与无限画布承载全部交互，将创作、生成与编辑融入连续的工作流程。你只需描述想法，与 Agent 沟通，并在画布上持续完善结果。

PoloX 基于 Nuxt、Vue 和 SQLite 在本地运行。使用自己的 [WaveSpeed](https://wavespeed.ai) API Key 即可，无需注册 PoloX 账号或订阅。项目、资源库、对话、生成记录和媒体文件保存在本机；AI 推理由外部服务提供，相关输入会发送给服务商，API 使用费用由服务商收取。WaveSpeed 支持信用卡、微信和支付宝结账。

## 更新

### 2026 年 9 月 17 日 — v1.3.1

- 优化拆分图层画框流程：改为对比原图与标注预览图识别拆分意图，不再依赖原始坐标；确认卡展示同一张标注预览

### 2026 年 9 月 16 日 — v1.3.0

- 新增 **资源库（Asset Libraries）**：在本地整理可跨项目复用的图片 / 视频 / 音频
- 在 Agent 输入框用 `@` 搜索并导入资源库素材（独立第三列，与项目资产并列）
- 项目画布可将生成结果一键保存到资源库
- 优化 **图层拆分** 流程：拆分前先由 Agent 检视画面，再确认 / 调整（Confirm / Adjust），目标逐行列出更清晰
- 画布缩放范围放宽至约 2%–800%
- 删除文案更明确：删除的是项目中的资产，不会从资源库移除
- 其他小修复与体验优化

### 2026 年 9 月 16 日 — v1.2.0

- 新增 **Annotated Image Edit**、**App Store Graphics** 技能
- 聊天区支持拖拽添加附件；点击附件直接打开 lightbox
- 默认图生图路径改为 **GPT Image 2.5 Sunburst**
- Thinking / 选项卡 / 确认卡支持长文本折叠
- 结果评估在疑似不匹配时先询问再重生成（禁止静默自动重试）
- 长视频生成可使用 **参考声音**，便于角色声音更一致
- README 的 Skills 说明与 `/` 技能选择器对齐
- **修复：** Agent 思考 / 确认 / 提问时，旧聊天里的确认卡、提问卡和媒体不再丢失
- 其他小修复

### 2026 年 9 月 13 日 — v1.1.0

- 接入 GPT Image 2.5 Flare 和 Sunburst 两个模型
- 增加了 Product Hunt、草图到图像等 skill
- API provider 改为 [WaveSpeed.ai](https://wavespeed.ai)，便于使用信用卡 / 微信 / 支付宝结账
- 优化了 Agent 的 prompt、skill 结构，去除冗余内容
- 修复了其他已知 bug

## 如何更新

和 Codex 说：

```text
拉取 https://github.com/saihhold-zhao/polox_ai 最新代码并安装依赖。
```

⚠️ 若您已经修改了当前代码，可能产生代码冲突，可通过 Codex 进行解决。

## 使用 Codex 安装

在 Codex 中创建一个新任务，发送以下内容：

```text
请帮我在本地安装 PoloX AI：
1. 检查是否已安装 Node.js 22.20 或更新版本，以及 pnpm；如有缺失，请安装。
2. 安装 FFmpeg（包含 ffprobe），用于视频拼接，并确认这两个命令可用。
3. 克隆 https://github.com/saihhold-zhao/polox_ai 并进入项目目录。
4. 执行 pnpm i 安装依赖。
```

## 使用 Codex 本地运行

每次使用时，在 Codex 中打开本项目，发送：

```text
请在本项目中执行 pnpm dev，并在浏览器中打开本地页面。使用期间请保持服务运行。
```

默认地址为 [http://localhost:3001](http://localhost:3001)。**日常本地使用无需执行 `pnpm build`。**

## 手动运行

请先安装 **Node.js 22.20 或更新版本**和 **pnpm**。首次运行：

```sh
git clone https://github.com/saihhold-zhao/polox_ai.git
cd polox_ai
pnpm i
pnpm browser:install
pnpm dev
```

之后每次使用，只需在项目目录中打开终端，执行：

```sh
pnpm dev
```

打开 [http://localhost:3001](http://localhost:3001)，使用期间保持终端运行。按 `Ctrl+C` 可停止服务。

侧栏的 **资源库（Asset Libraries）** 可导入共享素材，并在任意项目中用 `@` 引用。首页 **Skills** 目前包含：Product Hunt gallery、App Store Graphics、草图生图、图片文字编辑、Annotated Image Edit、图层拆分、长视频生成。点击卡片，或在 Agent 输入框输入 `/` 即可选择技能。从首页启动草图会在项目中新建 Agent。Product Hunt 网站读取使用 Playwright Chromium；Linux 环境可运行 `pnpm browser:install:linux` 安装所需系统依赖。

### 安装 FFmpeg：用于视频拼接

将生成的视频片段拼接成长视频，需要安装 **FFmpeg 和 ffprobe**。普通上传和 AI 生成不依赖它们，`pnpm i` 也不会自动安装它们。

macOS（使用 Homebrew）：

```sh
brew install ffmpeg
```

Ubuntu / Debian：

```sh
sudo apt update
sudo apt install ffmpeg
```

Windows 用户请安装同时包含这两个工具的 FFmpeg 版本，并将其 `bin` 目录加入 `PATH`。在启动 PoloX 的终端中验证：

```sh
ffmpeg -version
ffprobe -version
```

安装完成后，请重新启动开发服务。

## 获取并配置 WaveSpeed API Key

1. 启动 PoloX，点击右上角红色的 **API key not configured**（尚未配置 API Key）提示。
2. 在 **Service connection**（服务连接）弹窗中，通过 **Get API key** 链接获取 [WaveSpeed Key](https://wavespeed.ai/accesskey)。
3. 将 Key 填入输入框，点击 **Test connection**（连通测试）。
4. 测试通过后，提示会变为绿色的 **Services connected**（服务已连接），即可开始创作。

Agent LLM 已锁定为 `moonshotai/kimi-k3`，界面无需再选择模型。连通测试会发送一次简短的模型请求，可能产生少量 API 费用。

本项目需要支持图像理解的 **视觉大模型**。在已测试过的模型里，Kimi 的表现相对更稳。若你有更合适或更具性价比的替代方案，欢迎在 [Issue](https://github.com/saihhold-zhao/polox_ai/issues) 提出建议。

## 已接入的 AI 模型

首页的 **Frontier AI models** 区域展示了已接入的模型。如果希望 Agent 使用特定模型，请在消息中通过 **@** 选择并指定。

## Skills

可在首页选择技能，或在 Agent 输入框输入 `/` 唤出技能列表。Skill 是由 Agent 引导完成的专用工作流。

| 技能 | 功能与用法 |
| --- | --- |
| **Product Hunt gallery** | 根据网站或产品信息生成风格统一的 Product Hunt 发布图。 |
| **App Store Graphics** | 将应用截图做成风格统一的 App Store 展示图。 |
| **Sketch to Image · 草图生图** | 输入 `/sketch-to-image`，在对话内绘制线条和文字；保存草图后可附加参考图，确认理解后用 GPT Image 2.5 Flare 生成。支持移动/旋转、字号、撤销重做。 |
| **Image Text Editor · 图片文字编辑** | 编辑图片中的文字，尽量保留字体与版式；支持批量上传。 |
| **Annotated Image Edit · 标注编辑** | 在图上标注点位并描述每处修改，做更精确的编辑。 |
| **Image Layer Splitter · 图层拆分** | 框选对象，拆成独立的透明 PNG 图层。 |
| **Long-form video · 长视频生成** | 规划分镜、生成多镜头片段，再用 FFmpeg 拼接。 |

以上 Skills 之外，仍可用自然语言让 Agent 做开放式图片/视频编辑（含去背景等）。

## 长视频生成

你可以让 Agent 制作 5 分钟、10 分钟或更长的视频。它会调用 AI 视频模型生成多个分镜片段，再通过 FFmpeg 拼接成连续视频。维护者目前已测试 10 个 5 分钟的视频，结果符合预期；这套工作流仍处于早期阶段，实际效果取决于所选模型和创作需求。

典型流程如下：

1. **规划分镜**：Agent 根据你的描述，规划场景与镜头内容。
2. **确定角色形象**：生成角色参考图，例如角色三视图。你也可以上传自己的角色图片，并明确要求使用该形象。
3. **生成分镜首帧**：以角色参考图为基础，为各分镜生成首帧图片，帮助保持角色的视觉一致性。
4. **生成视频片段**：调用视频模型，根据分镜与参考图生成各个片段。
5. **拼接完整视频**：所有片段完成后，按分镜顺序自动拼接。

视频拼接完成后，你仍可以通过对话要求 Agent 修改镜头或补充场景，整个创作过程都可以围绕与 Agent 的沟通展开。

生成时可以附带 **参考声音（reference audio）**，让角色在不同镜头里更接近同一音色或声音方向（Seedance 参考生视频路径支持 `reference_audios`）。

这套流程由[长视频生成 Skill](server/agent/skills/long-form-video.md) 定义，仍处于早期阶段。欢迎通过 [Issue](https://github.com/saihhold-zhao/polox_ai/issues) 提出建议或参与改进。

## 问题排查与反馈

安装或使用过程中遇到问题，可以先让 Codex 检查报错并协助解决。提供相关错误信息，以及问题发生前的操作，有助于定位原因。

如果发现值得修复的问题，或有对其他用户也有帮助的建议，欢迎[提交 Issue](https://github.com/saihhold-zhao/polox_ai/issues)。不熟悉操作也没关系，可以让 Codex 帮你整理并提交。请附上复现步骤、操作系统和相关日志，并在分享前删除 API Key 等私密信息。

## 本地数据

SQLite 数据库保存在 `.data/polox.sqlite`，媒体文件保存在 `.data/media`。请停止服务后备份整个 `.data` 目录，以保留项目、资源库和文件。API Key 也保存在本地数据库中，请妥善保管备份。

本版本面向本地使用，工作区接口无需身份验证，请在本机或私有网络中运行。

## 使用到的开源项目

感谢以下项目为 PoloX 提供基础：

| 用途 | 项目 |
| --- | --- |
| 应用框架 | [Nuxt](https://github.com/nuxt/nuxt) |
| UI 基础 | [shadcn/ui](https://github.com/shadcn-ui/ui) 及其 Vue 生态 |
| UI 模板 | [nuxt-shadcn-dashboard](https://github.com/dianprata/nuxt-shadcn-dashboard) |
| Agent Harness | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) |

## 开源协议

本项目采用 [MIT 协议](LICENSE)，并保留第三方项目原有的版权与许可声明。

## 联系我

遇到无法解决的问题，请通过 [Discord](https://discord.gg/FwN6s664Dh) 联系我。
