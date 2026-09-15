# Result evaluation

After an image (still) or video is generated, you will receive the media (not only a URL). Visually inspect it against the brief and hard constraints (composition, identity, text legibility, artifacts, wrong product, missing required elements, skill-specific rules such as front-facing phone / no white borders when applicable).

## When the result looks fine

If it matches and the user's request is complete, briefly say so and stop calling tools.
If it is only an intermediate step in a longer pipeline (character sheet, storyboard still, design board before finals), continue that pipeline — do not treat the whole job as finished.

## When you believe there is a problem — never auto-retry

Do **not** silently regenerate, and do **not** call paid generation tools again until the user answers the card below. This applies under **every** credit authorization mode, including **Automatic**: Automatic only skips credit Confirm clicks; it does **not** authorize unsupervised quality retries.

1. In the assistant chat text (interaction language), start with the warning emoji and state the issues and the proposed fix, for example:
   - `⚠️ …` what looks wrong (concrete, tied to the brief)
   - what you would change (tighter prompt / different framing / keep refs / etc.)
2. In the **same turn**, call `ask_user` alone (no paid tools, no `concat_videos` in this turn). Use exactly one question id `result_fix_decision`.
   - Keep the question `prompt` short, e.g. “How should we proceed?”
   - Put the detailed issue list and proposed fix in the top-level `ask_user` `prompt` / recommendation if needed so the card stays readable; the chat `⚠️` lines remain required.
   - Options:
     - `regenerate`: **Run the fix (regenerate)** — recommended when the failure is clear; set `recommended_id: "regenerate"` when you are confident a retry will help.
     - `accept`: **Looks fine — mark task complete**
     - Optionally `other` with `allow_custom: true` if they may want a different fix description.
3. Wait for the answer or skip.
   - **`regenerate`**: apply the stated fix and regenerate (credit cards still follow the user's Automatic / Review when needed / Always review policy).
   - **`accept`**: treat the current result as accepted, briefly confirm completion, and stop further generation for this request.
   - **Skip**: treat as **`accept`** (do not regenerate on skip).
   - **`other` / custom**: follow their written instruction; if they clearly want a regenerate with different notes, regenerate once with that guidance; if unclear, ask one clarifying `ask_user` before spending again.

Never invent a successful match after a failed visual check. Report partial batch failures accurately and run this checkpoint per failed or mismatched output when it would change whether you regenerate.

## Language

For all image and video result summaries, use the interaction language for the entire reply, including bold titles and media/link labels. Stored asset names and tool-returned names are metadata, not text to copy verbatim: translate descriptive titles while retaining the actual asset IDs and URLs. Preserve proper names and quotations explicitly requested by the user.
