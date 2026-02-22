import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { BatchRun, BatchRunSummary, BatchAnalysis } from "./types";

const RESULTS_DIR = join(process.cwd(), "test-results");

// ─── Directory helpers ─────────────────────────────────────────────────────

export function getBatchDir(batchId: string): string {
  return join(RESULTS_DIR, batchId);
}

function getOutputsDir(batchId: string): string {
  return join(RESULTS_DIR, batchId, "outputs");
}

// ─── Create batch directory ────────────────────────────────────────────────

export async function initBatchDir(batchId: string): Promise<void> {
  await mkdir(getOutputsDir(batchId), { recursive: true });
}

// ─── Save input image ──────────────────────────────────────────────────────

export async function saveInputImage(
  batchId: string,
  buffer: Buffer,
  extension: string,
): Promise<string> {
  const fileName = `input.${extension}`;
  await writeFile(join(getBatchDir(batchId), fileName), buffer);
  return fileName;
}

// ─── Save output image ─────────────────────────────────────────────────────

export async function saveOutputImage(
  batchId: string,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  await writeFile(join(getOutputsDir(batchId), fileName), buffer);
}

// ─── Analysis ──────────────────────────────────────────────────────────────

export async function saveAnalysis(
  batchId: string,
  analysis: BatchAnalysis,
): Promise<void> {
  const filePath = join(getBatchDir(batchId), "analysis.json");
  await writeFile(filePath, JSON.stringify(analysis, null, 2), "utf-8");
}

export async function loadAnalysis(batchId: string): Promise<BatchAnalysis> {
  const filePath = join(getBatchDir(batchId), "analysis.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as BatchAnalysis;
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function saveMetadata(
  batchId: string,
  metadata: BatchRun,
): Promise<void> {
  const filePath = join(getBatchDir(batchId), "metadata.json");
  await writeFile(filePath, JSON.stringify(metadata, null, 2), "utf-8");
}

export async function loadMetadata(batchId: string): Promise<BatchRun> {
  const filePath = join(getBatchDir(batchId), "metadata.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as BatchRun;
}

// ─── List all batch runs ───────────────────────────────────────────────────

export async function listBatchRuns(): Promise<BatchRunSummary[]> {
  try {
    const entries = await readdir(RESULTS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    const summaries: BatchRunSummary[] = [];
    for (const dir of dirs) {
      try {
        const meta = await loadMetadata(dir.name);
        const hasRatings = meta.results.some(
          (r) => Object.keys(r.ratings).length > 0,
        );
        summaries.push({
          id: meta.id,
          timestamp: meta.timestamp,
          inputFileName: meta.inputFileName,
          totalIterations: meta.totalIterations,
          completedIterations: meta.completedIterations,
          failedIterations: meta.failedIterations,
          hasRatings,
        });
      } catch {
        // Skip directories without valid metadata
      }
    }

    summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return summaries;
  } catch {
    return [];
  }
}

// ─── Update ratings ────────────────────────────────────────────────────────

export async function updateRatings(
  batchId: string,
  ratings: Record<string, Record<string, number>>,
): Promise<BatchRun> {
  const meta = await loadMetadata(batchId);
  for (const result of meta.results) {
    if (ratings[result.outputFileName]) {
      result.ratings = ratings[result.outputFileName];
    }
  }
  await saveMetadata(batchId, meta);
  return meta;
}
