import type {
  ImageAnalysis,
  AnalysisResult,
  GenerationResult,
} from "@/lib/pipeline/types";

// ─── Batch constants ───────────────────────────────────────────────────────

export const BATCH_COMPLEXITY_LEVELS = ["child", "adult"] as const;
export type BatchComplexityLevel = (typeof BATCH_COMPLEXITY_LEVELS)[number];

export const BATCH_VARIANTS = [
  "direct-transform",
  "preservation-heavy",
  "simplification-heavy",
] as const;

export const QUALITY_CRITERIA = [
  { key: "lineClarity", label: "Line Clarity" },
  { key: "recognizability", label: "Recognizability" },
  { key: "colorability", label: "Colorability" },
  { key: "complexityMatch", label: "Complexity Match" },
  { key: "overall", label: "Overall Quality" },
] as const;

// ─── Sort modes ────────────────────────────────────────────────────────────

export type SortMode = "model-complexity-variant" | "variant-model-complexity";

// ─── Per-iteration result ──────────────────────────────────────────────────

export interface BatchResult {
  model: string;
  modelLabel: string;
  complexity: string;
  variant: string;
  outputFileName: string;
  generation: GenerationResult;
  generationMs: number;
  postProcessMs: number;
  ratings: Record<string, number>;
  error?: string;
}

// ─── Batch analysis data ───────────────────────────────────────────────────

export interface BatchAnalysis {
  imageAnalysis: ImageAnalysis;
  analysisResult: AnalysisResult;
  timingMs: number;
}

// ─── Top-level batch run metadata ──────────────────────────────────────────

export interface BatchRun {
  id: string;
  timestamp: string;
  inputFileName: string;
  totalIterations: number;
  completedIterations: number;
  failedIterations: number;
  results: BatchResult[];
}

// ─── Summary for the listing page ──────────────────────────────────────────

export interface BatchRunSummary {
  id: string;
  timestamp: string;
  inputFileName: string;
  totalIterations: number;
  completedIterations: number;
  failedIterations: number;
  hasRatings: boolean;
}

// ─── File naming helper ────────────────────────────────────────────────────

export function buildOutputFileName(
  complexity: string,
  variant: string,
  model: string,
): string {
  const modelSlug = model
    .replace(/^fal-ai\//, "")
    .replace(/\/edit$/, "")
    .replace(/[^a-z0-9-]/g, "-");
  return `${complexity}--${variant}--${modelSlug}.png`;
}
