import Anthropic from '@anthropic-ai/sdk';

const MAX_CONCURRENT = 4;
let inFlight = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((res) => queue.push(res));
  inFlight++;
}

function release(): void {
  inFlight--;
  queue.shift()?.();
}

const g = globalThis as unknown as { __anthropic?: Anthropic };
function client(): Anthropic {
  // Venue Wi-Fi intermittently hangs requests for minutes with no response. The SDK's
  // default 10-min timeout would freeze a negotiation turn; cutting a hung socket at 20s
  // and retrying on a fresh connection recovers in ~4s. Worst case 20s × 4 attempts.
  g.__anthropic ??= new Anthropic({ timeout: 20_000, maxRetries: 3 });
  return g.__anthropic;
}

export type ModelTier = 'haiku' | 'sonnet';
const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5',
};

export interface ToolCallOpts {
  tier: ModelTier;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}

function buildParams(opts: ToolCallOpts): Record<string, unknown> {
  return {
    model: MODEL_IDS[opts.tier],
    max_tokens: opts.maxTokens ?? (opts.tier === 'sonnet' ? 4000 : 1500),
    system: opts.system,
    messages: opts.messages,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    // Sonnet 5 runs adaptive thinking by default; keep it terse so demo beats stay fast.
    ...(opts.tier === 'sonnet' ? { output_config: { effort: 'low' } } : {}),
  };
}

// Streaming instead of one-shot create(): on flaky venue networks the non-streaming
// response tail intermittently hangs for 60-90s; streamed tokens arrive as generated
// and finalMessage() completes as soon as the last delta lands.
async function streamMessage(params: Record<string, unknown>) {
  const stream = client().messages.stream(params as never);
  return stream.finalMessage();
}

export async function callWithTool(opts: ToolCallOpts): Promise<Record<string, unknown>> {
  await acquire();
  try {
    const params = buildParams(opts);
    let resp;
    try {
      resp = await streamMessage(params);
    } catch (err: unknown) {
      // If the API/SDK rejects output_config (400), strip and retry once.
      if ((err as { status?: number }).status === 400 && 'output_config' in params) {
        delete params.output_config;
        resp = await streamMessage(params);
      } else {
        throw err;
      }
    }
    const block = (resp as { content: Array<{ type: string; input?: Record<string, unknown> }> }).content.find(
      (b) => b.type === 'tool_use'
    );
    if (!block?.input) throw new Error('no tool_use block in model response');
    return block.input;
  } finally {
    release();
  }
}

export const _test = { buildParams };
