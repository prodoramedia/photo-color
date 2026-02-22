---
name: prompt-engineering
description: >
  Craft and iterate on prompts for the coloring page pipeline. Use when creating
  new prompt templates, improving output quality, or debugging why a specific
  photo produces poor results. Triggers: "write a prompt", "improve the prompt",
  "the output doesn't look right", "prompt template"
---

# Prompt Engineering for Coloring Page Generation

## Core Principles

1. **Preservation instructions come first** — always lead with what to keep
2. **Negative instructions matter** — explicitly state no shading, no gray, no color
3. **Specificity beats brevity** — "preserve the exact shape of their glasses, hairline,
   and jaw structure" beats "keep their features"
4. **Reference the input** — use phrases like "this exact photograph" and
   "the people shown" to anchor the model to the input image

## Prompt Template Structure

Every generation prompt should follow this order:
1. Task definition ("Convert this photograph into a coloring book page")
2. Preservation requirements ("preserving exact facial features, proportions...")
3. Style specifications ("bold black outlines, pure white background...")
4. Negative constraints ("no shading, no gray tones, no filled areas...")
5. Complexity target (if applicable) ("suitable for children ages 5-8")

## Known Failure Modes
- **Generic faces**: Model reinterprets rather than converts — add "the people must
  be recognizable as the same individuals in the photograph"
- **Gray fill areas**: Model adds shading — add "every region must be either pure
  black (outlines) or pure white (fill area), nothing in between"
- **Over-simplification**: Model removes key details — add "preserve distinguishing
  features such as glasses, jewelry, hairstyle, facial hair, clothing patterns"
- **Busy backgrounds**: Model keeps too much detail — add "simplify background to
  essential structural elements only"