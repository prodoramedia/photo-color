import Link from "next/link";
import { listBatchRuns } from "@/lib/batch/storage";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const runs = await listBatchRuns();

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Batch Test Results
          </h1>
          <p style={{ color: "#666", fontSize: 14 }}>
            {runs.length} saved batch run{runs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/batch"
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "#fff",
            color: "#333",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          New Batch Test
        </Link>
      </div>

      {runs.length === 0 ? (
        <p style={{ color: "#999", fontSize: 14 }}>
          No batch runs saved yet.{" "}
          <Link href="/batch" style={{ color: "#2563eb" }}>
            Run a batch test
          </Link>
          .
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "2px solid #e5e5e5",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "8px 12px" }}>Date</th>
              <th style={{ padding: "8px 12px" }}>Input File</th>
              <th style={{ padding: "8px 12px" }}>Completed</th>
              <th style={{ padding: "8px 12px" }}>Failed</th>
              <th style={{ padding: "8px 12px" }}>Rated</th>
              <th style={{ padding: "8px 12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                style={{ borderBottom: "1px solid #f0f0f0" }}
              >
                <td style={{ padding: "8px 12px" }}>
                  {new Date(run.timestamp).toLocaleString()}
                </td>
                <td style={{ padding: "8px 12px" }}>{run.inputFileName}</td>
                <td style={{ padding: "8px 12px" }}>
                  {run.completedIterations}/{run.totalIterations}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    color: run.failedIterations > 0 ? "#dc2626" : "#999",
                  }}
                >
                  {run.failedIterations}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {run.hasRatings ? "Yes" : "No"}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <Link
                    href={`/results/${run.id}`}
                    style={{ color: "#2563eb", textDecoration: "none" }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
