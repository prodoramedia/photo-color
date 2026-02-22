import type {
  AnalysisResult,
  ComplexityLevel,
  PromptVariant,
} from "@/lib/pipeline/types";

// ─── Complexity Configuration ───────────────────────────────────────────────

interface ComplexityConfig {
  lineWeight: string;
  detailLevel: string;
  regionSize: string;
  ageDescription: string;
  additionalInstructions: string;
}

const COMPLEXITY_CONFIG: Record<ComplexityLevel, ComplexityConfig> = {
  toddler: {
    lineWeight: "very thick, bold outlines (6-8px equivalent)",
    detailLevel: "extremely simplified, only the most basic shapes",
    regionSize: "very large coloring regions, no small details",
    ageDescription: "toddlers ages 2-4",
    additionalInstructions:
      "Reduce everything to basic geometric shapes. No small details, no textures, no patterns. Maximum 8-10 distinct regions to color.",
  },
  child: {
    lineWeight: "thick, clear outlines (4-6px equivalent)",
    detailLevel: "simplified but recognizable, moderate detail",
    regionSize: "medium to large coloring regions",
    ageDescription: "children ages 5-8",
    additionalInstructions:
      "Keep shapes recognizable but simplified. Include some detail in clothing and hair. Around 15-25 distinct coloring regions.",
  },
  tween: {
    lineWeight: "medium outlines (2-4px equivalent)",
    detailLevel: "detailed with clear shapes, moderate complexity",
    regionSize: "varied region sizes including some smaller details",
    ageDescription: "tweens ages 9-12",
    additionalInstructions:
      "Include detailed features like clothing folds, hair texture, and background elements. Around 30-50 distinct coloring regions.",
  },
  adult: {
    lineWeight: "fine, precise outlines (1-3px equivalent)",
    detailLevel: "highly detailed, intricate patterns where appropriate",
    regionSize: "many small and detailed regions",
    ageDescription: "adults and advanced colorists",
    additionalInstructions:
      "Include fine details: fabric textures, individual leaves, architectural details, hair strands. Add decorative patterns in large empty areas. 50+ distinct coloring regions.",
  },
};

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function buildSceneBlock(analysis: AnalysisResult): string {
  const subjects = analysis.elements
    .filter((el) => el.category === "subject")
    .map((el) => el.description);
  const objects = analysis.elements
    .filter((el) => el.category === "object")
    .map((el) => el.description);

  const parts: string[] = [`Scene: ${analysis.sceneDescription}.`];
  if (subjects.length > 0) {
    parts.push(`Main subjects: ${subjects.join(", ")}.`);
  }
  if (objects.length > 0) {
    parts.push(`Also includes: ${objects.join(", ")}.`);
  }
  return parts.join(" ");
}

function buildFaceBlock(analysis: AnalysisResult): string {
  if (analysis.faceRegions.length === 0) return "";
  return analysis.faceRegions
    .map(
      (face) =>
        `${face.description} (${face.position}), features: ${face.distinguishingFeatures.join(", ")}`,
    )
    .join("; ");
}

function buildBackgroundInstruction(
  strategy: AnalysisResult["backgroundStrategy"],
): string {
  const map: Record<AnalysisResult["backgroundStrategy"], string> = {
    remove: "Pure white background, no background elements.",
    simplify:
      "Minimally suggested background with only essential structural lines.",
    "preserve-structure":
      "Background shows recognizable shapes as simple outlines.",
    "preserve-detail":
      "Background included with full structural detail rendered as line art.",
  };
  return map[strategy];
}

// ─── Negative Prompt ────────────────────────────────────────────────────────

export const NEGATIVE_PROMPT = [
  "color",
  "shading",
  "gradient",
  "gray",
  "grey",
  "shadow",
  "photograph",
  "photorealistic",
  "3d render",
  "watermark",
  "text",
  "signature",
  "blurry",
  "low quality",
  "filled areas",
  "solid black regions",
  "halftone",
  "crosshatch",
  "noise",
  "grain",
].join(", ");

// ─── Variant: direct-transform ──────────────────────────────────────────────
// Single comprehensive prompt — balanced across all concerns.

export function directTransform(
  complexityLevel: ComplexityLevel,
  analysisResult?: AnalysisResult,
): string {
  const config = COMPLEXITY_CONFIG[complexityLevel];

  // 1. Task definition
  const task = `Convert this photograph into a coloring book page. Black and white line art drawing suitable for ${config.ageDescription}.`;

  // 2. Preservation requirements
  let preservation: string;
  if (analysisResult) {
    const scene = buildSceneBlock(analysisResult);
    const faces = buildFaceBlock(analysisResult);
    preservation = scene;
    if (faces) {
      preservation += ` The people must be recognizable as the same individuals. Preserve exact facial features, proportions, hairstyle, glasses: ${faces}.`;
    }
  } else {
    preservation =
      "If people are present, the people must be recognizable as the same individuals. Preserve exact facial features, proportions, hairstyle, glasses.";
  }

  // 3. Style specifications
  const background = analysisResult
    ? buildBackgroundInstruction(analysisResult.backgroundStrategy)
    : "Simplify the background to minimal structural outlines.";
  const style = `Style: ${config.lineWeight}. Bold black outlines on pure white background. ${background}`;

  // 4. Negative constraints
  const constraints =
    "No color, no shading, no gradients, no gray tones. Every region either pure black outline or pure white fill, nothing in between.";

  // 5. Complexity target
  const complexity = `Detail level: ${config.detailLevel}. Region sizes: ${config.regionSize}. ${config.additionalInstructions}`;

  return [task, preservation, style, constraints, complexity]
    .filter(Boolean)
    .join(" ");
}

// ─── Variant: preservation-heavy ────────────────────────────────────────────
// Extra emphasis on facial/feature fidelity. Repeats and reinforces
// identity-preservation instructions throughout the prompt.

export function preservationHeavy(
  complexityLevel: ComplexityLevel,
  analysisResult?: AnalysisResult,
): string {
  const config = COMPLEXITY_CONFIG[complexityLevel];

  // 1. Task definition — immediately frames identity preservation as the goal
  const task = `Convert this photograph into a coloring book page while maintaining the identity and likeness of every person. Black and white line art for ${config.ageDescription}.`;

  // 2. Preservation requirements — heavily detailed
  let preservation: string;
  if (analysisResult) {
    const scene = buildSceneBlock(analysisResult);
    const faces = buildFaceBlock(analysisResult);
    preservation = scene;
    if (faces) {
      preservation += [
        ` CRITICAL: The people must be recognizable as the same individuals from the original photo.`,
        ` Preserve exact facial features, proportions, hairstyle, glasses for each person: ${faces}.`,
        ` Facial structure is the top priority — jawline, nose shape, eye spacing, brow shape, and lip proportions must match the original.`,
        ` Distinguishing accessories (glasses, earrings, hats, jewelry) must appear in their exact form.`,
      ].join("");
    }
  } else {
    preservation = [
      "CRITICAL: The people must be recognizable as the same individuals from the original photo.",
      "Preserve exact facial features, proportions, hairstyle, glasses.",
      "Facial structure is the top priority — jawline, nose shape, eye spacing, brow shape, and lip proportions must match the original.",
      "Distinguishing accessories (glasses, earrings, hats, jewelry) must appear in their exact form.",
    ].join(" ");
  }

  // 3. Style specifications — lines serve preservation
  const background = analysisResult
    ? buildBackgroundInstruction(analysisResult.backgroundStrategy)
    : "Simplify the background to keep focus on the people.";
  const style = `Style: ${config.lineWeight}. Bold black outlines on pure white background. Use line weight variation to emphasize facial features — thinner lines for facial detail, thicker for body contours. ${background}`;

  // 4. Negative constraints
  const constraints =
    "No color, no shading, no gradients, no gray tones. Every region either pure black outline or pure white fill, nothing in between. Do not simplify faces — only simplify non-face regions to match the target complexity.";

  // 5. Complexity target — face detail overrides complexity reduction
  const complexity = `Detail level: ${config.detailLevel}. Region sizes: ${config.regionSize}. ${config.additionalInstructions} Exception: faces always retain full detail regardless of complexity level.`;

  return [task, preservation, style, constraints, complexity]
    .filter(Boolean)
    .join(" ");
}

// ─── Variant: simplification-heavy ──────────────────────────────────────────
// Extra emphasis on clean, simple line art. Prioritizes colorability
// and clear region boundaries over photographic fidelity.

export function simplificationHeavy(
  complexityLevel: ComplexityLevel,
  analysisResult?: AnalysisResult,
): string {
  const config = COMPLEXITY_CONFIG[complexityLevel];

  // 1. Task definition — frames clean line art as the primary goal
  const task = `Create a clean, professionally illustrated coloring book page from this photograph. Prioritize clear, unbroken outlines and well-defined coloring regions. Black and white line art for ${config.ageDescription}.`;

  // 2. Preservation requirements — present but secondary to clarity
  let preservation: string;
  if (analysisResult) {
    const scene = buildSceneBlock(analysisResult);
    const faces = buildFaceBlock(analysisResult);
    preservation = scene;
    if (faces) {
      preservation += ` The people must be recognizable as the same individuals. Preserve exact facial features, proportions, hairstyle, glasses, but render them with clean simplified strokes: ${faces}.`;
    }
  } else {
    preservation =
      "If people are present, the people must be recognizable as the same individuals. Preserve exact facial features, proportions, hairstyle, glasses, but render them with clean simplified strokes.";
  }

  // 3. Style specifications — emphasizes clean line art qualities
  const background = analysisResult
    ? buildBackgroundInstruction(analysisResult.backgroundStrategy)
    : "Remove or heavily simplify the background.";
  const style = [
    `Style: ${config.lineWeight}. Bold black outlines on pure white background.`,
    "Every outline must be a single clean stroke — no sketchy or doubled lines.",
    "Every enclosed region must be clearly bounded by unbroken lines with no gaps.",
    "Merge small adjacent details into larger, easier-to-color regions.",
    background,
  ].join(" ");

  // 4. Negative constraints — extra emphasis on cleanliness
  const constraints =
    "No color, no shading, no gradients, no gray tones. Every region either pure black outline or pure white fill, nothing in between. No cross-hatching, no stippling, no texture marks, no decorative fills inside regions.";

  // 5. Complexity target — reinforces simplification
  const complexity = `Detail level: ${config.detailLevel}. Region sizes: ${config.regionSize}. ${config.additionalInstructions} When in doubt, simplify further — fewer well-defined regions are better than many ambiguous ones.`;

  return [task, preservation, style, constraints, complexity]
    .filter(Boolean)
    .join(" ");
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

const VARIANT_BUILDERS: Record<
  PromptVariant,
  (
    complexityLevel: ComplexityLevel,
    analysisResult?: AnalysisResult,
  ) => string
> = {
  "direct-transform": directTransform,
  "preservation-heavy": preservationHeavy,
  "simplification-heavy": simplificationHeavy,
};

/**
 * Builds the generation prompt for the given variant.
 * Returns both the positive prompt string and the shared negative prompt.
 */
export function buildGenerationPrompt(
  variant: PromptVariant,
  complexityLevel: ComplexityLevel,
  analysisResult?: AnalysisResult,
): { prompt: string; negativePrompt: string } {
  const builder = VARIANT_BUILDERS[variant];
  return {
    prompt: builder(complexityLevel, analysisResult),
    negativePrompt: NEGATIVE_PROMPT,
  };
}

/**
 * Builds a single combined prompt for edit endpoints (image-to-image).
 * Edit endpoints have no separate negative_prompt field, so negative
 * constraints are folded into the main prompt.
 */
export function buildEditPrompt(
  variant: PromptVariant,
  complexityLevel: ComplexityLevel,
  analysisResult?: AnalysisResult,
): string {
  const builder = VARIANT_BUILDERS[variant];
  const positivePrompt = builder(complexityLevel, analysisResult);
  return `${positivePrompt} MUST NOT include: ${NEGATIVE_PROMPT}.`;
}

/**
 * Returns recommended inference parameters for a given complexity level.
 * Higher complexity levels use more inference steps for finer detail.
 */
export function getInferenceConfig(complexity: ComplexityLevel): {
  numInferenceSteps: number;
  guidanceScale: number;
} {
  switch (complexity) {
    case "toddler":
      return { numInferenceSteps: 20, guidanceScale: 8.0 };
    case "child":
      return { numInferenceSteps: 25, guidanceScale: 7.5 };
    case "tween":
      return { numInferenceSteps: 30, guidanceScale: 7.5 };
    case "adult":
      return { numInferenceSteps: 35, guidanceScale: 7.0 };
  }
}
