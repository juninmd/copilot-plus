import { describe, it, expect, vi } from 'vitest';
import { ModelBenchmarker } from './model-benchmarker';

vi.mock('vscode', () => ({
  lm: {
    selectChatModels: vi.fn().mockResolvedValue([
      { id: 'gpt-4o', name: 'GPT-4o', vendor: 'copilot', family: 'gpt-4o', maxInputTokens: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', vendor: 'copilot', family: 'gpt-4o-mini', maxInputTokens: 128000 }
    ])
  }
}));

describe('ModelBenchmarker', () => {
  it('should benchmark available chat models and rank by latency', async () => {
    const benchmarker = new ModelBenchmarker();
    const result = await benchmarker.benchmarkAvailableModels();

    expect(result.results.length).toBe(2);
    expect(result.fastestModel).toBe('GPT-4o Mini');
    expect(result.summaryMarkdown).toContain('# ⚡ Copilot Model Benchmark');
  });
});
