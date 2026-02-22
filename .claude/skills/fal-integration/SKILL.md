---
name: fal-integration
description: >
  Integrate with FAL.ai APIs for image generation. Use when making API calls,
  handling responses, debugging FAL errors, or setting up the proxy.
  Triggers: "fal", "api call", "image generation", "model endpoint"
---

# FAL.ai Integration Patterns

## Client Setup (Server-Side Only)
```typescript
import { fal } from "@fal-ai/client";

// Auto-configured from FAL_KEY env variable
// NEVER configure credentials in client-side code
```

## Proxy Route (Required for Client-Side Usage)
File: `src/app/api/fal/proxy/route.ts`
```typescript
import { route } from "@fal-ai/serverless-proxy/nextjs";
export const { GET, POST } = route;
```

## Available Models for This Project

### Nano Banana Pro (Gemini 3 Pro Image) — Best Quality
- Endpoint: `fal-ai/gemini-3-pro-image-preview/edit`
- Cost: $0.15/image
- Best for: Final quality output, complex scenes, face preservation
- Supports: Up to 14 reference images, 4 variations per request

### GPT Image 1.5 — Best Instruction Following
- Endpoint: `fal-ai/gpt-image-1.5/edit`
- Cost: $0.04-0.12/image (varies by quality setting)
- Best for: Precise prompt adherence, text in images
- Params: quality (low/medium/high), input_fidelity

### Nano Banana (Gemini 2.5 Flash Image) — Fast & Cheap
- Endpoint: `fal-ai/nano-banana/edit`
- Cost: ~$0.039/image
- Best for: Rapid iteration, testing prompt variations

## Calling Pattern (Server Action or API Route)
```typescript
const result = await fal.subscribe("fal-ai/gemini-3-pro-image-preview/edit", {
  input: {
    prompt: promptText,
    image_urls: [uploadedImageUrl],
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});
// result.data contains the generated image(s)
```

## Image Upload for Edit Endpoints
FAL requires publicly accessible image URLs. For local development,
use fal.storage.upload() to upload to FAL's temporary storage:
```typescript
const url = await fal.storage.upload(fileBuffer);
```

## Error Handling
- Queue timeouts: use `pollInterval` and `timeout` options
- Rate limits: implement exponential backoff
- Model-specific: Nano Banana Pro may take 15-30s, plan UI accordingly