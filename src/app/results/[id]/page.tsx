"use client";

import { useState, useEffect, use } from "react";
import { loadBatchAction, updateRatingsAction } from "./actions";
import {
  QUALITY_CRITERIA,
  type BatchAnalysis,
  type BatchResult,
  type BatchRun,
  type SortMode,
} from "@/lib/batch/types";

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

export default function ResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: batchId } = use(params);

  const [batchRun, setBatchRun] = useState<BatchRun | null>(null);
  const [analysis, setAnalysis] = useState<BatchAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("model-complexity-variant");
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [saved, setSaved] = useState(true);

  // Load data on mount
  useEffect(() => {
    async function load() {
      const result = await loadBatchAction(batchId);
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setBatchRun(result.data.batchRun);
      setAnalysis(result.data.analysis);

      // Pre-populate ratings from saved data
      const existingRatings: Record<string, Record<string, number>> = {};
      for (const r of result.data.batchRun.results) {
        if (Object.keys(r.ratings).length > 0) {
          existingRatings[r.outputFileName] = r.ratings;
        }
      }
      setRatings(existingRatings);
      setLoading(false);
    }
    load();
  }, [batchId]);

  function setRating(fileName: string, criterion: string, value: number) {
    setRatings((prev) => ({
      ...prev,
      [fileName]: { ...prev[fileName], [criterion]: value },
    }));
    setSaved(false);
  }

  async function handleSaveRatings() {
    const result = await updateRatingsAction(batchId, ratings);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#666", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (error && !batchRun) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 6,
            padding: 12,
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!batchRun) return null;

  const sortedResults = sortResults(batchRun.results, sortMode);
  const inputImageSrc = `/api/test-images/${batchId}/${batchRun.inputFileName}`;

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: 24,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Batch Results
          </h1>
          <p style={{ color: "#666", fontSize: 13 }}>
            {batchRun.inputFileName} &mdash;{" "}
            {new Date(batchRun.timestamp).toLocaleString()} &mdash;{" "}
            {batchRun.completedIterations}/{batchRun.totalIterations} completed
            {batchRun.failedIterations > 0 &&
              `, ${batchRun.failedIterations} failed`}
          </p>
        </div>
        <a
          href="/results"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          &larr; All Results
        </a>
      </div>

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
          }}
        >
          {error}
        </div>
      )}

      {/* ── Original + Analysis ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <img
          src={inputImageSrc}
          alt="Original"
          style={{
            width: 200,
            borderRadius: 6,
            border: "1px solid #e5e5e5",
          }}
        />
        {analysis && (
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
        )}
      </div>

      {/* ── Sort + Save Controls ─────────────────────────────────────── */}
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
        <button
          onClick={handleSaveRatings}
          disabled={saved}
          style={btnStyle(saved)}
        >
          {saved ? "Ratings Saved" : "Save Ratings"}
        </button>
      </div>

      {/* ── Results Grid ─────────────────────────────────────────────── */}
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
            batchId={batchId}
            ratings={ratings[r.outputFileName] ?? {}}
            onRate={(criterion, value) =>
              setRating(r.outputFileName, criterion, value)
            }
          />
        ))}
      </div>
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
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
        {result.modelLabel}
      </div>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
        {result.complexity} / {result.variant}
      </div>

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

      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        gen {(result.generationMs / 1000).toFixed(1)}s | pp{" "}
        {(result.postProcessMs / 1000).toFixed(1)}s
      </div>

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
