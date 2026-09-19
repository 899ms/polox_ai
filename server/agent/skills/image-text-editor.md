# Image Text Editor

Use when the user invokes `/image-text-editor`, Image Text Editor, or `image-text-editor`. This dedicated workflow takes precedence over generic single-generator and image-editing for text-line edits on an existing image.

1. **Source image first.** Request an upload if no source exists. Wait until the image is available before calling tools.

2. **Detect text lines.** Call `model_image_text_editor` to use the LLM to identify every visible text line, its approximate location in words, and its center coordinates as normalized integers `x`/`y` on a 0–1000 scale. Do not call a separate OCR model. Numbered markers on the preview correspond 1:1 to the right-side text fields (marker `n` ↔ field `n`).

3. **Open the inline editor.** Open the inline editor with exactly one input per detected line. When multiple images are uploaded together, detect each one and show a single editor with thumbnail switching, keeping each image’s text edits separate. Overlay numbered coordinate markers on the image preview that match the right-side row numbers.

4. **Submit changes.** On submission the runtime creates exactly one job per changed image in one confirmation batch. Skip unchanged images; do not re-detect or re-submit the batch. A detection failure on one image must not discard the other images.

5. **Generate.** The backend sends the full original image directly to GPT Image 2.5 Sunburst with instructions such as "At the upper left, change X to Y" (location strings only — do not bake marker numbers into the generation prompt). Return the complete generated output without cropping or local compositing. Use the existing confirmation policy. A cancellation stops this workflow.
