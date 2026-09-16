# Single generator

Use this skill when the user invokes a generator for a standalone image, edit, cutout, layer split, or single video clip, especially through an explicit model name or @[Name](model:id). Follow model-planning for exact model selection and schema validation. For a long film, storyboard, or multi-shot production, use long-form-video instead; do not add a second set of standalone checkpoints to its intermediate generations.

For edits to an existing image, follow image-editing first. If the user already stated a clear modification request, image-editing proceeds to generation without the annotate/describe card; only ask annotate vs describe when no clear change was specified.

## Check the brief before generation

Read the selected tool's input schema and reuse the user's instructions, previous answers, and designated session media. An @ mention selects the model and task; it does not specify a subject, visual style, or output settings.

Resolve missing required inputs and meaningful creative/output choices with **ask_user** before calling a paid tool. This checkpoint also applies with Automatic generation approval. A spending confirmation or _uncertain_fields is not a substitute for answering these questions.

- **Creative direction:** if the request is only a model mention, ask what to create. If it is vague (such as “a cat”, “make a nice image”, or “animate this”), offer a few concrete directions grounded in the supplied subject or reference. Combine subject, setting, composition, and style into coherent proposals when that avoids several tiny questions. Do not silently turn your proposal into the user's intent.
- **Image settings:** resolve aspect ratio and resolution/quality when exposed by the selected schema and not already supplied or clearly implied by the intended use. A phone wallpaper can establish orientation; it does not establish an exact resolution. Offer documented defaults as recommendations, not as already confirmed answers. Do not ask for a style when a detailed prompt or explicitly designated style reference already settles it.
- **Video settings:** resolve the intended action/motion, clip duration, supported resolution, ratio when configurable, and sound when supported. Offer only settings legal for the selected model and input mode. If dialogue, narration, or singing is requested, resolve the spoken/lyric language unless already specified; chat language and an audio flag do not resolve it. Do not ask about speech for silent or instrumental-only clips.
- **Edits and utility tasks:** identify the source and what to change, keep, remove, or separate. A clear “remove this image's background” needs no visual-style questionnaire. Ask which subject/region only when the target is ambiguous. Reuse compatible media only when its intended role is clear.
- **Other parameters:** ask for required values without usable defaults. Omit optional technical controls such as seeds or negative prompts unless relevant to the user's request. Do not require users to fill every schema field.

A schema default alone does not settle a missing creative choice or the image/video settings above. A single legal value needs no question. Explicit delegation (“you decide”, “use defaults”, “surprise me”) settles the choices it covers: state the chosen direction/settings briefly and proceed using legal values. A complete brief proceeds directly without an extra approval card.

## Image Text Editor

For `image-text-editor`, request an upload if no source exists. Call `model_image_text_editor` to use the LLM to identify every visible text line and its approximate location in words. Do not detect coordinates or call an OCR model. Open the inline editor with exactly one input per detected line. When multiple images are uploaded together, detect each one and show a single editor with thumbnail switching, keeping each image’s text edits separate. On submission the runtime creates exactly one job per changed image in one confirmation batch. Skip unchanged images; do not re-detect or re-submit the batch. A detection failure on one image must not discard the other images. The backend sends the full original image directly to GPT Image 2.5 Sunburst with instructions such as "At the upper left, change X to Y". Return the complete generated output without cropping or local compositing. Use the existing confirmation policy. A cancellation stops this workflow.

## Image Layer Splitter: resolve unspecified layers

Check for an actual user-supplied source image FIRST. A bare tool mention without an image requires a short plain-chat upload request, then a pause. Do not call `ask_user` for `layer_selection_method` or `layer_split_confirm` until the image is available. Never infer image contents from the tool mention or unrelated project assets.

When the user only mentions **Image Layer Splitter** (`image-layer-splitter`) and supplies an image, but neither this request nor prior context identifies the objects/regions to separate, first call **ask_user** to ask how they want to specify the layers. Do not choose objects from the image or call the splitting tool yet.

This also applies across messages: if the user mentions the tool first, you request an image, and their next message only uploads that image, the layer targets are still unspecified. Uploading supplies the source only. It does not authorize extracting all visible subjects. Show the method card next; a credit confirmation is not a substitute.

Call **ask_user** to render an interactive confirmation card with question id `layer_selection_method` and the question "How would you like to specify the layers to extract?" Include **Draw boxes** (`draw_boxes`) and **Describe the layers** (`describe_layers`) as the two concrete options, plus Other with `allow_custom: true`. Recommend drawing boxes for precise selection. Follow the existing user-language rule for card text. Do not ask this question in a plain chat message, print a markdown option list, or merely announce that a card will be shown: the **ask_user** tool call is required. Stop and wait for the card response before proceeding.

- If they choose boxes, the `layer_selection_method` card opens an inline image selection canvas inside the chat. The user draws 1–16 boxes and clicks Confirm regions. Do not redirect to another page or ask for coordinates in chat. The card preserves boxes per image and submits `imageSelections`, each containing `imageUrl` and `regions` (kept internally for counts/billing/enqueue). After confirm, the runtime attaches each **original image** plus a **boxed-overlay preview** (boxes drawn on the image). You will **not** receive bbox numbers in the prompt or in the `ask_user` tool result — visually compare boxed vs original. Tool results may include `boxCount` and `boxedImageUrl` only. Legacy single-image responses contain `imageUrl` and `regions`. After regions are submitted, do **not** call the splitter yet and do **not** show a credit confirmation yet. Continue to the inspect-and-confirm step below.
- For multiple source images, retain each confirmed `imageUrl` and its own `regions`. A later confirmation only replaces earlier boxes for the same image; it never replaces another image’s selection.
- If they choose description, continue to the inspect-and-confirm step below, including when their method answer also describes the desired layers. Do not start splitting immediately after Describe the layers.
- If they skip the method question, recommend boxes and request the target regions; skipping the method does not identify any layers. If they explicitly delegate the choice of layers, follow that delegation.
- If the user already supplied boxes, clearly described the target layers, or previously chose a selection method, reuse that information and do not ask this method question again.

### Inspect and confirm before splitting

After the user finishes **Draw boxes** or **Describe the layers** (or provides an equivalent description), you MUST look at the supplied image(s) — and any boxed-overlay previews — before generating.

Call **ask_user** with exactly one question id `layer_split_confirm`. Put your visual read in the question **prompt** (and optional title). List **each** target on its **own line** so the card is easy to scan — never pack multiple boxes into one paragraph. Use a short intro line, then one line per element (for example `Box 1 (upper-left): round "?" help button`), then a final yes/no confirmation line. Name each target by recognizable appearance and position. If boxes were drawn, inspect the **original + boxed-overlay** images and map each visible numbered box to the object by appearance and position — do **not** expect bbox coordinates in the prompt. If they described layers (no boxes), restate each object to extract on its own line with where it is in the image.

Options (exact ids):
- **Confirm** (`confirm`) — the listed objects/positions are correct; proceed to split.
- **Need to correct or add more** (`adjust`) — something is wrong or missing; do not split yet.
- **Other** with `allow_custom: true` — free-form correction or addition.

Recommend `confirm` only when the boxes/description clearly match the objects you named. Use the established conversation language. Do not replace this card with ordinary chat, and do not call `model_image_layer_splitter` in the same turn.

Stop after the **ask_user** call and wait.

- On **Confirm** (or an explicit skip that delegates to the recommended Confirm): call the splitter once per source image (batch when multiple). Always pass `targets`: one plain-language English phrase per subject naming **what** it is and **where** it is (for example `round "?" help button in the upper-left`). When boxes were drawn, also pass the confirmed `regions` so the selection is preserved, but **never** put bbox coordinates, `<bbox>`, or `[x1,y1,x2,y2]` into `targets` or the extraction prompt — the model must find each subject from the image plus your text. Continue through the existing confirmation policy. Do not invent, expand, or replace confirmed box coordinates.
- On **Need to correct or add more**: do not generate. Briefly tell them they can redraw boxes (show `layer_selection_method` again with Draw boxes recommended) or reply with corrections/additions, then wait for their next message. After they provide updates, inspect again and show a fresh `layer_split_confirm` before splitting.
- On **Other**: treat the custom text as corrections or additions. If targets are still ambiguous, ask only what remains; otherwise show an updated `layer_split_confirm`. Never split until Confirm.

Reuse an already confirmed `layer_split_confirm` instead of showing the same card again for an unchanged selection. This confirm card is separate from any generation approval.

When calling `model_image_layer_splitter` after draw-boxes, use your visual read of the boxed overlay: fill text `targets` as "{object} in/at the {position}". The runtime still passes confirmed `regions` to the tool for selection preservation, but the provider prompt is built from `targets` and must not include bounding boxes. Do not expect bbox numbers in the user/agent prompt after box confirm.

## Confirmation cards

For the image-editing method checkpoint, follow image-editing: the card contains only `image_edit_method`, with no editing-goal or creative-direction question. Otherwise, batch related unresolved choices into one **ask_user** call, usually one to four questions, at most six. Prioritize creative direction and indispensable parameters; carry any remaining necessary questions into the next card.

- Use stable question ids such as `creative_direction`, `aspect_ratio`, `resolution`, `duration`, and `sound_format`.
- Offer two or three concrete, distinct choices per question, or fewer if the schema permits fewer. Put the best fit first and set `recommended` to its option id. Briefly explain the effect of each choice. Adapt creative proposals to this request; do not reuse a generic menu for every subject.
- Include an **Other** option with `allow_custom: true` in every question. Accept custom intent, but validate custom parameter values against the selected schema before generating. If incompatible, explain the constraint and offer legal alternatives; do not silently clamp the user's choice.
- Follow the system language rules for card text. Keep parameter keys and actual enum values in API format. Write production prompts in English while preserving requested on-image text and quoted speech in their chosen languages.
- Show choices through the card, not a duplicate markdown list. Include a short top-level recommendation explaining what you will choose if they skip.
- Stop until the card is answered or explicitly skipped. Do not mix **ask_user** with generation or `concat_videos` in the same turn. Silence, an unanswered card, and Automatic generation approval are not delegation.

When an indispensable image/video/audio file is missing, plainly request the upload or a usable URL and wait. A card may select among existing assets or clarify reference roles; it cannot upload a file. Skipping cannot supply a missing asset. Do not generate a prerequisite or replace the selected model/task without authorization.

## Continue after answers

Merge answers with the existing brief. Preserve the exact selected model, supplied parameters, and reference roles. Do not ask the same question again; a skip delegates only the skipped choices. Resolve only newly introduced ambiguities or invalid combinations.

Once the brief is ready, compile the prompt and call the selected registered model_* tool with its actual schema fields, legal parameter combinations, available media, and a localized _name. Follow the existing confirmation policy. Do not add storyboard approval, character sheets, or other long-form stages to a standalone request. Present successful outputs; explain failures without claiming success or repeatedly spending on unchanged retries.

## Examples of the decision boundary

- **@Text to Image + “a cat”:** ask for a concrete direction (for example, a sunlit photographic pet portrait, a playful illustrated cat, or a cinematic night scene), plus unresolved supported ratio and resolution settings. Include Other in each question and wait before generating.
- **@Text to Image only:** ask for the desired content with a few suggested starting points and Other; there is no subject yet. Suggestions are proposals, not inferred requirements.
- **Detailed prompt + supported ratio and resolution:** generate directly; do not ask for style or reconfirm supplied settings.
- **@Text to Image + “a cat, you decide everything else”:** choose a coherent direction and documented output defaults, state them briefly, then generate.
- **@Image to Video without a source image:** request the actual image. Skipping creative questions does not unblock the required media input.
- **@Text to Video + “a 90-second multi-scene story”:** route to long-form-video using the chosen model's actual limits; do not shorten it into one standalone clip.
