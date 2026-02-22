import Anthropic from "@anthropic-ai/sdk";
import {
  type AnalysisResult,
  type ImageAnalysis,
  ImageAnalysisSchema,
  PipelineError,
} from "@/lib/pipeline/types";
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserPrompt,
} from "@/lib/prompts/analysis";

// This module must only be imported in server-side code.

const ANALYSIS_MODEL = "claude-sonnet-4-20250514" as const;

// JSON Schema for the ImageAnalysis tool (mirrors ImageAnalysisSchema)
const IMAGE_ANALYSIS_TOOL: Anthropic.Tool = {
  name: "record_analysis",
  description:
    "Record the structured analysis of the photograph. You MUST call this tool with your analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      photoType: {
        type: "string",
        enum: ["portrait", "group", "pet", "landscape", "landmark", "other"],
      },
      subjects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            boundingBox: {
              type: "object",
              properties: {
                x: { type: "number", minimum: 0, maximum: 1 },
                y: { type: "number", minimum: 0, maximum: 1 },
                width: { type: "number", minimum: 0, maximum: 1 },
                height: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["x", "y", "width", "height"],
            },
            distinctiveFeatures: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["description", "boundingBox", "distinctiveFeatures"],
        },
      },
      background: {
        type: "object",
        properties: {
          description: { type: "string" },
          complexity: { type: "integer", minimum: 1, maximum: 10 },
          keyElements: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["description", "complexity", "keyElements"],
      },
      preservationPriorities: {
        type: "array",
        items: { type: "string" },
      },
      simplificationTargets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            element: { type: "string" },
            reason: { type: "string" },
            applicableComplexity: {
              type: "array",
              items: {
                type: "string",
                enum: ["toddler", "child", "tween", "adult"],
              },
            },
          },
          required: ["element", "reason", "applicableComplexity"],
        },
      },
    },
    required: [
      "photoType",
      "subjects",
      "background",
      "preservationPriorities",
      "simplificationTargets",
    ],
  },
};

function getClient(): Anthropic {
  return new Anthropic();
}

function inferMediaType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  // Check magic bytes
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  )
    return "image/gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  )
    return "image/webp";
  // Default to JPEG
  return "image/jpeg";
}

/**
 * Analyzes a photo using Claude's vision capabilities.
 * Returns structured analysis with subjects, background, and
 * complexity-aware preservation/simplification priorities.
 *
 * @param image - URL string or Buffer of the image to analyze
 */
export async function analyzePhoto(
  image: string | Buffer,
): Promise<ImageAnalysis> {
  const client = getClient();

  const imageContent: Anthropic.ImageBlockParam =
    typeof image === "string"
      ? {
          type: "image",
          source: { type: "url", url: image },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: inferMediaType(image),
            data: image.toString("base64"),
          },
        };

  try {
    const response = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      system: buildAnalysisSystemPrompt(),
      tools: [IMAGE_ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "record_analysis" },
      messages: [
        {
          role: "user",
          content: [
            imageContent,
            { type: "text", text: buildAnalysisUserPrompt() },
          ],
        },
      ],
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolBlock) {
      throw new PipelineError(
        `Claude did not call the analysis tool. Stop reason: ${response.stop_reason}`,
        "analysis",
      );
    }

    const parsed = ImageAnalysisSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new PipelineError(
        `Analysis tool output did not match schema: ${parsed.error.message}`,
        "analysis",
        parsed.error,
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (error instanceof Anthropic.APIError) {
      throw new PipelineError(
        `Claude API error (${error.status}): ${error.message}`,
        "analysis",
        error,
      );
    }
    throw new PipelineError(
      `Image analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      "analysis",
      error,
    );
  }
}

// ─── Mapper: ImageAnalysis → AnalysisResult ─────────────────────────────────

/**
 * Maps the richer ImageAnalysis from Claude to the legacy AnalysisResult
 * format consumed by the generation prompt templates.
 */
export function imageAnalysisToAnalysisResult(
  analysis: ImageAnalysis,
): AnalysisResult {
  // Map subjects to detected elements
  const subjectElements = analysis.subjects.map((subject, i) => ({
    label: subject.description.split(" ").slice(0, 3).join(" "),
    importance: i + 1,
    category: "subject" as const,
    description: subject.description,
  }));

  // Map background key elements
  const backgroundElements = analysis.background.keyElements.map(
    (element, i) => ({
      label: element,
      importance: analysis.subjects.length + i + 1,
      category: "background" as const,
      description: element,
    }),
  );

  const elements = [...subjectElements, ...backgroundElements];
  // Ensure at least one element
  if (elements.length === 0) {
    elements.push({
      label: "scene",
      importance: 1,
      category: "subject" as const,
      description: analysis.background.description,
    });
  }

  // Map subjects with distinctive features to face regions
  const faceRegions = analysis.subjects
    .filter(
      (s) =>
        s.distinctiveFeatures.length > 0 &&
        (analysis.photoType === "portrait" ||
          analysis.photoType === "group" ||
          s.description.toLowerCase().includes("person") ||
          s.description.toLowerCase().includes("man") ||
          s.description.toLowerCase().includes("woman") ||
          s.description.toLowerCase().includes("boy") ||
          s.description.toLowerCase().includes("girl") ||
          s.description.toLowerCase().includes("child")),
    )
    .map((subject) => ({
      description: subject.description,
      position: bboxToPosition(subject.boundingBox),
      distinguishingFeatures: subject.distinctiveFeatures,
    }));

  // Derive background strategy from complexity score
  const backgroundStrategy = deriveBackgroundStrategy(
    analysis.background.complexity,
    analysis.photoType,
  );

  // Build scene description from available data
  const sceneDescription =
    analysis.subjects.length > 0
      ? `${analysis.photoType}: ${analysis.subjects.map((s) => s.description).join(", ")} with ${analysis.background.description}`
      : analysis.background.description;

  const spatialLayout =
    analysis.photoType === "portrait"
      ? "portrait close-up"
      : analysis.photoType === "group"
        ? "group scene"
        : analysis.photoType === "landscape"
          ? "landscape"
          : analysis.photoType;

  return {
    elements,
    faceRegions,
    sceneDescription,
    spatialLayout,
    backgroundStrategy,
  };
}

function bboxToPosition(bbox: { x: number; y: number }): string {
  const horizontal = bbox.x < 0.33 ? "left" : bbox.x > 0.66 ? "right" : "";
  const vertical = bbox.y < 0.33 ? "top" : bbox.y > 0.66 ? "bottom" : "";
  if (horizontal && vertical) return `${vertical}-${horizontal}`;
  if (horizontal) return horizontal;
  if (vertical) return vertical;
  return "center";
}

function deriveBackgroundStrategy(
  complexity: number,
  photoType: string,
): "remove" | "simplify" | "preserve-structure" | "preserve-detail" {
  if (photoType === "landmark") return "preserve-detail";
  if (photoType === "landscape") return "preserve-structure";
  if (complexity <= 2) return "remove";
  if (complexity <= 5) return "simplify";
  if (complexity <= 8) return "preserve-structure";
  return "preserve-detail";
}
