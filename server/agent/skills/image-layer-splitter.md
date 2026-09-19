# Image Layer Splitter

Use when the user invokes `/image-layer-splitter`, Image Layer Splitter, or `image-layer-splitter` (including obsolete `/image-layer-splitter-lite`, which enters this same Quality / Seedream flow). This dedicated workflow takes precedence over generic single-generator for separating objects/regions from a source image.

## Resolve image first

Check for an actual user-supplied source image FIRST. A bare tool mention without an image requires a short plain-chat upload request, then a pause. Do not call `ask_user` for `layer_selection_method`, `layer_split_plan`, or `layer_split_confirm` until the image is available. Never infer image contents from the tool mention or unrelated project assets.

## Resolve unspecified layers

When the image is available, but neither this request nor prior context identifies the objects/regions to separate, call **ask_user** for `layer_selection_method`. Do not choose objects from the image or call splitting tools yet.

Uploading supplies the source only. It does not authorize extracting all visible subjects. Show the method card next; a generation confirmation is not a substitute.

Call **ask_user** with question id `layer_selection_method` and the question "How would you like to specify the layers to extract?" Include **Draw boxes** (`draw_boxes`) and **Describe the layers** (`describe_layers`), plus Other with `allow_custom: true`. Recommend drawing boxes for precise selection. Follow the conversation language for card chrome. The **ask_user** tool call is required. Stop and wait.

- If they choose boxes, the card opens an inline image selection canvas. The user draws boxes and clicks Confirm regions. Up to 16 boxes. Do not ask for coordinates in chat. The card submits `imageSelections` with `imageUrl` and `regions` (0–1000). After confirm, the runtime attaches each **original image** plus a **boxed-overlay preview**. You will **not** receive bbox numbers — visually compare boxed vs original. After regions are submitted, do **not** generate yet. Continue to inspect-and-confirm.
- For multiple source images, retain each confirmed `imageUrl` and its own `regions`.
- If they choose description, continue to inspect-and-confirm. Do not start splitting immediately.
- If they skip the method question, recommend boxes; skipping does not identify layers.
- If boxes or a clear description already exist, reuse them and do not re-ask the method.

## Inspect and confirm before splitting

After **Draw boxes** or **Describe the layers**, you MUST look at the supplied image(s) before generating. Never ask the user in plain chat to verbally say what is in each box — identify objects yourself.

Call **ask_user** with exactly one question id `layer_split_confirm`. List **each** target on its **own line**. Short intro, then one line per element (e.g. `Box 1 (upper-left): round "?" help button`), then a confirmation question. If boxes were drawn, map each numbered box from the original + boxed overlay by appearance and position.

Options (exact ids):
- **Confirm** (`confirm`) — proceed to generate with Seedream layer decomposition.
- **Need to correct or add more** (`adjust`) — do not generate yet.
- **Other** with `allow_custom: true`.

Recommend `confirm` only when the read is clear. Do not call splitter tools in the same turn. Stop and wait.

- On **Confirm** (or skip that delegates to Confirm): continue to Generate. Use plain-language English **what** + **where** phrases. When boxes exist, pass confirmed `regions` but never put bbox coordinates into prompts/`targets`.
- On **adjust**: do not generate and **do not** reopen `layer_split_confirm` immediately. Call `layer_selection_method` again so the user can redraw boxes or re-describe. Only after they submit a **new** selection, run a fresh `layer_split_confirm`.
- On **Other**: treat as corrections; never generate until Confirm.

Reuse an already confirmed `layer_split_confirm` for an unchanged selection. Legacy `layer_split_plan` answers still count as confirmation when present.

## Generate

Call `model_image_layer_splitter` with confirmed `image_url` and `regions` / targets (Seedream layer decomposition). Follow the existing confirmation policy. Do not use P-Image Edit or Remove Background unless the user separately asks.
