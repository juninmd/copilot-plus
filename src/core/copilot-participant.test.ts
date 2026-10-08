import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { registerCopilotParticipant } from './copilot-participant';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { Logger } from './logger';

type ChatHandler = (
  request: { command?: string; prompt?: string },
  context: unknown,
  response: { progress: (msg: string) => void; markdown: (msg: string) => void },
  token: unknown
) => Promise<void>;

vi.mock('vscode', () => {
  const createChatParticipantMock = vi.fn();

  class ThemeIcon {
    constructor(public id: string) {}
  }

  return {
    workspace: {
      workspaceFolders: [
        { name: 'mock-workspace', uri: { fsPath: '/mock/workspace', scheme: 'file' } }
      ],
      getConfiguration: (): { get: (_key: string, defaultValue: unknown) => unknown; update: () => Promise<void> } => ({
        get: (_key: string, defaultValue: unknown): unknown => defaultValue,
        update: vi.fn().mockResolvedValue(undefined)
      }),
      openTextDocument: vi.fn(),
      findFiles: vi.fn().mockResolvedValue([]),
      asRelativePath: (uri: { fsPath: string }): string => uri.fsPath.replace('/mock/workspace/', '')
    },
    window: {
      activeTextEditor: undefined
    },
    Uri: {
      file: (p: string): { fsPath: string; scheme: string } => ({ fsPath: p, scheme: 'file' }),
      joinPath: (base: { fsPath: string }, ...paths: string[]): { fsPath: string; scheme: string } => ({
        fsPath: [base.fsPath, ...paths].join('/'),
        scheme: 'file'
      })
    },
    FileType: {
      File: 1
    },
    ThemeIcon,
    chat: {
      createChatParticipant: createChatParticipantMock
    }
  };
});

describe('Copilot Participant', () => {
  let mockQuotaService: QuotaService;
  let mockTracker: RequestTracker;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuotaService = {
      fetchQuota: vi.fn().mockResolvedValue({
        quota: { total: 300, remaining: 200, used: 100, percentUsed: 33, source: 'api' }
      })
    } as unknown as QuotaService;

    mockTracker = {
      getSessionCost: vi.fn().mockReturnValue(1.0),
      getTodayCost: vi.fn().mockReturnValue(3.0),
      getSessionBreakdown: vi.fn().mockReturnValue([{ model: 'gpt-4o', count: 2, cost: 0 }])
    } as unknown as RequestTracker;

    mockLogger = {
      log: vi.fn()
    } as unknown as Logger;
  });

  it('should register chat participant and handle /quota command', async () => {
    let handler: ChatHandler | undefined;
    (vscode.chat.createChatParticipant as unknown as ReturnType<typeof vi.fn>).mockImplementation((_id: string, fn: ChatHandler) => {
      handler = fn;
      return { iconPath: null };
    });

    registerCopilotParticipant(mockQuotaService, mockTracker, mockLogger);

    expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith('copilotPlus.participant', expect.any(Function));

    const markdownOutput: string[] = [];
    const mockResponse = {
      progress: vi.fn(),
      markdown: (msg: string): number => markdownOutput.push(msg)
    };

    if (handler) {
      await handler(
        { command: 'quota', prompt: '' },
        {},
        mockResponse,
        {}
      );
    }

    const fullMarkdown = markdownOutput.join('');
    expect(fullMarkdown).toContain('GitHub Copilot Quota Summary');
    expect(fullMarkdown).toContain('Remaining Quota:** 200/300');
    expect(fullMarkdown).toContain('gpt-4o');
  });

  it('should handle /recommend command', async () => {
    let handler: ChatHandler | undefined;
    (vscode.chat.createChatParticipant as unknown as ReturnType<typeof vi.fn>).mockImplementation((_id: string, fn: ChatHandler) => {
      handler = fn;
      return { iconPath: null };
    });

    registerCopilotParticipant(mockQuotaService, mockTracker, mockLogger);

    const markdownOutput: string[] = [];
    const mockResponse = {
      progress: vi.fn(),
      markdown: (msg: string): number => markdownOutput.push(msg)
    };

    if (handler) {
      await handler(
        { command: 'recommend', prompt: 'quick bug fix' },
        {},
        mockResponse,
        {}
      );
    }

    const fullMarkdown = markdownOutput.join('');
    expect(fullMarkdown).toContain('Model Recommendation');
    expect(fullMarkdown).toContain('quick bug fix');
    expect(fullMarkdown).toContain('0.33');
  });

  it('should handle /audit command', async () => {
    let handler: ChatHandler | undefined;
    (vscode.chat.createChatParticipant as unknown as ReturnType<typeof vi.fn>).mockImplementation((_id: string, fn: ChatHandler) => {
      handler = fn;
      return { iconPath: null };
    });

    registerCopilotParticipant(mockQuotaService, mockTracker, mockLogger);

    const markdownOutput: string[] = [];
    const mockResponse = {
      progress: vi.fn(),
      markdown: (msg: string): number => markdownOutput.push(msg)
    };

    if (handler) {
      await handler(
        { command: 'audit', prompt: '' },
        {},
        mockResponse,
        {}
      );
    }

    const fullMarkdown = markdownOutput.join('');
    expect(fullMarkdown).toContain('Copilot Context Health Audit');
    expect(fullMarkdown).toContain('Context Health Score:');
  });

  it('should handle /optimize command', async () => {
    let handler: ChatHandler | undefined;
    (vscode.chat.createChatParticipant as unknown as ReturnType<typeof vi.fn>).mockImplementation((_id: string, fn: ChatHandler) => {
      handler = fn;
      return { iconPath: null };
    });

    registerCopilotParticipant(mockQuotaService, mockTracker, mockLogger);

    const markdownOutput: string[] = [];
    const mockResponse = {
      progress: vi.fn(),
      markdown: (msg: string): number => markdownOutput.push(msg)
    };

    if (handler) {
      await handler(
        { command: 'optimize', prompt: 'Refactor authentication module' },
        {},
        mockResponse,
        {}
      );
    }

    const fullMarkdown = markdownOutput.join('');
    expect(fullMarkdown).toContain('Optimized Copilot Prompt');
    expect(fullMarkdown).toContain('Refactor authentication module');
  });
});
