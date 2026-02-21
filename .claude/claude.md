# Coloring Pipeline — Photo to Coloring Page AI

## Project Overview
AI-powered pipeline that converts photos into high-quality coloring book pages.
Phase 0: Prove the pipeline produces ColorBliss-quality output (recognizable faces,
clean line art, print-ready). Phase 0.5: Prove complexity is tunable per age group.

## Stack
- Next.js 15, App Router, TypeScript strict
- Tailwind CSS for styling
- FAL.ai for image generation (Nano Banana Pro, GPT Image 1.5)
- Sharp for image post-processing
- pnpm as package manager

## Key Directories
- `src/app/` — Next.js App Router pages and layouts
- `src/app/api/fal/proxy/` — FAL.ai proxy route (protects API key)
- `src/lib/pipeline/` — Core pipeline logic (analysis, generation, post-processing)
- `src/lib/prompts/` — Prompt templates for each pipeline step
- `src/components/` — React components
- `test-images/` — Sample photos for pipeline testing (not committed)
- `output/` — Generated coloring pages for review (not committed)

## Architecture Decisions
- FAL.ai API key is NEVER exposed client-side. All calls go through /api/fal/proxy
- Pipeline steps are independent modules with typed interfaces
- Each prompt template is a separate file for easy A/B testing
- Image post-processing (thresholding, cleanup) uses Sharp server-side
- All pipeline outputs saved with metadata (model, prompt, params) for comparison

## Code Style
- TypeScript strict mode, no `any` — use `unknown` + type guards
- Prefer `interface` over `type` for object shapes
- Server Actions for pipeline execution, not client-side API calls
- Zod for runtime validation of API responses
- Async/await, no callbacks
- Descriptive variable names, no abbreviations

## Commands
- `pnpm dev` — Start development server
- `pnpm build` — Production build
- `pnpm lint` — ESLint check
- `pnpm test` — Run tests

## Anti-Patterns to Avoid
- Do NOT call FAL.ai directly from client components
- Do NOT hardcode prompts — always use template files
- Do NOT save API keys in code — use .env.local
- Do NOT commit test-images/ or output/ directories