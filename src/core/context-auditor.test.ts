import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ContextAuditor } from './context-auditor';
import { PromptManager } from './prompt-manager';

vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: undefined
    },
    workspace: {
      workspaceFolders: [
        {
          name: 'mock-workspace',
          uri: { fsPath: '/mock/workspace', scheme: 'file' }
        }
      ],
      openTextDocument: vi.fn(),
      asRelativePath: (uri: { fsPath: string }): string => uri.fsPath.replace('/mock/workspace/', '')
    }
  };
});

describe('ContextAuditor', () => {
  let auditor: ContextAuditor;
  let mockPromptManager: PromptManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptManager = new PromptManager();
    auditor = new ContextAuditor(mockPromptManager);
  });

  describe('estimateTokenCount', () => {
    it('should correctly estimate tokens based on character length', () => {
      expect(auditor.estimateTokenCount('')).toBe(0);
      expect(auditor.estimateTokenCount('    ')).toBe(0);
      expect(auditor.estimateTokenCount('Hello World')).toBe(3); // 11 chars / 4 rounded up
    });
  });

  describe('auditWorkspace', () => {
    it('should generate audit findings when no instructions file exists', async () => {
      vi.spyOn(mockPromptManager, 'getWorkspaceInstructions').mockResolvedValue(null);
      vi.spyOn(mockPromptManager, 'getWorkspacePromptTemplates').mockResolvedValue([]);
      vi.spyOn(mockPromptManager, 'detectWorkspaceTechnologies').mockResolvedValue(['TypeScript', 'Node.js']);

      const audit = await auditor.auditWorkspace();

      expect(audit.hasInstructions).toBe(false);
      expect(audit.score).toBeLessThan(100);
      expect(audit.findings.some((f) => f.message.includes('No `.github/copilot-instructions.md`'))).toBe(true);
    });

    it('should evaluate existing instructions and prompt templates', async () => {
      const mockUri = { fsPath: '/mock/workspace/.github/copilot-instructions.md', scheme: 'file' } as vscode.Uri;
      vi.spyOn(mockPromptManager, 'getWorkspaceInstructions').mockResolvedValue({
        name: 'copilot-instructions.md',
        relativePath: '.github/copilot-instructions.md',
        uri: mockUri,
        type: 'instruction'
      });

      const templateUri = { fsPath: '/mock/workspace/.github/prompts/review.prompt.md', scheme: 'file' } as vscode.Uri;
      vi.spyOn(mockPromptManager, 'getWorkspacePromptTemplates').mockResolvedValue([
        {
          name: 'review.prompt.md',
          relativePath: '.github/prompts/review.prompt.md',
          uri: templateUri,
          type: 'prompt-template'
        }
      ]);

      vi.spyOn(mockPromptManager, 'detectWorkspaceTechnologies').mockResolvedValue(['TypeScript']);

      (vscode.workspace.openTextDocument as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.includes('copilot-instructions.md')) {
          return Promise.resolve({
            getText: () => '# Standards\nStrict rules for TypeScript and Clean Code.'
          });
        }
        return Promise.resolve({
          getText: () => 'Review template prompt content.'
        });
      });

      const audit = await auditor.auditWorkspace();

      expect(audit.hasInstructions).toBe(true);
      expect(audit.templateCount).toBe(1);
      expect(audit.rating).toBe('Optimal');
      expect(audit.estimatedTokens.total).toBeGreaterThan(0);
    });

    it('should warn if active editor language is not mentioned in instructions', async () => {
      const mockUri = { fsPath: '/mock/workspace/.github/copilot-instructions.md', scheme: 'file' } as vscode.Uri;
      vi.spyOn(mockPromptManager, 'getWorkspaceInstructions').mockResolvedValue({
        name: 'copilot-instructions.md',
        relativePath: '.github/copilot-instructions.md',
        uri: mockUri,
        type: 'instruction'
      });
      vi.spyOn(mockPromptManager, 'getWorkspacePromptTemplates').mockResolvedValue([]);
      vi.spyOn(mockPromptManager, 'detectWorkspaceTechnologies').mockResolvedValue([]);

      (vscode.workspace.openTextDocument as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        getText: (): string => '# Standards\nGeneral rules only.'
      });

      // Mock active editor with Python document
      (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/script.py', scheme: 'file' },
          getText: (): string => 'print("hello")',
          languageId: 'python'
        }
      };

      const audit = await auditor.auditWorkspace();

      expect(audit.findings.some((f) => f.message.includes('Active file language `python` has no explicit mention'))).toBe(true);

      // Reset mock
      (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined;
    });
  });
});
