import { z } from "zod";

// ─── Complexity Level ───────────────────────────────────────────────────────

export const ComplexityLevel = z.enum(["toddler", "child", "tween", "adult"]);
export type ComplexityLevel = z.infer<typeof ComplexityLevel>;

// ─── Prompt Variant ─────────────────────────────────────────────────────────

export const PromptVariant = z.enum([
  "direct-transform",
  "preservation-heavy",
  "simplification-heavy",
]);
export type PromptVariant = z.infer<typeof PromptVariant>;

// ─── Pipeline Options ───────────────────────────────────────────────────────

export const PipelineOptionsSchema = z.object({
  targetComplexity: ComplexityLevel,
  promptVariant: PromptVariant.default("direct-transform"),
  preserveFaces: z.boolean().default(true),
  outputFormat: z.enum(["png", "jpeg"]).default("png"),
  outputWidth: z.number().int().positive().optional(),
  outputHeight: z.number().int().positive().optional(),
});

export type PipelineOptions = z.infer<typeof PipelineOptionsSchema>;

// ─── Pipeline Input ─────────────────────────────────────────────────────────

export interface PipelineInput {
  readonly image: File | Blob | string;
  readonly options: PipelineOptions;
}

// ─── Detected Element ───────────────────────────────────────────────────────

export const DetectedElementSchema = z.object({
  label: z.string(),
  importance: z.number().int().positive(),
  category: z.enum(["subject", "object", "background", "accessory"]),
  description: z.string(),
});

export type DetectedElement = z.infer<typeof DetectedElementSchema>;

// ─── Face Region ────────────────────────────────────────────────────────────

export const FaceRegionSchema = z.object({
  description: z.string(),
  position: z.string(),
  distinguishingFeatures: z.array(z.string()),
});

export type FaceRegion = z.infer<typeof FaceRegionSchema>;

// ─── Analysis Result ────────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  elements: z.array(DetectedElementSchema).min(1),
  faceRegions: z.array(FaceRegionSchema),
  sceneDescription: z.string(),
  spatialLayout: z.string(),
  backgroundStrategy: z.enum([
    "remove",
    "simplify",
    "preserve-structure",
    "preserve-detail",
  ]),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ─── Image Analysis (Claude Vision) ─────────────────────────────────────────

export const PhotoType = z.enum([
  "portrait",
  "group",
  "pet",
  "landscape",
  "landmark",
  "other",
]);
export type PhotoType = z.infer<typeof PhotoType>;

export const BoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const SubjectSchema = z.object({
  description: z.string(),
  boundingBox: BoundingBoxSchema,
  distinctiveFeatures: z.array(z.string()),
});
export type Subject = z.infer<typeof SubjectSchema>;

export const BackgroundInfoSchema = z.object({
  description: z.string(),
  complexity: z.number().int().min(1).max(10),
  keyElements: z.array(z.string()),
});
export type BackgroundInfo = z.infer<typeof BackgroundInfoSchema>;

export const SimplificationTargetSchema = z.object({
  element: z.string(),
  reason: z.string(),
  applicableComplexity: z.array(ComplexityLevel),
});
export type SimplificationTarget = z.infer<typeof SimplificationTargetSchema>;

export const ImageAnalysisSchema = z.object({
  photoType: PhotoType,
  subjects: z.array(SubjectSchema),
  background: BackgroundInfoSchema,
  preservationPriorities: z.array(z.string()),
  simplificationTargets: z.array(SimplificationTargetSchema),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

// ─── FAL Vision Response ────────────────────────────────────────────────────

export const VisionResponseSchema = z.object({
  output: z.string(),
  partial: z.boolean().optional(),
});

export type VisionResponse = z.infer<typeof VisionResponseSchema>;

// ─── FAL Image Generation Response ──────────────────────────────────────────

export const GeneratedImageSchema = z.object({
  url: z.string().url(),
  content_type: z.string().optional(),
  file_name: z.string().optional(),
  file_size: z.number().optional(),
  file_data: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const ImageGenerationResponseSchema = z.object({
  images: z.array(GeneratedImageSchema).min(1),
  timings: z.unknown(),
  seed: z.number(),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
  prompt: z.string().optional(),
});

export type ImageGenerationResponse = z.infer<
  typeof ImageGenerationResponseSchema
>;

// ─── Generation Result ──────────────────────────────────────────────────────

export interface GenerationResult {
  readonly imageUrl: string;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly model: string;
  readonly promptUsed: string;
  readonly negativePromptUsed: string;
  readonly seed: number;
}

// ─── Pipeline Output ────────────────────────────────────────────────────────

export interface PipelineOutput {
  readonly finalImage: Buffer;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly imageAnalysis: ImageAnalysis;
  readonly analysis: AnalysisResult;
  readonly generation: GenerationResult;
  readonly timing: {
    readonly analysisMs: number;
    readonly generationMs: number;
    readonly postProcessingMs: number;
    readonly totalMs: number;
  };
}

// ─── Pipeline Error ─────────────────────────────────────────────────────────

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly stage: "analysis" | "generation" | "post-processing",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
