import { fal } from "@fal-ai/client";
import {
  type AnalysisResult,
  AnalysisResultSchema,
  type ImageGenerationResponse,
  ImageGenerationResponseSchema,
  PipelineError,
  VisionResponseSchema,
} from "@/lib/pipeline/types";

// fal.ai auto-reads FAL_KEY from process.env — no explicit config needed.
// This module must only be imported in server-side code.

const VISION_MODEL = "fal-ai/llavav15-13b" as const;
const IMAGE_GENERATION_MODEL = "fal-ai/fast-sdxl" as const;

// ─── Vision Analysis ────────────────────────────────────────────────────────

interface VisionCallOptions {
  readonly imageUrl: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/**
 * Calls the vision model and parses the output as an AnalysisResult JSON.
 */
export async function analyzeImageWithVision(
  imageUrl: string,
  prompt: string,
): Promise<AnalysisResult> {
  const result = await fal.subscribe(VISION_MODEL, {
    input: {
      image_url: imageUrl,
      prompt,
      max_tokens: 1024,
      temperature: 0.1,
    },
    logs: true,
  });

  const visionParsed = VisionResponseSchema.safeParse(result.data);
  if (!visionParsed.success) {
    throw new PipelineError(
      `Vision model response validation failed: ${visionParsed.error.message}`,
      "analysis",
      visionParsed.error,
    );
  }

  const rawOutput = visionParsed.data.output.trim();

  // Strip markdown code fences if the model wraps its output
  const jsonString = rawOutput
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(jsonString);
  } catch (parseError) {
    throw new PipelineError(
      `Vision model did not return valid JSON. Raw output: ${rawOutput.slice(0, 500)}`,
      "analysis",
      parseError,
    );
  }

  const parsed = AnalysisResultSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new PipelineError(
      `Vision model output did not match expected schema: ${parsed.error.message}`,
      "analysis",
      parsed.error,
    );
  }

  return parsed.data;
}

// ─── Image Generation ───────────────────────────────────────────────────────

interface ImageGenerationCallOptions {
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly imageSize?:
    | "square_hd"
    | "square"
    | "portrait_4_3"
    | "portrait_16_9"
    | "landscape_4_3"
    | "landscape_16_9";
  readonly numInferenceSteps?: number;
  readonly guidanceScale?: number;
  readonly seed?: number;
}

export async function callImageGeneration(
  options: ImageGenerationCallOptions,
): Promise<ImageGenerationResponse> {
  const {
    prompt,
    negativePrompt,
    imageSize = "square_hd",
    numInferenceSteps = 25,
    guidanceScale = 7.5,
    seed,
  } = options;

  const result = await fal.subscribe(IMAGE_GENERATION_MODEL, {
    input: {
      prompt,
      negative_prompt: negativePrompt,
      image_size: imageSize,
      num_inference_steps: numInferenceSteps,
      guidance_scale: guidanceScale,
      num_images: 1,
      format: "png",
      enable_safety_checker: true,
      ...(seed !== undefined ? { seed } : {}),
    },
    logs: true,
  });

  const parsed = ImageGenerationResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new PipelineError(
      `Image generation response validation failed: ${parsed.error.message}`,
      "generation",
      parsed.error,
    );
  }

  return parsed.data;
}

// ─── File Upload ────────────────────────────────────────────────────────────

/**
 * Uploads a File or Blob to fal.ai temporary storage.
 * Returns the publicly accessible URL.
 */
export async function uploadToFalStorage(file: File | Blob): Promise<string> {
  return fal.storage.upload(file);
}
