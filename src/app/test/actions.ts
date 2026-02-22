"use server";

import { mkdir, appendFile } from "fs/promises";
import { join } from "path";
import {
  type AnalysisResult,
  type ImageAnalysis,
  type GenerationResult,
  GENERATION_MODELS,
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

// ─── Result wrapper (server actions can't throw class instances) ─────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function fail(error: unknown): { success: false; error: string } {
  const message =
    error instanceof Error ? error.message : String(error);
  console.error("[test-action]", message, error);
  return { success: false, error: message };
}

// ─── Analyze Action ─────────────────────────────────────────────────────────

export interface AnalyzeResult {
  imageUrl: string;
  imageAnalysis: ImageAnalysis;
  analysisResult: AnalysisResult;
  timingMs: number;
}

export async function analyzeAction(
  formData: FormData,
): Promise<ActionResult<AnalyzeResult>> {
  try {
    const file = formData.get("image") as File | null;
    console.log("[analyze] Action called, file:", file?.name, file?.size, "bytes");
    if (!file) return fail(new Error("No image file provided"));

    console.log("[analyze] Uploading image to fal storage...");
    const imageUrl = await uploadToFalStorage(file);
    console.log("[analyze] Uploaded:", imageUrl);

    console.log("[analyze] Running Claude analysis...");
    const start = performance.now();
    const imageAnalysis = await analyzePhoto(imageUrl);
    const timingMs = Math.round(performance.now() - start);
    console.log("[analyze] Done in", timingMs, "ms");

    const analysisResult = imageAnalysisToAnalysisResult(imageAnalysis);

    // JSON round-trip to strip any non-serializable properties
    // (e.g. Zod metadata, class instances from Anthropic SDK)
    const safeData = JSON.parse(
      JSON.stringify({ imageUrl, imageAnalysis, analysisResult, timingMs }),
    ) as AnalyzeResult;

    return { success: true, data: safeData };
  } catch (error) {
    return fail(error);
  }
}

// ─── Upload Only (when analysis is off) ─────────────────────────────────────

export async function uploadAction(
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const file = formData.get("image") as File | null;
    if (!file) return fail(new Error("No image file provided"));

    console.log("[upload] Uploading image to fal storage...");
    const imageUrl = await uploadToFalStorage(file);
    console.log("[upload] Uploaded:", imageUrl);

    return { success: true, data: imageUrl };
  } catch (error) {
    return fail(error);
  }
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
): Promise<ActionResult<GenerateResult>> {
  try {
    const { imageUrl, analysisResult, model, promptVariant, complexity } =
      params;

    const modelInfo = GENERATION_MODELS.find((m) => m.id === model);
    const isEdit = modelInfo?.type === "edit" || model.endsWith("/edit");

    let generation: GenerationResult;
    const genStart = performance.now();

    if (isEdit) {
      const prompt = buildEditPrompt(promptVariant, complexity, analysisResult);
      console.log("[generate] Calling edit endpoint:", model);
      console.log("[generate] Prompt length:", prompt.length, "chars");

      const response = await callImageEdit({
        model,
        prompt,
        imageUrls: [imageUrl],
        outputFormat: "png",
      });

      const firstImage = response.images[0];
      if (!firstImage) {
        return fail(new Error("Image edit returned no images"));
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
      const { prompt, negativePrompt } = buildGenerationPrompt(
        promptVariant,
        complexity,
        analysisResult,
      );
      const inferenceConfig = getInferenceConfig(complexity);
      console.log("[generate] Calling text-to-image:", model);

      const response = await callImageGeneration({
        prompt,
        negativePrompt,
        imageSize: "square_hd",
        numInferenceSteps: inferenceConfig.numInferenceSteps,
        guidanceScale: inferenceConfig.guidanceScale,
      });

      const firstImage = response.images[0];
      if (!firstImage) {
        return fail(new Error("Image generation returned no images"));
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
    console.log("[generate] Generation done in", generationMs, "ms");

    console.log("[generate] Post-processing...");
    const ppStart = performance.now();
    const finalImage = await postProcessColoringPage(generation.imageUrl, {
      outputFormat: "png",
    });
    const postProcessMs = Math.round(performance.now() - ppStart);
    console.log("[generate] Post-process done in", postProcessMs, "ms");

    const imageBase64 = finalImage.toString("base64");

    return {
      success: true,
      data: {
        imageBase64,
        mimeType: "image/png",
        generation,
        generationMs,
        postProcessMs,
      },
    };
  } catch (error) {
    return fail(error);
  }
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

export async function saveLogAction(
  entry: TestLogEntry,
): Promise<ActionResult<void>> {
  try {
    const logDir = join(process.cwd(), "test-logs");
    await mkdir(logDir, { recursive: true });

    const logPath = join(logDir, "results.jsonl");
    await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
    console.log("[save-log] Entry saved to", logPath);

    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
