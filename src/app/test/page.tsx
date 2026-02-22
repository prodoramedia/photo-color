"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  analyzeAction,
  uploadAction,
  generateAction,
  saveLogAction,
  type AnalyzeResult,
  type GenerateResult,
  type TestLogEntry,
} from "./actions";
import {
  GENERATION_MODELS,
  type AnalysisResult,
  type ImageAnalysis,
} from "@/lib/pipeline/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const COMPLEXITY_OPTIONS = ["toddler", "child", "tween", "adult"] as const;
const VARIANT_OPTIONS = [
  "direct-transform",
  "preservation-heavy",
  "simplification-heavy",
] as const;
const QUALITY_CRITERIA = [
  { key: "lineClarity", label: "Line Clarity" },
  { key: "recognizability", label: "Recognizability" },
  { key: "colorability", label: "Colorability" },
  { key: "complexityMatch", label: "Complexity Match" },
  { key: "overall", label: "Overall Quality" },
] as const;

type Status =
  | "idle"
  | "uploading"
  | "analyzing"
  | "generating"
  | "done"
  | "error";

// ─── Elapsed Timer Hook ─────────────────────────────────────────────────────

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

  const reset = useCallback(() => {
    stop();
    setElapsed(0);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { elapsed, start, stop, reset };
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function TestPage() {
  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controls
  const [model, setModel] = useState(GENERATION_MODELS[0].id as string);
  const [variant, setVariant] = useState<string>("direct-transform");
  const [complexity, setComplexity] = useState<string>("child");
  const [useAnalysis, setUseAnalysis] = useState(true);

  // Results
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(
    null,
  );
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null,
  );
  const [analysisMs, setAnalysisMs] = useState<number | null>(null);

  // UI state
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [logSaved, setLogSaved] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const timer = useElapsedTimer();

  // ─── File Handling ──────────────────────────────────────────────────────

  function handleFile(f: File) {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setImageUrl(null);
    setImageAnalysis(null);
    setAnalysisResult(null);
    setGenerateResult(null);
    setAnalysisMs(null);
    setRatings({});
    setLogSaved(false);
    setError(null);
    setStatus("idle");
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

  // ─── Analyze ────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!file) return;
    setError(null);
    setStatus("analyzing");
    timer.start();

    try {
      const formData = new FormData();
      formData.append("image", file);
      const result: AnalyzeResult = await analyzeAction(formData);

      timer.stop();
      setImageUrl(result.imageUrl);
      setImageAnalysis(result.imageAnalysis);
      setAnalysisResult(result.analysisResult);
      setAnalysisMs(result.timingMs);
      setStatus("idle");
    } catch (err) {
      timer.stop();
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // ─── Generate ───────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!file) return;
    setError(null);
    setGenerateResult(null);
    setLogSaved(false);

    try {
      // If no imageUrl yet (analysis was off), upload first
      let url = imageUrl;
      if (!url) {
        setStatus("uploading");
        timer.start();
        const formData = new FormData();
        formData.append("image", file);
        url = await uploadAction(formData);
        setImageUrl(url);
        timer.stop();
      }

      setStatus("generating");
      timer.start();

      const result = await generateAction({
        imageUrl: url,
        analysisResult: useAnalysis ? (analysisResult ?? undefined) : undefined,
        model,
        promptVariant: variant as "direct-transform" | "preservation-heavy" | "simplification-heavy",
        complexity: complexity as "toddler" | "child" | "tween" | "adult",
      });

      timer.stop();
      setGenerateResult(result);
      setStatus("done");
    } catch (err) {
      timer.stop();
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // ─── Save Log ───────────────────────────────────────────────────────────

  async function handleSaveLog() {
    if (!generateResult) return;

    const entry: TestLogEntry = {
      timestamp: new Date().toISOString(),
      params: {
        model,
        promptVariant: variant,
        complexity,
        analysisEnabled: useAnalysis,
      },
      imageAnalysis: imageAnalysis ?? undefined,
      analysisResult: analysisResult ?? undefined,
      generation: generateResult.generation,
      timing: {
        analysisMs: analysisMs ?? undefined,
        generationMs: generateResult.generationMs,
        postProcessMs: generateResult.postProcessMs,
      },
      ratings,
    };

    await saveLogAction(entry);
    setLogSaved(true);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const isLoading =
    status === "analyzing" ||
    status === "generating" ||
    status === "uploading";

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 24,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Pipeline Test Harness
      </h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Internal tool for testing coloring page generation
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
            {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB) — click or
            drop to replace
          </span>
        ) : (
          <span style={{ color: "#999" }}>
            Drop an image here or click to select
          </span>
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <label style={{ fontSize: 13 }}>
          Model
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={selectStyle}
          >
            {GENERATION_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          Variant
          <select
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            style={selectStyle}
          >
            {VARIANT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          Complexity
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
            style={selectStyle}
          >
            {COMPLEXITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={useAnalysis}
            onChange={(e) => setUseAnalysis(e.target.checked)}
          />
          Analysis (Claude)
        </label>
      </div>

      {/* ── Action Buttons ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {useAnalysis && (
          <button
            onClick={handleAnalyze}
            disabled={!file || isLoading}
            style={btnStyle(!file || isLoading)}
          >
            {status === "analyzing"
              ? `Analyzing... ${(timer.elapsed / 1000).toFixed(1)}s`
              : "Analyze"}
          </button>
        )}
        <button
          onClick={handleGenerate}
          disabled={!file || isLoading || (useAnalysis && !analysisResult)}
          style={btnStyle(
            !file || isLoading || (useAnalysis && !analysisResult),
          )}
        >
          {status === "generating"
            ? `Generating... ${(timer.elapsed / 1000).toFixed(1)}s`
            : status === "uploading"
              ? `Uploading... ${(timer.elapsed / 1000).toFixed(1)}s`
              : "Generate"}
        </button>
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
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Analysis JSON ────────────────────────────────────────────── */}
      {imageAnalysis && (
        <div style={{ marginBottom: 16 }}>
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
              ({analysisMs}ms)
            </span>
          </button>
          {showAnalysis && (
            <pre
              style={{
                background: "#f5f5f5",
                borderRadius: 6,
                padding: 12,
                fontSize: 12,
                overflow: "auto",
                maxHeight: 400,
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(imageAnalysis, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ── Side-by-Side ─────────────────────────────────────────────── */}
      {(previewUrl || generateResult) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: previewUrl && generateResult ? "1fr 1fr" : "1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {previewUrl && (
            <div>
              <div
                style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                Original
              </div>
              <img
                src={previewUrl}
                alt="Original"
                style={{
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #e5e5e5",
                }}
              />
            </div>
          )}
          {generateResult && (
            <div>
              <div
                style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                Coloring Page
                <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>
                  {GENERATION_MODELS.find((m) => m.id === model)?.label ?? model}
                </span>
              </div>
              <img
                src={`data:${generateResult.mimeType};base64,${generateResult.imageBase64}`}
                alt="Generated coloring page"
                style={{
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #e5e5e5",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Timing ───────────────────────────────────────────────────── */}
      {generateResult && (
        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 13,
            marginBottom: 16,
            color: "#666",
          }}
        >
          {analysisMs != null && (
            <span>
              Analysis: <strong>{(analysisMs / 1000).toFixed(1)}s</strong>
            </span>
          )}
          <span>
            Generation:{" "}
            <strong>{(generateResult.generationMs / 1000).toFixed(1)}s</strong>
          </span>
          <span>
            Post-process:{" "}
            <strong>{(generateResult.postProcessMs / 1000).toFixed(1)}s</strong>
          </span>
          <span>
            Total:{" "}
            <strong>
              {(
                ((analysisMs ?? 0) +
                  generateResult.generationMs +
                  generateResult.postProcessMs) /
                1000
              ).toFixed(1)}
              s
            </strong>
          </span>
        </div>
      )}

      {/* ── Prompt Inspector ─────────────────────────────────────────── */}
      {generateResult && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
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
            {showPrompt ? "▼" : "▶"} Prompt Used
          </button>
          {showPrompt && (
            <div style={{ marginTop: 8 }}>
              <pre
                style={{
                  background: "#f5f5f5",
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 300,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.5,
                }}
              >
                {generateResult.generation.promptUsed}
              </pre>
              {generateResult.generation.negativePromptUsed && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      marginTop: 8,
                      marginBottom: 4,
                    }}
                  >
                    Negative prompt:
                  </div>
                  <pre
                    style={{
                      background: "#fef2f2",
                      borderRadius: 6,
                      padding: 12,
                      fontSize: 12,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {generateResult.generation.negativePromptUsed}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Quality Ratings ──────────────────────────────────────────── */}
      {generateResult && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Quality Ratings
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {QUALITY_CRITERIA.map((c) => (
              <div
                key={c.key}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontSize: 13, width: 140 }}>{c.label}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        setRatings((prev) => ({ ...prev, [c.key]: n }))
                      }
                      style={{
                        width: 32,
                        height: 28,
                        borderRadius: 4,
                        border: "1px solid #ccc",
                        background:
                          ratings[c.key] === n ? "#2563eb" : "#fff",
                        color: ratings[c.key] === n ? "#fff" : "#333",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: ratings[c.key] === n ? 700 : 400,
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
      )}

      {/* ── Save & Log ───────────────────────────────────────────────── */}
      {generateResult && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleSaveLog}
            disabled={logSaved}
            style={btnStyle(logSaved)}
          >
            {logSaved ? "Saved" : "Save & Log"}
          </button>
          {logSaved && (
            <span style={{ color: "#16a34a", fontSize: 13 }}>
              Saved to test-logs/results.jsonl
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

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
