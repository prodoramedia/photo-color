/**
 * Builds the analysis prompt for the vision LLM.
 *
 * Instructs the model to return a JSON object conforming to the
 * AnalysisResult schema: elements with importance ranking, face regions,
 * scene description, spatial layout, and background strategy.
 */
export function buildAnalysisPrompt(): string {
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
