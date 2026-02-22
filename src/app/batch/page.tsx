"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  initBatchAction,
  generateIterationAction,
  saveBatchAction,
  type InitBatchResult,
  type GenerateIterationResult,
} from "./actions";
import { GENERATION_MODELS } from "@/lib/pipeline/types";
import type { ComplexityLevel, PromptVariant } from "@/lib/pipeline/types";
import {
  BATCH_COMPLEXITY_LEVELS,
  BATCH_VARIANTS,
  QUALITY_CRITERIA,
  type BatchAnalysis,
  type BatchResult,
  type BatchRun,
  type SortMode,
  buildOutputFileName,
} from "@/lib/batch/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_ITERATIONS =
  BATCH_COMPLEXITY_LEVELS.length * BATCH_VARIANTS.length * GENERATION_MODELS.length;

type BatchPhase = "upload" | "analyzing" | "generating" | "done" | "error";

// ─── Elapsed Timer Hook ────────────────────────────────────────────────────

function useElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 100);
    }, 100);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { elapsed, start, stop };
}

// ─── Sort Helper ────────────────────────────────────────────────────────────

function sortResults(results: BatchResult[], mode: SortMode): BatchResult[] {
  const sorted = [...results];
  if (mode === "model-complexity-variant") {
    sorted.sort((a, b) => {
      if (a.model !== b.model) return a.model.localeCompare(b.model);
      if (a.complexity !== b.complexity)
        return a.complexity.localeCompare(b.complexity);
      return a.variant.localeCompare(b.variant);
    });
  } else {
    sorted.sort((a, b) => {
      if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
      if (a.model !== b.model) return a.model.localeCompare(b.model);
      return a.complexity.localeCompare(b.complexity);
    });
  }
  return sorted;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function BatchPage() {
  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch state
  const [phase, setPhase] = useState<BatchPhase>("upload");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [inputFileName, setInputFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BatchAnalysis | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Display
  const [sortMode, setSortMode] = useState<SortMode>("model-complexity-variant");
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [saved, setSaved] = useState(false);

  const timer = useElapsedTimer();

  // ─── File Handling ────────────────────────────────────────────────────

  function handleFile(f: File) {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setBatchId(null);
    setAnalysis(null);
    setResults([]);
    setCompletedCount(0);
    setErrors([]);
    setError(null);
    setRatings({});
    setSaved(false);
    setPhase("upload");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("image/")) handleFile(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  // ─── Run All Tests ────────────────────────────────────────────────────

  async function handleRunAll() {
    if (!file) return;

    setPhase("analyzing");
    setError(null);
    setResults([]);
    setErrors([]);
    setCompletedCount(0);
    setSaved(false);
    timer.start();

    // Step 1: Init batch + analyze
    const formData = new FormData();
    formData.append("image", file);
    const initResult = await initBatchAction(formData);

    if (!initResult.success) {
      setError(initResult.error);
      setPhase("error");
      timer.stop();
      return;
    }

    const { batchId: bid, imageUrl, inputFileName: ifn, analysis: an } =
      initResult.data;
    setBatchId(bid);
    setInputFileName(ifn);
    setAnalysis(an);

    // Step 2: Generate all iterations
    setPhase("generating");

    const allResults: BatchResult[] = [];
    const allErrors: string[] = [];

    for (const model of GENERATION_MODELS) {
      for (const complexity of BATCH_COMPLEXITY_LEVELS) {
        for (const variant of BATCH_VARIANTS) {
          const label = `${complexity} / ${variant} / ${model.label}`;
          setCurrentLabel(label);

          const outputFileName = buildOutputFileName(
            complexity,
            variant,
            model.id,
          );

          const iterResult = await generateIterationAction({
            batchId: bid,
            imageUrl,
            analysisResult: an.analysisResult,
            model: model.id,
            complexity: complexity as ComplexityLevel,
            variant: variant as PromptVariant,
          });

          if (iterResult.success) {
            allResults.push({
              model: model.id,
              modelLabel: iterResult.data.modelLabel,
              complexity,
              variant,
              outputFileName: iterResult.data.outputFileName,
              generation: iterResult.data.generation,
              generationMs: iterResult.data.generationMs,
              postProcessMs: iterResult.data.postProcessMs,
              ratings: {},
            });
          } else {
            allErrors.push(`${label}: ${iterResult.error}`);
            allResults.push({
              model: model.id,
              modelLabel: model.label,
              complexity,
              variant,
              outputFileName,
              generation: {
                imageUrl: "",
                width: undefined,
                height: undefined,
                model: model.id,
                promptUsed: "",
              },
              generationMs: 0,
              postProcessMs: 0,
              ratings: {},
              error: iterResult.error,
            });
          }

          setResults([...allResults]);
          setErrors([...allErrors]);
          setCompletedCount(allResults.length);
        }
      }
    }

    timer.stop();
    setPhase("done");
  }

  // ─── Rating Handler ───────────────────────────────────────────────────

  function setRating(fileName: string, criterion: string, value: number) {
    setRatings((prev) => ({
      ...prev,
      [fileName]: { ...prev[fileName], [criterion]: value },
    }));
    setSaved(false);
  }

  // ─── Save Handler ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!batchId || !file) return;

    const batchRun: BatchRun = {
      id: batchId,
      timestamp: new Date().toISOString(),
      inputFileName: inputFileName ?? file.name,
      totalIterations: TOTAL_ITERATIONS,
      completedIterations: results.filter((r) => !r.error).length,
      failedIterations: results.filter((r) => r.error).length,
      results: results.map((r) => ({
        ...r,
        ratings: ratings[r.outputFileName] ?? r.ratings,
      })),
    };

    const result = await saveBatchAction(batchRun);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const isRunning = phase === "analyzing" || phase === "generating";
  const sortedResults = sortResults(results, sortMode);

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: 24,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Batch Test Harness
      </h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Run all {TOTAL_ITERATIONS} combinations (
        {BATCH_COMPLEXITY_LEVELS.length} complexity x {BATCH_VARIANTS.length}{" "}
        variants x {GENERATION_MODELS.length} models)
      </p>

      {/* ── Upload Area ──────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? "#2563eb" : "#ccc"}`,
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          cursor: "pointer",
          background: isDragOver ? "#eff6ff" : "#fafafa",
          marginBottom: 16,
          transition: "all 0.15s",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
        {file ? (
          <span style={{ fontSize: 14 }}>
            {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB) — click
            or drop to replace
          </span>
        ) : (
          <span style={{ color: "#999" }}>
            Drop an image here or click to select
          </span>
        )}
      </div>

      {/* ── Run Button ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={handleRunAll}
          disabled={!file || isRunning}
          style={btnStyle(!file || isRunning)}
        >
          {isRunning ? "Running..." : "Run All Tests"}
        </button>
        {results.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saved || isRunning}
            style={btnStyle(saved || isRunning)}
          >
            {saved ? "Saved" : "Save All"}
          </button>
        )}
        {saved && (
          <span
            style={{
              color: "#16a34a",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
            }}
          >
            Saved to test-results/{batchId}/
          </span>
        )}
      </div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {isRunning && (
        <div
          style={{
            background: "#f0f9ff",
            border: "1px solid #bfdbfe",
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>
              {phase === "analyzing"
                ? "Analyzing..."
                : `${completedCount}/${TOTAL_ITERATIONS}`}
            </span>
            <span style={{ color: "#666" }}>
              {(timer.elapsed / 1000).toFixed(1)}s
            </span>
          </div>
          {/* Progress bar */}
          <div
            style={{
              height: 6,
              background: "#e0e7ff",
              borderRadius: 3,
              overflow: "hidden",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${phase === "analyzing" ? 2 : (completedCount / TOTAL_ITERATIONS) * 100}%`,
                background: "#2563eb",
                borderRadius: 3,
                transition: "width 0.3s",
              }}
            />
          </div>
          {phase === "generating" && currentLabel && (
            <div style={{ color: "#4b5563" }}>{currentLabel}</div>
          )}
          {errors.length > 0 && (
            <div style={{ color: "#dc2626", marginTop: 4 }}>
              {errors.length} failed
            </div>
          )}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
            color: "#991b1b",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Analysis ─────────────────────────────────────────────────── */}
      {analysis && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Original"
                style={{
                  width: 200,
                  borderRadius: 6,
                  border: "1px solid #e5e5e5",
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: 0,
                  color: "#2563eb",
                }}
              >
                {showAnalysis ? "▼" : "▶"} Analysis Result{" "}
                <span style={{ fontWeight: 400, color: "#666" }}>
                  ({analysis.timingMs}ms)
                </span>
              </button>
              {showAnalysis && (
                <pre
                  style={{
                    background: "#f5f5f5",
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 11,
                    overflow: "auto",
                    maxHeight: 300,
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {JSON.stringify(analysis.imageAnalysis, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sort Controls ────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 13 }}>
            Sort by
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{
                marginLeft: 6,
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #ccc",
                fontSize: 13,
              }}
            >
              <option value="model-complexity-variant">
                Model &gt; Complexity &gt; Variant
              </option>
              <option value="variant-model-complexity">
                Variant &gt; Model &gt; Complexity
              </option>
            </select>
          </label>
          <span style={{ fontSize: 13, color: "#666" }}>
            {results.filter((r) => !r.error).length} completed
            {errors.length > 0 && `, ${errors.length} failed`}
          </span>
        </div>
      )}

      {/* ── Results Grid ─────────────────────────────────────────────── */}
      {sortedResults.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {sortedResults.map((r) => (
            <ResultCard
              key={r.outputFileName}
              result={r}
              batchId={batchId!}
              ratings={ratings[r.outputFileName] ?? {}}
              onRate={(criterion, value) =>
                setRating(r.outputFileName, criterion, value)
              }
            />
          ))}
        </div>
      )}

      {/* ── Failed iterations ────────────────────────────────────────── */}
      {errors.length > 0 && phase === "done" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#dc2626" }}>
            Failed Iterations ({errors.length})
          </div>
          <div
            style={{
              background: "#fef2f2",
              borderRadius: 6,
              padding: 12,
              fontSize: 12,
              color: "#991b1b",
            }}
          >
            {errors.map((err, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {err}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Result Card Component ──────────────────────────────────────────────────

function ResultCard({
  result,
  batchId,
  ratings,
  onRate,
}: {
  result: BatchResult;
  batchId: string;
  ratings: Record<string, number>;
  onRate: (criterion: string, value: number) => void;
}) {
  if (result.error) {
    return (
      <div
        style={{
          border: "1px solid #fca5a5",
          borderRadius: 6,
          padding: 10,
          background: "#fef2f2",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          {result.modelLabel}
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
          {result.complexity} / {result.variant}
        </div>
        <div style={{ fontSize: 11, color: "#991b1b" }}>{result.error}</div>
      </div>
    );
  }

  const imageSrc = `/api/test-images/${batchId}/outputs/${result.outputFileName}`;

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 6,
        padding: 10,
        background: "#fff",
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
        {result.modelLabel}
      </div>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
        {result.complexity} / {result.variant}
      </div>

      {/* Image */}
      <img
        src={imageSrc}
        alt={`${result.complexity} ${result.variant} ${result.modelLabel}`}
        style={{
          width: "100%",
          borderRadius: 4,
          border: "1px solid #f0f0f0",
          marginBottom: 6,
        }}
      />

      {/* Timing */}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        gen {(result.generationMs / 1000).toFixed(1)}s | pp{" "}
        {(result.postProcessMs / 1000).toFixed(1)}s
      </div>

      {/* Ratings */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {QUALITY_CRITERIA.map((c) => (
          <div
            key={c.key}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span style={{ fontSize: 10, width: 24, color: "#888" }}>
              {c.label.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onRate(c.key, n)}
                  style={{
                    width: 22,
                    height: 20,
                    borderRadius: 3,
                    border: "1px solid #ddd",
                    background: ratings[c.key] === n ? "#2563eb" : "#fff",
                    color: ratings[c.key] === n ? "#fff" : "#666",
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: ratings[c.key] === n ? 700 : 400,
                    padding: 0,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: disabled ? "#f5f5f5" : "#fff",
    color: disabled ? "#999" : "#333",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
    fontWeight: 500,
  };
}
