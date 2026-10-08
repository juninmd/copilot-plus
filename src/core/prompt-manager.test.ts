import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PromptManager } from './prompt-manager';

vi.mock('vscode', () => {
  const statMock = vi.fn();
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const readFileMock = vi.fn();
  const openTextDocumentMock = vi.fn();
  const findFilesMock = vi.fn();

  return {
    window: {
      activeTextEditor: undefined
    },
    workspace: {
      workspaceFolders: [
        {
          name: 'mock-workspace',
          uri: {
            fsPath: '/mock/workspace',
            scheme: 'file'
          }
        }
      ],
      fs: {
        stat: statMock,
        writeFile: writeFileMock,
        readFile: readFileMock
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

  describe('detectWorkspaceTechnologies', () => {
    it('should detect tech stack from package.json and project files', async () => {
      (vscode.workspace.fs.stat as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('package.json')) return Promise.resolve({ type: 1 });
        if (uri.fsPath.endsWith('tsconfig.json')) return Promise.resolve({ type: 1 });
        return Promise.reject(new Error('File not found'));
      });

      const pkgContent = JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' }
      });
      (vscode.workspace.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        new TextEncoder().encode(pkgContent)
      );

      const techs = await promptManager.detectWorkspaceTechnologies();
      expect(techs).toContain('Node.js');
      expect(techs).toContain('TypeScript');
      expect(techs).toContain('React');
      expect(techs).toContain('Vitest');
    });
  });

  describe('interpolateTemplate', () => {
    it('should substitute template variables with editor/workspace metadata', async () => {
      const raw = 'Refactor ${selectedText} in ${filePath} (${languageId}) for project ${workspaceName}';
      const interpolated = await promptManager.interpolateTemplate(raw);
      expect(interpolated).toBe('Refactor  in  () for project mock-workspace');
    });
  });

  describe('generateDefaultInstructions', () => {
    it('should write default copilot instructions to .github/copilot-instructions.md', async () => {
      (vscode.workspace.fs.stat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File not found'));

      const resultUri = await promptManager.generateDefaultInstructions();

      expect(resultUri).toBeDefined();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: expect.stringContaining('.github/copilot-instructions.md') }),
        expect.any(Uint8Array)
      );
    });

    it('should include framework directives when stack is detected', async () => {
      (vscode.workspace.fs.stat as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('package.json')) return Promise.resolve({ type: 1 });
        return Promise.reject(new Error('File not found'));
      });

      const pkgContent = JSON.stringify({
        dependencies: { '@nestjs/core': '^10.0.0' },
        devDependencies: { typescript: '^5.0.0' }
      });
      (vscode.workspace.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        new TextEncoder().encode(pkgContent)
      );

      await promptManager.generateDefaultInstructions();

      const writeFileCall = (vscode.workspace.fs.writeFile as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => (call[0] as { fsPath: string }).fsPath.includes('.github/copilot-instructions.md')
      );
      expect(writeFileCall).toBeDefined();
      const contentStr = new TextDecoder().decode(writeFileCall![1] as Uint8Array);
      expect(contentStr).toContain('Framework & Language Directives');
      expect(contentStr).toContain('NestJS');
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
