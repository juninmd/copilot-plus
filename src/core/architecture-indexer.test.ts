import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ArchitectureIndexer } from './architecture-indexer';

vi.mock('vscode', () => {
  const mockFs = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createDirectory: vi.fn(),
    readDirectory: vi.fn(),
    stat: vi.fn()
  };

  return {
    workspace: {
      workspaceFolders: [
        {
          uri: { path: '/workspace', fsPath: '/workspace' },
          name: 'test-project'
        }
      ],
      fs: mockFs,
      asRelativePath: (uri: { path: string }) => uri.path
    },
    Uri: {
      file: (path: string) => ({ path, fsPath: path }),
      joinPath: (base: { path: string }, ...paths: string[]) => ({
        path: `${base.path}/${paths.join('/')}`,
        fsPath: `${base.path}/${paths.join('/')}`
      })
    },
    FileType: {
      File: 1,
      Directory: 2,
      SymbolicLink: 64
    }
  };
});

describe('ArchitectureIndexer', () => {
  let indexer: ArchitectureIndexer;

  beforeEach(() => {
    vi.clearAllMocks();
    indexer = new ArchitectureIndexer();
  });

  it('should scan workspace and detect tech stack from package.json', async () => {
    const pkgContent = JSON.stringify({
      dependencies: { express: '^4.18.0', react: '^18.0.0' },
      devDependencies: { typescript: '^5.0.0' }
    });

    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode(pkgContent));
    vi.mocked(vscode.workspace.fs.readDirectory).mockImplementation(async (uri: any) => {
      if (uri.path.endsWith('/src')) {
        return [['extension.ts', vscode.FileType.File]];
      }
      return [
        ['src', vscode.FileType.Directory],
        ['package.json', vscode.FileType.File]
      ];
    });

    const summary = await indexer.scanWorkspace();

    expect(summary.projectName).toBe('test-project');
    expect(summary.detectedLanguages).toContain('TypeScript/JavaScript');
    expect(summary.entryPoints).toContain('src/extension.ts');
    expect(summary.keyDependencies).toContain('express');
    expect(summary.markdownSummary).toContain('TypeScript/JavaScript');
  });

  it('should generate and write .github/copilot-architecture.md', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('FileNotFound'));
    vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([]);

    const uri = await indexer.generateAndSaveArchitectureFile();

    expect(uri).toBeDefined();
    expect(uri?.path).toContain('.github/copilot-architecture.md');
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
  });
});
