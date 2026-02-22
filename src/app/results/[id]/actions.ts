"use server";

import { loadMetadata, loadAnalysis, updateRatings } from "@/lib/batch/storage";
import type { BatchRun, BatchAnalysis } from "@/lib/batch/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function fail(error: unknown): { success: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[results-action]", message, error);
  return { success: false, error: message };
}

// ─── Load batch run ────────────────────────────────────────────────────────

export interface LoadBatchResult {
  batchRun: BatchRun;
  analysis: BatchAnalysis;
}

export async function loadBatchAction(
  batchId: string,
): Promise<ActionResult<LoadBatchResult>> {
  try {
    const [batchRun, analysis] = await Promise.all([
      loadMetadata(batchId),
      loadAnalysis(batchId),
    ]);

    const safeData = JSON.parse(
      JSON.stringify({ batchRun, analysis }),
    ) as LoadBatchResult;

    return { success: true, data: safeData };
  } catch (error) {
    return fail(error);
  }
}

// ─── Update ratings ────────────────────────────────────────────────────────

export async function updateRatingsAction(
  batchId: string,
  ratings: Record<string, Record<string, number>>,
): Promise<ActionResult<void>> {
  try {
    await updateRatings(batchId, ratings);
    console.log("[results] Ratings updated for batch:", batchId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
