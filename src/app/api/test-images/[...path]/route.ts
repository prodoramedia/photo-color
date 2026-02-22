import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

const RESULTS_DIR = join(process.cwd(), "test-results");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await params;

  // Must be [batchId, "input.ext"] or [batchId, "outputs", "filename.png"]
  if (segments.length < 2 || segments.length > 3) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prevent path traversal
  for (const segment of segments) {
    if (segment.includes("..") || segment.includes("/")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const filePath = join(RESULTS_DIR, ...segments);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }

    const buffer = await readFile(filePath);

    const ext = filePath.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
