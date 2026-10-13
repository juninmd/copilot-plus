import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { RuleSyncManager } from './rule-sync-manager';

vi.mock('vscode', () => {
  const findFilesMock = vi.fn();
  const readFileMock = vi.fn();
  const writeFileMock = vi.fn().mockResolvedValue(undefined);

  return {
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
      findFiles: findFilesMock,
      fs: {
        readFile: readFileMock,
        writeFile: writeFileMock
      },
      asRelativePath: (uri: { fsPath: string }): string => uri.fsPath.replace('/mock/workspace/', '')
    },
    Uri: {
      file: (p: string): { fsPath: string; scheme: string } => ({ fsPath: p, scheme: 'file' }),
      joinPath: (base: { fsPath: string }, ...paths: string[]): { fsPath: string; scheme: string } => ({
        fsPath: [base.fsPath, ...paths].join('/'),
        scheme: 'file'
      })
    }
  };
});

describe('RuleSyncManager', () => {
  let ruleSyncManager: RuleSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    ruleSyncManager = new RuleSyncManager();
  });

  describe('scanRuleSources', () => {
    it('should find and parse external rule files', async () => {
      const mockUri1 = { fsPath: '/mock/workspace/.cursorrules', scheme: 'file' };
      const mockUri2 = { fsPath: '/mock/workspace/AGENTS.md', scheme: 'file' };

      (vscode.workspace.findFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([mockUri1, mockUri2]);
      (vscode.workspace.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('.cursorrules')) {
          return Promise.resolve(new TextEncoder().encode('Always use strict TypeScript types'));
        }
        if (uri.fsPath.endsWith('AGENTS.md')) {
          return Promise.resolve(new TextEncoder().encode('Follow SOLID principles'));
        }
        return Promise.reject(new Error('File not found'));
      });

      const sources = await ruleSyncManager.scanRuleSources();

      expect(sources).toHaveLength(2);
      expect(sources[0].relativePath).toBe('.cursorrules');
      expect(sources[0].content).toBe('Always use strict TypeScript types');
      expect(sources[1].relativePath).toBe('AGENTS.md');
      expect(sources[1].content).toBe('Follow SOLID principles');
    });
  });

  describe('convertWorkspaceRules', () => {
    it('should throw error if no workspace or rule files found', async () => {
      (vscode.workspace.findFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(ruleSyncManager.convertWorkspaceRules()).rejects.toThrow(
        'No external AI rule files (.cursorrules, .windsurfrules, .clinerules, AGENTS.md, etc.) found in workspace.'
      );
    });

    it('should convert rule sources into .github/copilot-instructions.md', async () => {
      const mockUri = { fsPath: '/mock/workspace/.cursorrules', scheme: 'file' };
      (vscode.workspace.findFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([mockUri]);
      (vscode.workspace.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('.cursorrules')) {
          return Promise.resolve(new TextEncoder().encode('--- title: Rule ---\n\nClean code rules'));
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await ruleSyncManager.convertWorkspaceRules();

      expect(result.convertedFiles).toContain('.cursorrules');
      expect(result.totalRulesImported).toBe(1);
      expect(result.instructionsContent).toContain('Clean code rules');
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: expect.stringContaining('.github/copilot-instructions.md') }),
        expect.any(Uint8Array)
      );
    });

    it('should be idempotent and overwrite previously synchronized rule section', async () => {
      const mockUri = { fsPath: '/mock/workspace/.cursorrules', scheme: 'file' };
      (vscode.workspace.findFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([mockUri]);
      (vscode.workspace.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('.cursorrules')) {
          return Promise.resolve(new TextEncoder().encode('Updated rule content'));
        }
        if (uri.fsPath.endsWith('copilot-instructions.md')) {
          return Promise.resolve(
            new TextEncoder().encode(
              '# Header\n\n## Synchronized External Rules\n\nOld synchronized content'
            )
          );
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await ruleSyncManager.convertWorkspaceRules();

      expect(result.instructionsContent).toContain('Updated rule content');
      expect(result.instructionsContent).not.toContain('Old synchronized content');
      expect(result.instructionsContent.match(/## Synchronized External Rules/g)).toHaveLength(1);
    });
  });
});
