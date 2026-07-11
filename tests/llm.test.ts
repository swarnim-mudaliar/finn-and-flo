import { describe, expect, it } from 'vitest';
import { _test } from '../src/lib/llm';

describe('buildParams', () => {
  const base = {
    tier: 'haiku' as const,
    system: 's',
    messages: [{ role: 'user' as const, content: 'hi' }],
    toolName: 'submit_move',
    toolDescription: 'd',
    inputSchema: { type: 'object' },
  };

  it('haiku: correct model, no output_config, no temperature', () => {
    const p = _test.buildParams(base) as Record<string, unknown>;
    expect(p.model).toBe('claude-haiku-4-5');
    expect(p).not.toHaveProperty('output_config');
    expect(p).not.toHaveProperty('temperature');
    expect(p.tool_choice).toEqual({ type: 'tool', name: 'submit_move' });
  });

  it('sonnet: correct model, low effort, bigger max_tokens', () => {
    const p = _test.buildParams({ ...base, tier: 'sonnet' }) as Record<string, unknown>;
    expect(p.model).toBe('claude-sonnet-5');
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.max_tokens).toBe(4000);
  });
});
