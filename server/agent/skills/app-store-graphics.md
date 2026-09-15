# App Store Graphics

The public command `/app-store-graphics` explicitly invokes this skill. Use when the user asks for App Store screenshots, iPhone marketing graphics, App Store preview images, or similar phone-frame launch visuals. Selecting the skill alone is a request to start this workflow: if no app screenshots are attached yet, briefly ask them to upload several real app screenshots (recommend 2–6), then wait. Do not generate without at least one usable screenshot.

Create a coherent set of App Store graphics where each final image shows a realistic **iPhone 17 Pro Max** device: the **screen content is one of the user's uploaded screenshots**, and the **area outside the phone** (background, props, typography, accents) follows a shared visual system derived from those screenshots. Each final is an **independent** 9:16 marketing frame (one screenshot → one graphic). Do **not** plan left/right continuous scenes, diptychs, panorama crops, or stitchable adjacent panels unless the user explicitly asks for that later.

## Established output settings — do not ask again

Default model family: **GPT Image 2.5 Flare** only (`model_gpt_image_2_5_flare_image_to_image` for board and finals; `model_gpt_image_2_5_flare_text_to_image` only if a rare text-only revision has no image refs). Do not switch to Sunburst, GPT Image 2, Seedream, or other families unless the user explicitly overrides.

Fixed formats at **1K**:
- **Visual design board: 9:16 portrait**, `aspect_ratio: "9:16"`.
- **Final App Store graphics: 9:16 portrait**, `aspect_ratio: "9:16"` (phone marketing frame).
- Target feel: Apple App Store iPhone 6.9″ / Pro Max style portrait marketing shots (commonly ~1290×2796 class). Exact App Store pixel export is not required in v1 unless the user asks later.

These model / ratio / resolution settings are settled. Do not ask which aspect ratio, orientation, resolution, or model to use. Generic model-planning / single-generator settings questionnaires do not apply here. Before any `ask_user` call, strip questions about these settled settings. **Do** still ask for on-image copy language as specified below — that is not a settled setting.

## Gather app screenshots and product facts

**Required:** one or more real app screenshots uploaded in this request or clearly designated from the session/project. Prefer portrait phone UI captures. Reject or ignore unrelated photos as screen content.

**Strongly preferred:** 2–6 screenshots covering distinct screens or features. If only one is supplied, continue with a single graphic after confirmation.

**Optional:** app / brand name, short feature bullets, logo, tagline. Infer features and UI chrome from the screenshots when the user does not provide copy. Do not invent capabilities that are not visible or stated.

Do **not** require a website URL. Do not call `inspect_website` unless the user explicitly provides a URL and asks to use it. Screenshot analysis is the primary evidence.

When screenshots arrive, visually inspect them. Extract:
- App name / wordmarks visible on screen (if any)
- Dominant colors, surfaces, typography feel, corner radii, icon style
- Concrete features and UI patterns visible (tabs, charts, maps, chat, etc.)
- Which screenshot best suits an overview vs feature callouts

Distinguish observed UI from marketing copy you propose later.

## Confirm on-image copy language

After at least one usable screenshot is available (and before generating the design board), call `ask_user` with exactly one question id `app_store_copy_language`. Ask which language to use for **marketing copy rendered on the design board and final graphics** (headlines, feature callouts, captions outside the phone). This does not change the chat interaction language.

Offer:
- `en_us`: **English (United States)** — recommend this; set `recommended_id: "en_us"`.
- `other`: **Other**, with `allow_custom: true` so the user can type a language (e.g. “中文”, “日本語”, “Español”).

Put a short recommendation that English (US) is the default for App Store creatives unless they need another market. Wait for the answer or explicit skip; skip delegates to English (US). Validate a custom Other answer as a real language/locale name; if unclear, ask once to clarify. Do not generate the board or mockups in the same turn as this card. Do not mix this question with brief confirmation or image count.

Remember the chosen copy language for every later board and graphic prompt. In-phone UI from screenshots stays as photographed; only agent-written on-image marketing text uses this language.

## Generate the visual design board first

Once at least one usable screenshot exists **and** copy language is resolved, generate ONE visual design board **before** any phone mockup. The board establishes the shared look for the area *outside* the phone (background, accents, typography treatments, prop language). It is a preparation asset, not an App Store upload.

### Fixed board settings
- Model: **GPT Image 2.5 Flare**
- `aspect_ratio: "9:16"`, `resolution: "1K"`, `background: "opaque"`
- `_name`: **App Store · Visual design board** (interaction language)
- **No white borders:** full-bleed 9:16 edge-to-edge

Use `model_gpt_image_2_5_flare_image_to_image` with `input_urls` containing the most representative uploaded screenshots (typically 1–3). This creates a **new** design-system board inspired by those screens — not an image-edit of a single screenshot. Do not open the image-editing annotate/describe method card for this stage.

### What the board should show
A clean portrait design board with readable internal spacing (outer white margins forbidden):
1. App / brand identity from the screenshots (name in type if no logo asset)
2. Color palette (4–6 swatches with roles + HEX)
3. Typography hierarchy samples
4. Shape / spacing / accent language
5. Phone-framing guidance: **front-facing, large** iPhone 17 Pro Max silhouette (~60%+ of frame height), not a tilted 3D mockup — placeholder screen only, not invented UI
6. One mini composition showing headline + large front phone placement (headline specimen in the confirmed copy language)

Wait for the board result. Inspect it. Keep a short textual record of palette and framing rules. Show the board with a concise caption. Use its **actual result URL** as the style reference for every later graphic.

## Confirm brief after the board

Show the successful board, then call `ask_user` with one question id `app_store_brief_confirmation`. Put the **full concrete summary only in the top-level `prompt`** (not in the question text):
- App name (from UI or user, or “Unknown — use generic product wording”)
- How many screenshots will become graphics (list them by short labels you assign, e.g. Home / Stats / Profile)
- Key features you will highlight (from screenshots / user)
- Visual direction one-liner from the board

Keep the question `prompt` short, e.g. “Are these brand details correct?”. Never paste the whole brief into the question `prompt`.

Options: `confirm` (“Everything is correct”), `modify` (allow_custom), `other` (allow_custom). Wait for explicit confirmation. Skip is not confirmation — briefly re-ask. Do not generate mockups in the same turn.

If modifications require a materially different visual direction, revise the board with Flare first, then re-confirm.

## Confirm graphic count

Only after brief confirmation, call `ask_user` with exactly one question id `app_store_image_count`. Recommend **one final graphic per uploaded screenshot** (same order), optionally allowing the user to drop weak screens. State the mapping in the card (e.g. “I recommend 3 images: Home, Activity, Profile”). Offer the recommended count, a useful alternative if any, and Other with allow_custom. Wait; skip delegates to the stated recommendation. Do not generate in the same turn.

## Phone framing (all finals — mandatory)

Every final App Store graphic must obey:
- **Front-facing phone only:** orthographic / straight-on product shot. Flat to camera. **No 3D tilt, no three-quarter view, no perspective foreshortening, no standing-on-a-table hero angle.** Thin bezel frame around the screen is fine; do not show thick side edges or depth that reads as a tilted device.
- **Large phone scale:** the device (bezel + screen) must dominate the frame — roughly **55–75% of the image height** and a clear majority of the width. Do not shrink the phone into the lower third with a huge empty lifestyle backdrop above it.
- Screen content = the uploaded screenshot, sharp and readable; do not redesign in-phone UI.
- Soft contact shadow optional; avoid dramatic floor reflections that force a 3D standing pose.
- Marketing headline sits in the remaining margin (usually above or beside), using the confirmed copy language. Keep type secondary to the large phone.

## Generate iPhone 17 Pro Max App Store graphics

Generate only after: resolved copy language + successful design board + confirmed brief + answered/skipped count card.

For **each** final graphic, call `model_gpt_image_2_5_flare_image_to_image` with:
- `aspect_ratio: "9:16"`
- `resolution: "1K"`
- `background: "opaque"`
- `input_urls`: exactly **two** URLs in this order:
  1. the latest successful **visual design board** URL
  2. the **specific uploaded screenshot** for this graphic
- `_name`: e.g. `App Store · 2 · Discover`
- English `prompt` that states reference roles clearly (keep short — do not paste this whole skill):
  - Image 1 = visual design board (palette, typography, background, accents, framing — NOT screen content)
  - Image 2 = the exact app UI that must fill the iPhone screen (preserve pixels/layout; do not redesign the in-phone UI)
  - Depict a realistic **iPhone 17 Pro Max**, **front-facing / straight-on only** (current Pro Max proportions, thin bezels, Dynamic Island era face — do not label Apple trademarks). **No 3D tilt or three-quarter view.** Screen content must be Image 2, flat-mapped into the display, sharp and readable.
  - **Large phone:** device fills ~55–75% of image height; do not leave the phone tiny in the lower third.
  - Outside the device: follow Image 1’s system (background + accents). Optional short marketing headline above/beside the phone uses the **confirmed on-image copy language** from `app_store_copy_language`.
  - Full-bleed 9:16, **no white borders**, no empty letterboxing, no floating card on blank white.
  - Do not invent UI inside the phone. Do not replace Image 2 with a restyled fake screenshot.
  - Do **not** describe left/right diptychs, continuous seams, or panorama crops.

Submit generation only after both confirmation cards are resolved. After generation, inspect results: correct screenshot on screen, front-facing large phone, consistent exterior style, readable text, no white outer borders. Deliver in order with short captions. Do not claim App Store upload-pixel compliance unless an export step was actually run. `export_zip` with `preset: "original"` is optional if the user asks for a download pack; there is no App Store pixel preset yet.
