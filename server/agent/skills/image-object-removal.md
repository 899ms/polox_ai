# Image Object Removal

Use when the user invokes `/image-object-removal`, Image Object Removal, `image-object-removal`, or clearly asks to remove objects from an image (对象移除 / remove object / erase object). This dedicated workflow takes precedence over generic image-editing and single-generator for object removal.

## Resolve image first

Identify the user's actual source still in this request (chat upload or clearly designated session/project image). If none is available, ask in a short plain-chat message to upload the image, then wait. Do not call `ask_user` or any generation tool until the image is present. Skipping cannot supply a missing image.

## Choose how to mark objects

Once a source image is available, decide whether a method card is needed:

1. **Already clear in text** — the user already named what to remove in this request (for example “移除掉图片里的两个人”, “remove the two people”, “erase the watermark in the corner”) together with the image. **Do not** call `ask_user` for `object_removal_method`. Treat the request as the **text description** path and continue under that section immediately. Do not ask them to pick annotate vs describe.
2. **Ambiguous / no removal target yet** — they only invoked the skill or uploaded an image without saying what to remove, or they clearly want to mark on a canvas. **Immediately** call **ask_user** with exactly one question id `object_removal_method` (the in-chat choice card / popup). Offer:
   - **Annotate** (`annotate`) — draw boxes and/or paint green masks on the objects to remove (recommended when they have not already described the target).
   - **Text description** (`describe`) — describe what to remove in natural language only.
   Plus Other with `allow_custom: true` (user can type the target there). Always recommend annotate via `recommended_id: "annotate"` on this card. Localize the question and labels to the conversation language. This card must contain only `object_removal_method` — no separate goal/category questionnaire.
   **Do not** ask what to remove in ordinary chat prose first. No “you haven’t specified what to remove” / “Could you let me know what object…” messages — the method card is the only prompt until they answer it. Wait for the answer; do not call a generation tool in the same turn.

Reuse an explicit method choice from this removal request rather than asking twice. Skipping a method card (when one was shown) delegates to text description; it does not invent boxes, masks, or removals. If the user cancels or asks to stop, stop without generating.

## Annotate path

Selecting `annotate` opens an inline canvas. The user may mix numbered bounding boxes and primary-green semi-transparent masks, fix mask edges with the eraser, and optionally label each object. Wait for Confirm; never invent coordinates or masks.

After confirm, the runtime attaches the **original image** plus a **rendered annotated overlay**. You will see numbered boxes and green masks visually — do not expect raw coordinates in the prompt.

### Inspect and confirm

You MUST review the original + overlay and any user labels before generating. Call **ask_user** with exactly one question id `object_removal_confirm`. Short intro, then **one line per object** with real newline characters between lines (e.g. `Box 1: red traffic cone near curb` then newline then `Mask 2: person on the left`), then a confirmation question. Do not jam every object into one paragraph.

Options (exact ids):

- **Confirm** (`confirm`) — proceed to generate.
- **Need to correct or add more** (`adjust`) — do not generate yet.
- **Other** with `allow_custom: true`.

Recommend `confirm` only when the read is clear. Do not call generation tools in the same turn. Stop and wait.

- On **Confirm** (or skip that delegates to Confirm): continue to Generate.
- On **adjust**: do not generate; call `object_removal_method` again so the user can re-annotate or switch to describe. Only after a **new** selection, run a fresh `object_removal_confirm`.
- On **Other**: treat as corrections; never generate until Confirm.

## Text description path

Entered when the user chose `describe`, skipped the method card, typed a target in Other, **or** already stated a clear removal target so the method card was skipped. Reuse the removal description already supplied in this request (including Other custom text). If they chose `describe` but still gave no target, call **ask_user** once more with a short `object_removal_target` question (prompt + Other/custom) — do not fall back to plain-chat paragraphs. Optimize the user's wording into a clear English image-to-image removal prompt. Do not invent objects that were not requested. Do not reopen `object_removal_method` after a clear text request.

## Generate

Default model: **GPT Image 2.5 Sunburst Image to Image** (`model_gpt_image_2_5_sunburst_image_to_image`) unless the user named another Image to Image model.

- **Annotate path:** send `[original imageUrl, annotatedImageUrl]` in that order via the model's reference-array field (`input_urls` for GPT Image, `image_urls` for Seedream / Nano Banana Lite, `image_input` for Nano Banana 2 / Pro). Write the removal prompt from the confirmed objects, e.g. remove box 1's X and green mask 2's Y. Image 1 is the photo to edit; image 2 is a location guide only. Preserve untouched areas; do not leave numbered markers, boxes, or green mask overlays in the finished output.
- **Text path:** send the original image only with the optimized removal prompt.

**Resolution:** for this workflow and other default 1K/2K/4K Image to Image models, omit guessing a fixed 1K — the runtime selects 1K/2K/4K from the source image dimensions (nearest tier, respecting model aspect constraints). You may still pass `aspect_ratio: "auto"` unless the user requested a specific ratio. Follow the existing credit policy. Do not replace the user's confirmation with a spending card unless required.

Generate once for the confirmed request and return the actual output. Failed or pending results do not authorize automatic retries.
