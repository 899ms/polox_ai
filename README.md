<p align="center">
  <img src="public/brand/polox-logo.png" alt="PoloX AI logo" width="140" />
</p>

<h1 align="center">PoloX AI — Multimodal AI Agent</h1>

<p align="center">
  An open-source multimodal AI agent platform, built on DeepSeek Harness.
</p>

<p align="center">
  <a href="LICENSE">MIT License</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  If you run into a problem you cannot resolve, contact me on <a href="https://discord.gg/FwN6s664Dh">Discord</a>.
</p>


<div style="overflow-x: auto; white-space: nowrap; max-width: 100%; margin: 1rem 0 1.5rem; padding-bottom: 0.5rem;">
  <img src="docs/images/polox-readme-01-hero.jpeg" alt="PoloX AI — The agent-native creative platform" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-02-unified-space.jpeg" alt="PoloX AI — One unified space for agent chat and infinite canvas" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-03-skills.jpeg" alt="PoloX AI skills — Sketch to Image, Image Text Editor, Layer Splitter, Product Hunt gallery" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-04-models.jpeg" alt="PoloX AI — Latest AI image and video models in one workspace" height="280" style="display: inline-block; margin-right: 8px; border-radius: 8px;" />
  <img src="docs/images/polox-readme-05-utilities.jpeg" alt="PoloX AI — Everyday utilities for images and videos" height="280" style="display: inline-block; border-radius: 8px;" />
</div>

## Introduction

This is the open-source edition of [PoloX AI](https://polox.ai), a creative platform in the same space as [Lovart](https://lovart.ai) and [Crepal](https://crepal.ai). PoloX takes an **agent-native** approach: agent conversations and an infinite canvas bring creation, generation, and editing into one continuous workflow. Describe what you want, work with the agent, and refine the results on the canvas.

PoloX runs locally with Nuxt, Vue, and SQLite. Bring your own [WaveSpeed](https://wavespeed.ai) API key; no PoloX account or subscription is required. Projects, conversations, generation history, and media are stored on your machine. AI inference uses external providers, so relevant inputs are sent to those services and their API charges apply. WaveSpeed supports checkout with credit cards, WeChat Pay, and Alipay.

## Updates

### September 13, 2026

- Added GPT Image 2.5 Flare and Sunburst models
- Added Product Hunt skill
- Added Sketch to Image skill
- Added annotation/comment image editing skill
- Switched the API provider to [WaveSpeed.ai](https://wavespeed.ai) for easier checkout with credit cards, WeChat Pay, and Alipay
- Improved agent prompts and skill structure; removed redundant content
- Fixed other known bugs

## How to update

Tell Codex:

```text
Pull the latest code from https://github.com/saihhold-zhao/polox_ai and install dependencies.
```

⚠️ If you have already modified the local code, you may hit merge conflicts. Ask Codex to help resolve them.

## Install with Codex

Create a new task in Codex and send this prompt:

```text
Help me install PoloX AI locally:
1. Check that Node.js 22.20 or newer and pnpm are installed. Install any missing prerequisites.
2. Install FFmpeg, including ffprobe, for video concatenation and verify that both commands are available.
3. Clone https://github.com/saihhold-zhao/polox_ai and open the project directory.
4. Run pnpm i to install dependencies.
```

## Run locally with Codex

Whenever you want to use PoloX, open the project in Codex and send:

```text
Run pnpm dev in this project and open the local page in the browser. Keep the server running while I use the app.
```

The default address is [http://localhost:3001](http://localhost:3001). **You do not need to run `pnpm build` for everyday local use.**

## Run manually

You need **Node.js 22.20 or newer** and **pnpm**. For the first run:

```sh
git clone https://github.com/saihhold-zhao/polox_ai.git
cd polox_ai
pnpm i
pnpm browser:install
pnpm dev
```

For subsequent runs, open a terminal in the project directory and run:

```sh
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) and keep the terminal running. Press `Ctrl+C` to stop the server.

The home page includes Skills for Sketch to Image, Image Text Editor, Image Layer Splitter, and Product Hunt gallery. Select a card or type `/` in the agent composer. Starting a sketch from home creates a new agent in your project. Product Hunt website inspection uses Playwright Chromium; on Linux, install its system dependencies with `pnpm browser:install:linux`.

### FFmpeg for video concatenation

Install **FFmpeg and ffprobe** to stitch generated clips into longer videos. Uploads and AI generation do not require them, and `pnpm i` does not install them.

macOS with Homebrew:

```sh
brew install ffmpeg
```

Ubuntu / Debian:

```sh
sudo apt update
sudo apt install ffmpeg
```

On Windows, install an FFmpeg build that includes both tools and add its `bin` directory to your `PATH`. Verify the installation in the terminal used to run PoloX:

```sh
ffmpeg -version
ffprobe -version
```

Restart the development server after installing these tools.

## Connect WaveSpeed

1. Start PoloX and click the red **API key not configured** indicator in the top-right corner.
2. In the **Service connection** dialog, use the **Get API key** link to obtain your [WaveSpeed key](https://wavespeed.ai/accesskey).
3. Paste the key and click **Test connection**.
4. Once the test passes, the indicator turns green and reads **Services connected**. You are ready to create.

The agent LLM is locked to `moonshotai/kimi-k3`; you do not need to choose a model in the dialog. Connection testing sends a short model request and may incur a small API charge.

## Available AI models

The **Frontier AI models** section on the homepage lists the integrated models. To ask the agent to use a particular model, select it with **@** in your message.

## Creative tools

| Tool | What you can do |
| --- | --- |
| **Sketch to Image** | Select `@sketch-to-image` to draw lines and text in the project chat. Save the sketch to the project, optionally upload or select reference images, then confirm the agent's understanding to generate with GPT Image 2.5 Flare. Supports moving and rotating elements, text sizing, and undo/redo. Requires a configured WaveSpeed service. |
| **Image Text Editor** | Edit text inside images. Ask the PoloX agent how to proceed. You can upload multiple images for batch editing. |
| **Image Layer Splitter** | Extract selected elements from an image as separate layers. Upload an image and ask the agent to split it; the agent will guide you through selecting elements or drawing boxes. |
| **Image Background Removal** | Remove an uploaded image's background and keep a transparent PNG. |
| **AI Image Editor** | Upload an image and describe your changes in natural language. Uses image-to-image models. |
| **AI Video Editor** | Upload a video and describe your changes in natural language. Uses reference-to-video models. |

## Long-form video generation

Ask the agent to create a five-minute, ten-minute, or longer video. The workflow generates individual shots with AI video models, then stitches them into a continuous video using FFmpeg. The maintainer has tested ten five-minute videos, with results meeting expectations; this is an early workflow, and results depend on the models and creative brief.

A typical workflow looks like this:

1. **Plan the storyboard.** The agent works from your brief to plan scenes and shots.
2. **Establish the characters.** The agent creates character reference sheets, such as three-view references. You can also upload your own character images and ask the agent to use them.
3. **Create first frames.** The agent uses the character references to generate a first-frame image for each shot, helping maintain visual consistency.
4. **Generate the clips.** Video models turn the planned shots and reference images into video segments.
5. **Assemble the video.** Once the clips are ready, the agent stitches them together in storyboard order.

After assembly, continue the conversation to revise shots or add scenes. You can guide the whole process through the agent.

The [long-form video skill](server/agent/skills/long-form-video.md) defines this workflow and still has room for improvement—for example, using audio references to maintain consistent character voices. Suggestions and contributions are welcome through [Issues](https://github.com/saihhold-zhao/polox_ai/issues).

## Troubleshooting and feedback

If installation or usage goes wrong, ask Codex to inspect the error and help you resolve it. Share the relevant error message and what you were trying to do.

If you find a bug or an improvement that would help other users, please [open an issue](https://github.com/saihhold-zhao/polox_ai/issues). Codex can help you draft and submit it. Include steps to reproduce, your operating system, and relevant logs; remove API keys and other private information before sharing.

## Local data

PoloX stores its SQLite database at `.data/polox.sqlite` and media under `.data/media`. Back up the entire `.data` directory with the server stopped to preserve your projects and files. API keys are stored in the local database, so keep backups private.

This edition is intended for local use. Its workspace routes do not require authentication; keep the app on your machine or a private network.

## Open-source foundations

Thanks to the projects that make PoloX possible:

| Role | Project |
| --- | --- |
| Application framework | [Nuxt](https://github.com/nuxt/nuxt) |
| UI foundation | [shadcn/ui](https://github.com/shadcn-ui/ui) and its Vue ecosystem |
| UI template | [nuxt-shadcn-dashboard](https://github.com/dianprata/nuxt-shadcn-dashboard) |
| Agent harness | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) |

## License

Released under the [MIT License](LICENSE). Original third-party copyright and license notices are retained.

## Contact

If you run into a problem you cannot resolve, contact me on [Discord](https://discord.gg/FwN6s664Dh).
