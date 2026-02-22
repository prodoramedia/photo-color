/**
 * System prompt for the Claude vision analyzer.
 * Sets the role and output expectations.
 */
export function buildAnalysisSystemPrompt(): string {
  return `You are an expert image analyst for a coloring book generation pipeline. Your job is to examine a photograph and extract structured information that will guide the conversion of this photo into a coloring page.

Be precise about spatial positions, distinctive features, and visual complexity. Your analysis directly determines what gets preserved and what gets simplified in the final coloring page.`;
}

/**
 * User prompt for the Claude vision analyzer.
 * Instructs the model on what to extract from the image.
 * JSON structure is enforced by zodOutputFormat, so we focus on
 * extraction guidance rather than format instructions.
 */
export function buildAnalysisUserPrompt(): string {
  return `Analyze this photograph for coloring book conversion. Extract the following:

**Photo Type**: Classify as "portrait" (1-2 people, face-focused), "group" (3+ people), "pet" (animal-focused), "landscape" (scenery, no prominent subjects), "landmark" (recognizable building/monument), or "other".

**Subjects**: For each distinct subject (person, animal, prominent object):
- Write a concise description (e.g. "young woman with curly red hair and round glasses")
- Estimate a bounding box as normalized coordinates (0-1 range): x and y for the top-left corner, width and height as fractions of the full image
- List distinctive features that MUST be preserved for recognizability (e.g. "round glasses", "handlebar mustache", "striped scarf", "missing front tooth")

**Background**:
- Describe the background briefly
- Rate its visual complexity from 1 (plain solid color) to 10 (highly detailed scene)
- List the key structural elements (e.g. "brick wall", "oak tree", "park bench")

**Preservation Priorities**: Rank the most important elements to preserve, from most to least critical. These are the things that make this specific photo recognizable — the elements someone would notice if they were missing. Put the most important first.

**Simplification Targets**: List elements that CAN be simplified or removed at different complexity levels. For each, specify:
- What the element is
- Why it can be simplified (e.g. "background clutter", "repetitive pattern", "small secondary detail")
- Which complexity levels it applies to. Use: "toddler" (ages 2-4, maximum simplification), "child" (ages 5-8, moderate simplification), "tween" (ages 9-12, light simplification), "adult" (detailed, minimal simplification). An element that should be simplified for toddlers but kept for adults would have applicableComplexity: ["toddler", "child"].`;
}

// ─── Legacy Prompt (fal.ai LLaVA) ──────────────────────────────────────────

/**
 * @deprecated Use buildAnalysisSystemPrompt + buildAnalysisUserPrompt for Claude.
 * Kept for the fal.ai LLaVA vision path in fal-client.ts.
 */
export function buildAnalysisPromptLegacy(): string {
  return `You are an image analysis assistant for a coloring book pipeline. Analyze this photograph and return a JSON object with the following structure. Return ONLY valid JSON, no other text.

{
  "elements": [
    {
      "label": "short name like 'woman' or 'oak tree'",
      "importance": 1,
      "category": "subject | object | background | accessory",
      "description": "brief description of this element"
    }
  ],
  "faceRegions": [
    {
      "description": "description of the face, e.g. 'young woman with round glasses and ponytail'",
      "position": "center | left | right | top-left | top-right | bottom-left | bottom-right",
      "distinguishingFeatures": ["glasses", "curly hair", "beard", "dimples"]
    }
  ],
  "sceneDescription": "one sentence describing the entire scene",
  "spatialLayout": "e.g. 'portrait close-up', 'group standing outdoors', 'landscape with foreground subject'",
  "backgroundStrategy": "remove | simplify | preserve-structure | preserve-detail"
}

Rules:
- List elements in order of visual importance (most important first, importance=1 is highest).
- Every person visible must have a corresponding entry in faceRegions.
- If no faces are visible, faceRegions should be an empty array.
- For backgroundStrategy: use "remove" if the background is plain or irrelevant, "simplify" if it has some structure but is not the focus, "preserve-structure" if it has recognizable shapes (buildings, trees), "preserve-detail" if the background is part of the main subject (e.g. a landmark).
- Be specific about distinguishing features — these will be used to ensure the coloring page preserves recognizability.
- category "subject" = the main focus, "object" = secondary items, "background" = environmental elements, "accessory" = items worn or held by subjects.`;
}
