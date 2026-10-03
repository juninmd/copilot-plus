import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PromptManager } from './prompt-manager';

vi.mock('vscode', () => {
  const statMock = vi.fn();
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const openTextDocumentMock = vi.fn();
  const findFilesMock = vi.fn();

  return {
    workspace: {
      workspaceFolders: [
        {
          uri: {
            fsPath: '/mock/workspace',
            scheme: 'file'
          }
        }
      ],
      fs: {
        stat: statMock,
        writeFile: writeFileMock
      },
      openTextDocument: openTextDocumentMock,
      findFiles: findFilesMock,
      asRelativePath: (uri: { fsPath: string }): string => uri.fsPath.replace('/mock/workspace/', '')
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
    }
  };
});

describe('PromptManager', () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    vi.clearAllMocks();
    promptManager = new PromptManager();
  });

  describe('getWorkspaceInstructions', () => {
    it('should return prompt file details if copilot-instructions.md exists', async () => {
      (vscode.workspace.fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 1 });
      (vscode.workspace.openTextDocument as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ lineCount: 25 });

      const result = await promptManager.getWorkspaceInstructions();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('copilot-instructions.md');
      expect(result?.lineCount).toBe(25);
    });

    it('should return null if copilot-instructions.md does not exist', async () => {
      (vscode.workspace.fs.stat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File not found'));

      const result = await promptManager.getWorkspaceInstructions();

      expect(result).toBeNull();
    });
  });

  describe('generateDefaultInstructions', () => {
    it('should write default copilot instructions to .github/copilot-instructions.md', async () => {
      const resultUri = await promptManager.generateDefaultInstructions();

      expect(resultUri).toBeDefined();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: expect.stringContaining('.github/copilot-instructions.md') }),
        expect.any(Uint8Array)
      );
    });
  });

  describe('createSamplePromptTemplate', () => {
    it('should create a custom prompt template with sanitized name', async () => {
      const resultUri = await promptManager.createSamplePromptTemplate('Security Review!');

      expect(resultUri).toBeDefined();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: expect.stringContaining('.github/prompts/security-review-.prompt.md') }),
        expect.any(Uint8Array)
      );
    });
  });
});
