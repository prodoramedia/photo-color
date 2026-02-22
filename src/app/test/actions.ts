"use server";

import { mkdir, appendFile } from "fs/promises";
import { join } from "path";
import {
  type AnalysisResult,
  type ImageAnalysis,
  type GenerationResult,
  GENERATION_MODELS,
  PipelineError,
} from "@/lib/pipeline/types";
import {
  analyzePhoto,
  imageAnalysisToAnalysisResult,
} from "@/lib/pipeline/analyzer";
import {
  callImageEdit,
  callImageGeneration,
  uploadToFalStorage,
} from "@/lib/pipeline/fal-client";
import { postProcessColoringPage } from "@/lib/pipeline/post-process";
import {
  buildEditPrompt,
  buildGenerationPrompt,
  getInferenceConfig,
} from "@/lib/prompts/generation";
import type { ComplexityLevel, PromptVariant } from "@/lib/pipeline/types";

// ─── Analyze Action ─────────────────────────────────────────────────────────

export interface AnalyzeResult {
  imageUrl: string;
  imageAnalysis: ImageAnalysis;
  analysisResult: AnalysisResult;
  timingMs: number;
}

export async function analyzeAction(
  formData: FormData,
): Promise<AnalyzeResult> {
  const file = formData.get("image") as File | null;
  if (!file) throw new Error("No image file provided");

  // Upload to fal storage
  const imageUrl = await uploadToFalStorage(file);

  // Run Claude analysis
  const start = performance.now();
  const imageAnalysis = await analyzePhoto(imageUrl);
  const timingMs = Math.round(performance.now() - start);

  const analysisResult = imageAnalysisToAnalysisResult(imageAnalysis);

  return { imageUrl, imageAnalysis, analysisResult, timingMs };
}

// ─── Upload Only (when analysis is off) ─────────────────────────────────────

export async function uploadAction(formData: FormData): Promise<string> {
  const file = formData.get("image") as File | null;
  if (!file) throw new Error("No image file provided");
  return uploadToFalStorage(file);
}

// ─── Generate Action ────────────────────────────────────────────────────────

export interface GenerateParams {
  imageUrl: string;
  analysisResult?: AnalysisResult;
  model: string;
  promptVariant: PromptVariant;
  complexity: ComplexityLevel;
}

export interface GenerateResult {
  imageBase64: string;
  mimeType: string;
  generation: GenerationResult;
  generationMs: number;
  postProcessMs: number;
}

export async function generateAction(
  params: GenerateParams,
): Promise<GenerateResult> {
  const { imageUrl, analysisResult, model, promptVariant, complexity } = params;

  const modelInfo = GENERATION_MODELS.find((m) => m.id === model);
  const isEdit = modelInfo?.type === "edit" || model.endsWith("/edit");

  let generation: GenerationResult;
  const genStart = performance.now();

  if (isEdit) {
    // Edit endpoint: image-to-image
    const prompt = buildEditPrompt(promptVariant, complexity, analysisResult);

    const response = await callImageEdit({
      model,
      prompt,
      imageUrls: [imageUrl],
      outputFormat: "png",
    });

    const firstImage = response.images[0];
    if (!firstImage) {
      throw new PipelineError(
        "Image edit returned no images",
        "generation",
      );
    }

    generation = {
      imageUrl: firstImage.url,
      width: undefined,
      height: undefined,
      model,
      promptUsed: prompt,
      description: response.description,
    };
  } else {
    // Text-to-image endpoint (fast-sdxl)
    const { prompt, negativePrompt } = buildGenerationPrompt(
      promptVariant,
      complexity,
      analysisResult,
    );
    const inferenceConfig = getInferenceConfig(complexity);

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

    generation = {
      imageUrl: firstImage.url,
      width: firstImage.width,
      height: firstImage.height,
      model,
      promptUsed: prompt,
      negativePromptUsed: negativePrompt,
      seed: response.seed,
    };
  }

  const generationMs = Math.round(performance.now() - genStart);

  // Post-process
  const ppStart = performance.now();
  const finalImage = await postProcessColoringPage(generation.imageUrl, {
    outputFormat: "png",
  });
  const postProcessMs = Math.round(performance.now() - ppStart);

  const imageBase64 = finalImage.toString("base64");

  return {
    imageBase64,
    mimeType: "image/png",
    generation,
    generationMs,
    postProcessMs,
  };
}

// ─── Save Log Action ────────────────────────────────────────────────────────

export interface TestLogEntry {
  timestamp: string;
  params: {
    model: string;
    promptVariant: string;
    complexity: string;
    analysisEnabled: boolean;
  };
  imageAnalysis?: ImageAnalysis;
  analysisResult?: AnalysisResult;
  generation: GenerationResult;
  timing: {
    analysisMs?: number;
    generationMs: number;
    postProcessMs: number;
  };
  ratings: Record<string, number>;
}

export async function saveLogAction(entry: TestLogEntry): Promise<void> {
  const logDir = join(process.cwd(), "test-logs");
  await mkdir(logDir, { recursive: true });

  const logPath = join(logDir, "results.jsonl");
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
