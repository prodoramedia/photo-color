import {
  type AnalysisResult,
  type GenerationResult,
  type ImageAnalysis,
  type PipelineInput,
  type PipelineOutput,
  PipelineError,
  PipelineOptionsSchema,
} from "@/lib/pipeline/types";
import {
  buildGenerationPrompt,
  getInferenceConfig,
} from "@/lib/prompts/generation";
import {
  callImageGeneration,
  uploadToFalStorage,
} from "@/lib/pipeline/fal-client";
import {
  analyzePhoto,
  imageAnalysisToAnalysisResult,
} from "@/lib/pipeline/analyzer";
import { postProcessColoringPage } from "@/lib/pipeline/post-process";

async function resolveImageUrl(image: File | Blob | string): Promise<string> {
  if (typeof image === "string") return image;
  return uploadToFalStorage(image);
}

// ─── Individual Pipeline Steps ──────────────────────────────────────────────

/**
 * Step 1: Analyze the input image using Claude's vision model.
 * Returns the rich ImageAnalysis with subjects, bounding boxes,
 * background complexity, and simplification targets.
 */
export async function analyzeImage(
  input: PipelineInput,
): Promise<{ imageAnalysis: ImageAnalysis; analysisResult: AnalysisResult }> {
  const imageUrl = await resolveImageUrl(input.image);
  const imageAnalysis = await analyzePhoto(imageUrl);
  const analysisResult = imageAnalysisToAnalysisResult(imageAnalysis);
  return { imageAnalysis, analysisResult };
}

/**
 * Step 2: Generate a coloring page based on the analysis.
 * Uses the image generation model with a complexity-tuned prompt.
 */
export async function generateColoringPage(
  input: PipelineInput,
  analysis: AnalysisResult,
): Promise<GenerationResult> {
  const { prompt, negativePrompt } = buildGenerationPrompt(
    input.options.promptVariant,
    input.options.targetComplexity,
    analysis,
  );
  const inferenceConfig = getInferenceConfig(input.options.targetComplexity);

  const response = await callImageGeneration({
    prompt,
    negativePrompt,
    imageSize: "square_hd",
    numInferenceSteps: inferenceConfig.numInferenceSteps,
    guidanceScale: inferenceConfig.guidanceScale,
  });

  const firstImage = response.images[0];
  if (!firstImage) {
    throw new PipelineError(
      "Image generation returned no images",
      "generation",
    );
  }

  return {
    imageUrl: firstImage.url,
    width: firstImage.width,
    height: firstImage.height,
    model: "fal-ai/fast-sdxl",
    promptUsed: prompt,
    negativePromptUsed: negativePrompt,
    seed: response.seed,
  };
}

/**
 * Step 3: Post-process the generated image for clean coloring page output.
 */
export async function postProcess(
  imageUrlOrBuffer: string | Buffer,
  options?: {
    readonly outputFormat?: "png" | "jpeg";
    readonly outputWidth?: number;
    readonly outputHeight?: number;
  },
): Promise<Buffer> {
  return postProcessColoringPage(imageUrlOrBuffer, {
    threshold: 128,
    denoise: true,
    denoiseKernel: 3,
    outputFormat: options?.outputFormat ?? "png",
    outputWidth: options?.outputWidth,
    outputHeight: options?.outputHeight,
  });
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

/**
 * Runs the complete coloring page generation pipeline:
 * 1. Validates input options
 * 2. Analyzes the input image (Claude vision)
 * 3. Generates a coloring page (fal.ai image generation)
 * 4. Post-processes the result (Sharp)
 */
export async function runPipeline(
  input: PipelineInput,
): Promise<PipelineOutput> {
  const pipelineStart = performance.now();

  // Validate options
  const optionsResult = PipelineOptionsSchema.safeParse(input.options);
  if (!optionsResult.success) {
    throw new PipelineError(
      `Invalid pipeline options: ${optionsResult.error.message}`,
      "analysis",
      optionsResult.error,
    );
  }
  const validatedInput: PipelineInput = {
    image: input.image,
    options: optionsResult.data,
  };

  // Step 1: Analysis (Claude vision)
  const analysisStart = performance.now();
  const { imageAnalysis, analysisResult } =
    await analyzeImage(validatedInput);
  const analysisMs = performance.now() - analysisStart;

  // Step 2: Generation (fal.ai)
  const generationStart = performance.now();
  const generation = await generateColoringPage(
    validatedInput,
    analysisResult,
  );
  const generationMs = performance.now() - generationStart;

  // Step 3: Post-processing (Sharp)
  const postProcessStart = performance.now();
  const outputFormat =
    validatedInput.options.outputFormat === "jpeg" ? "jpeg" : "png";
  const finalImage = await postProcess(generation.imageUrl, {
    outputFormat,
    outputWidth: validatedInput.options.outputWidth,
    outputHeight: validatedInput.options.outputHeight,
  });
  const postProcessingMs = performance.now() - postProcessStart;

  const totalMs = performance.now() - pipelineStart;

  return {
    finalImage,
    mimeType: outputFormat === "png" ? "image/png" : "image/jpeg",
    imageAnalysis,
    analysis: analysisResult,
    generation,
    timing: {
      analysisMs: Math.round(analysisMs),
      generationMs: Math.round(generationMs),
      postProcessingMs: Math.round(postProcessingMs),
      totalMs: Math.round(totalMs),
    },
  };
}
