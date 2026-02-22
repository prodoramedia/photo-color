"use server";

import { randomUUID } from "crypto";
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
import {
  GENERATION_MODELS,
  type AnalysisResult,
  type GenerationResult,
  type ComplexityLevel,
  type PromptVariant,
} from "@/lib/pipeline/types";
import {
  initBatchDir,
  saveInputImage,
  saveAnalysis,
  saveOutputImage,
  saveMetadata,
} from "@/lib/batch/storage";
import type { BatchAnalysis, BatchRun } from "@/lib/batch/types";
import { buildOutputFileName } from "@/lib/batch/types";

// ─── ActionResult (same pattern as test/actions.ts) ────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function fail(error: unknown): { success: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[batch-action]", message, error);
  return { success: false, error: message };
}

// ─── 1. Initialize batch + analyze ─────────────────────────────────────────

export interface InitBatchResult {
  batchId: string;
  imageUrl: string;
  inputFileName: string;
  analysis: BatchAnalysis;
}

export async function initBatchAction(
  formData: FormData,
): Promise<ActionResult<InitBatchResult>> {
  try {
    const file = formData.get("image") as File | null;
    if (!file) return fail(new Error("No image file provided"));

    const batchId = randomUUID().slice(0, 8) + "-" + Date.now();
    console.log("[batch] Init batch:", batchId);

    // Create directory structure
    await initBatchDir(batchId);

    // Save input image to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.name.split(".").pop() ?? "png";
    const inputFileName = await saveInputImage(batchId, buffer, ext);

    // Upload to fal storage (temporary URL for generation)
    console.log("[batch] Uploading to fal storage...");
    const imageUrl = await uploadToFalStorage(file);
    console.log("[batch] Uploaded:", imageUrl);

    // Run Claude analysis once
    console.log("[batch] Running Claude analysis...");
    const start = performance.now();
    const imageAnalysis = await analyzePhoto(imageUrl);
    const timingMs = Math.round(performance.now() - start);
    const analysisResult = imageAnalysisToAnalysisResult(imageAnalysis);
    console.log("[batch] Analysis done in", timingMs, "ms");

    const analysis: BatchAnalysis = {
      imageAnalysis,
      analysisResult,
      timingMs,
    };

    // Save analysis to disk
    await saveAnalysis(batchId, analysis);

    const safeData = JSON.parse(
      JSON.stringify({ batchId, imageUrl, inputFileName, analysis }),
    ) as InitBatchResult;

    return { success: true, data: safeData };
  } catch (error) {
    return fail(error);
  }
}

// ─── 2. Generate one iteration ─────────────────────────────────────────────

export interface GenerateIterationParams {
  batchId: string;
  imageUrl: string;
  analysisResult: AnalysisResult;
  model: string;
  complexity: ComplexityLevel;
  variant: PromptVariant;
}

export interface GenerateIterationResult {
  outputFileName: string;
  modelLabel: string;
  generation: GenerationResult;
  generationMs: number;
  postProcessMs: number;
}

export async function generateIterationAction(
  params: GenerateIterationParams,
): Promise<ActionResult<GenerateIterationResult>> {
  try {
    const { batchId, imageUrl, analysisResult, model, complexity, variant } =
      params;

    const modelInfo = GENERATION_MODELS.find((m) => m.id === model);
    const modelLabel = modelInfo?.label ?? model;
    const isEdit = modelInfo?.type === "edit" || model.endsWith("/edit");
    const outputFileName = buildOutputFileName(complexity, variant, model);

    console.log(
      `[batch] Generating: ${complexity} / ${variant} / ${modelLabel}`,
    );

    let generation: GenerationResult;
    const genStart = performance.now();

    if (isEdit) {
      const prompt = buildEditPrompt(variant, complexity, analysisResult);
      const response = await callImageEdit({
        model,
        prompt,
        imageUrls: [imageUrl],
        outputFormat: "png",
      });
      const firstImage = response.images[0];
      if (!firstImage) return fail(new Error("Edit returned no images"));
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
        variant,
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
      if (!firstImage) return fail(new Error("Generation returned no images"));
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
    console.log(`[batch] Generation done in ${generationMs}ms`);

    // Post-process
    const ppStart = performance.now();
    const finalImage = await postProcessColoringPage(generation.imageUrl, {
      outputFormat: "png",
    });
    const postProcessMs = Math.round(performance.now() - ppStart);
    console.log(`[batch] Post-process done in ${postProcessMs}ms`);

    // Save output image to disk
    await saveOutputImage(batchId, outputFileName, finalImage);

    const safeData = JSON.parse(
      JSON.stringify({
        outputFileName,
        modelLabel,
        generation,
        generationMs,
        postProcessMs,
      }),
    ) as GenerateIterationResult;

    return { success: true, data: safeData };
  } catch (error) {
    return fail(error);
  }
}

// ─── 3. Save batch metadata ────────────────────────────────────────────────

export async function saveBatchAction(
  batchRun: BatchRun,
): Promise<ActionResult<void>> {
  try {
    await saveMetadata(batchRun.id, batchRun);
    console.log("[batch] Metadata saved for batch:", batchRun.id);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
