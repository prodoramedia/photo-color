import sharp from "sharp";
import { PipelineError } from "@/lib/pipeline/types";

interface PostProcessOptions {
  readonly threshold?: number;
  readonly denoise?: boolean;
  readonly denoiseKernel?: number;
  readonly outputFormat?: "png" | "jpeg";
  readonly outputWidth?: number;
  readonly outputHeight?: number;
}

/**
 * Post-processes a generated coloring page into clean, print-ready line art.
 *
 * Pipeline: grayscale → median filter (denoise) → threshold (binarize)
 *           → optional resize → output PNG/JPEG
 */
export async function postProcessColoringPage(
  imageInput: Buffer | string,
  options: PostProcessOptions = {},
): Promise<Buffer> {
  const {
    threshold = 128,
    denoise = true,
    denoiseKernel = 3,
    outputFormat = "png",
    outputWidth,
    outputHeight,
  } = options;

  try {
    let imageBuffer: Buffer;
    if (typeof imageInput === "string") {
      const response = await fetch(imageInput);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      imageBuffer = imageInput;
    }

    let pipeline = sharp(imageBuffer);

    // Convert to grayscale
    pipeline = pipeline.grayscale();

    // Median filter to remove speckles and small artifacts
    if (denoise) {
      pipeline = pipeline.median(denoiseKernel);
    }

    // Threshold to pure black and white
    pipeline = pipeline.threshold(threshold);

    // Optional resize (maintains aspect ratio)
    if (outputWidth || outputHeight) {
      pipeline = pipeline.resize(outputWidth, outputHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Output format
    if (outputFormat === "png") {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else {
      pipeline = pipeline.jpeg({ quality: 95 });
    }

    return await pipeline.toBuffer();
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError(
      `Post-processing failed: ${error instanceof Error ? error.message : String(error)}`,
      "post-processing",
      error,
    );
  }
}
