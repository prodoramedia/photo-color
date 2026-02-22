---
name: test-pipeline
description: >
  Run the coloring page pipeline against test images and evaluate output quality.
  Use when testing prompts, comparing models, or evaluating pipeline changes.
  Triggers: "test the pipeline", "run a test", "compare outputs", "evaluate quality"
---

# Pipeline Testing Skill

## When Testing a New Prompt or Model Change

1. Run the pipeline against the standard test set (at minimum: 1 portrait, 1 group photo, 1 pet, 1 landscape, 1 landmark)
2. Save each output to `output/` with naming: `{model}-{prompt-version}-{test-image-name}.png`
3. Generate a comparison grid (if multiple variants)
4. Evaluate each output against these criteria:
   - **Facial fidelity**: Would you recognize the person? (1-5)
   - **Line cleanliness**: Are lines bold, consistent, no gray areas? (1-5)
   - **Colorability**: Are regions clearly bounded, suitable for coloring? (1-5)
   - **Detail level**: Appropriate detail — not too sparse, not too busy? (1-5)
   - **Background handling**: Is the background simplified appropriately? (1-5)
5. Log results to `output/evaluation-log.json`

## Standard Test Image Categories
- `portrait-closeup` — Single person, face clearly visible
- `portrait-glasses` — Person wearing glasses (tests detail preservation)
- `group-photo` — 2-4 people together
- `pet-dog` — Dog photo
- `pet-cat` — Cat photo
- `landscape` — Outdoor scene with clear horizon
- `landmark` — Recognizable building or monument
- `child` — Photo of a child (tests age-appropriate output)