import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GetQuotaTool, RecommendModelTool, AuditContextTool, OptimizePromptTool, ReviewChangesTool, ConvertRulesTool } from './copilot-tools';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { ContextAuditor } from './context-auditor';
import { PromptManager } from './prompt-manager';

vi.mock('vscode', () => {
  class LanguageModelTextPart {
    constructor(public value: string) {}
  }
  class LanguageModelToolResult {
    constructor(public content: LanguageModelTextPart[]) {}
  }

  return {
    workspace: {
      workspaceFolders: [
        { name: 'mock', uri: { fsPath: '/mock', scheme: 'file' } }
      ],
      getConfiguration: (): { get: (_key: string, defaultValue: unknown) => unknown } => ({
        get: (_key: string, defaultValue: unknown): unknown => defaultValue
      })
    },
    window: {
      activeTextEditor: undefined
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

  describe('AuditContextTool', () => {
    it('should return context health audit JSON summary', async () => {
      const mockAuditor = {
        auditWorkspace: vi.fn().mockResolvedValue({
          score: 85,
          rating: 'Good',
          estimatedTokens: { instructions: 100, promptTemplates: 50, activeFile: 0, total: 150 },
          hasInstructions: true,
          templateCount: 1,
          detectedTechStack: ['TypeScript'],
          findings: []
        })
      } as unknown as ContextAuditor;

      const tool = new AuditContextTool(mockAuditor);
      const result = await tool.invoke();

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.score).toBe(85);
      expect(parsed.rating).toBe('Good');
      expect(parsed.hasInstructions).toBe(true);
    });
  });

  describe('OptimizePromptTool', () => {
    it('should return optimized prompt JSON output', async () => {
      const mockPromptManager = {
        detectWorkspaceTechnologies: vi.fn().mockResolvedValue(['TypeScript', 'NestJS'])
      } as unknown as PromptManager;

      const tool = new OptimizePromptTool(mockPromptManager);
      const result = await tool.invoke({
        input: { prompt: 'Implement user login endpoint', taskType: 'feature' },
        toolInvocationToken: undefined as unknown as vscode.ChatParticipantToolToken
      });

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.originalPrompt).toBe('Implement user login endpoint');
      expect(parsed.taskType).toBe('feature');
      expect(parsed.detectedStack).toEqual(['TypeScript', 'NestJS']);
      expect(parsed.optimizedPrompt).toContain('TypeScript, NestJS');
    });
  });

  describe('ReviewChangesTool', () => {
    it('should return diff review result JSON', async () => {
      const mockDiffReviewer = {
        getWorkspaceDiff: vi.fn().mockResolvedValue({
          workspacePath: '/mock',
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          issues: [],
          summaryMarkdown: 'No changes',
          estimatedTokens: 0
        })
      };

      const tool = new ReviewChangesTool(mockDiffReviewer as never);
      const result = await tool.invoke({
        input: { stagedOnly: true },
        toolInvocationToken: undefined as unknown as vscode.ChatParticipantToolToken
      });

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.workspacePath).toBe('/mock');
      expect(parsed.summaryMarkdown).toBe('No changes');
      expect(mockDiffReviewer.getWorkspaceDiff).toHaveBeenCalledWith(undefined, true);
    });
  });

  describe('ConvertRulesTool', () => {
    it('should convert rules and return JSON response', async () => {
      const mockSyncManager = {
        convertWorkspaceRules: vi.fn().mockResolvedValue({
          convertedFiles: ['.cursorrules'],
          totalRulesImported: 1,
          targetUri: { fsPath: '/mock/.github/copilot-instructions.md' },
          instructionsContent: 'Converted'
        })
      };

      const tool = new ConvertRulesTool(mockSyncManager as never);
      const result = await tool.invoke();

      expect(result.content).toHaveLength(1);
      const part = result.content[0] as { value: string };
      const parsed = JSON.parse(part.value);
      expect(parsed.totalRulesImported).toBe(1);
      expect(parsed.convertedFiles).toContain('.cursorrules');
    });
  });
});
