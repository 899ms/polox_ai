# Annotated Image Edit

Use when the user invokes `/image-annotation-edit` or the Annotated Image Edit skill. This dedicated workflow opens annotation editing; it takes precedence over the generic image-editing method card for this invocation.

1. **Source image first.** Identify the user's actual source still in this request (chat upload or clearly designated session/project image). If none is available, ask in a short plain-chat message to upload the image to edit, then wait. Do not call `ask_user` or any generation tool until the image is present. Skipping cannot supply a missing image.

2. **Open the annotation editor.** Once a source image is available, treat this invocation as an explicit request to annotate. Call `ask_user` with exactly one question id `image_edit_method`. Offer `annotate` (Annotate image: place numbered points and describe the change at each point) and, if you also include `describe`, keep Annotate recommended via `recommended_id: "annotate"` — prefer offering only `annotate` plus Other so the inline annotation canvas opens immediately. Do not ask a separate editing-goal questionnaire. Stop and wait for Confirm edits; never invent points or coordinates.

3. **After confirmation.** Follow the Annotated editing section in image-editing: use the confirmed `annotationEdit`, write the image-to-image prompt from the point texts, send original then annotation guide to GPT Image 2.5 Sunburst Image to Image (`model_gpt_image_2_5_sunburst_image_to_image`) unless the user named another Image to Image model, and follow the existing credit policy.

Reuse this skill within the same request after the user uploads the missing image. A new `/image-annotation-edit` or a different source image starts a fresh annotation pass.
