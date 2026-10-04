import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GetQuotaTool, RecommendModelTool } from './copilot-tools';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';

vi.mock('vscode', () => {
  class LanguageModelTextPart {
    constructor(public value: string) {}
  }
  class LanguageModelToolResult {
    constructor(public content: LanguageModelTextPart[]) {}
  }

  return {
    workspace: {
      getConfiguration: (): { get: (_key: string, defaultValue: unknown) => unknown } => ({
        get: (_key: string, defaultValue: unknown): unknown => defaultValue
      })
    },
    LanguageModelTextPart,
    LanguageModelToolResult,
    lm: {
      registerTool: vi.fn()
    }
  };
});

describe('Copilot Tools', () => {
  let mockQuotaService: QuotaService;
  let mockTracker: RequestTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuotaService = {
      fetchQuota: vi.fn().mockResolvedValue({
        quota: { total: 300, remaining: 250, used: 50, percentUsed: 17, source: 'api' }
      })
    } as unknown as QuotaService;

    mockTracker = {
      getSessionCost: vi.fn().mockReturnValue(2.5),
      getTodayCost: vi.fn().mockReturnValue(5.0)
    } as unknown as RequestTracker;
  });

  describe('GetQuotaTool', () => {
    it('should return correct quota JSON summary', async () => {
      const tool = new GetQuotaTool(mockQuotaService, mockTracker);
      const result = await tool.invoke();

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.status).toBe('live');
      expect(parsed.remainingQuota).toBe(250);
      expect(parsed.sessionSpent).toBe(2.5);
      expect(parsed.dailySpent).toBe(5.0);
    });
  });

  describe('RecommendModelTool', () => {
    it('should return model recommendation for a task', async () => {
      const tool = new RecommendModelTool();
      const result = await tool.invoke({
        input: { taskDescription: 'complex architecture' },
        toolInvocationToken: undefined as unknown as vscode.ChatParticipantToolToken
      });

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.task).toBe('complex architecture');
      expect(parsed.recommendedModel).toContain('Claude');
      expect(parsed.multiplier).toBe(1);
    });
  });
});
