import { describe, it, expect, vi } from 'vitest';
import { ArchitectureIndexer } from './architecture-indexer';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ name: 'TestWorkspace', uri: { fsPath: '/test' } }],
    findFiles: vi.fn().mockResolvedValue([]),
    asRelativePath: (pathStr: string) => pathStr,
    fs: {
      readFile: vi.fn()
    }
  }
}));

describe('ArchitectureIndexer', () => {
  it('should detect entrypoints correctly', () => {
    const indexer = new ArchitectureIndexer();
    const paths = [
      'src/extension.ts',
      'src/core/logger.ts',
      'index.js',
      'app/main.py',
      'README.md'
    ];

    const entrypoints = indexer.detectEntrypoints(paths);
    expect(entrypoints).toEqual(['app/main.py', 'index.js', 'src/extension.ts']);
  });

  it('should group paths into modules correctly', () => {
    const indexer = new ArchitectureIndexer();
    const paths = [
      'src/core/a.ts',
      'src/core/b.ts',
      'src/providers/c.ts',
      'package.json'
    ];
    const entrypoints = ['src/core/a.ts'];

    const modules = indexer.detectModules(paths, entrypoints);
    expect(modules.length).toBeGreaterThan(0);
    const srcMod = modules.find((m) => m.name === 'src');
    expect(srcMod).toBeDefined();
    expect(srcMod?.fileCount).toBe(3);
    expect(srcMod?.entrypoints).toEqual(['src/core/a.ts']);
  });

  it('should generate markdown summary correctly', () => {
    const indexer = new ArchitectureIndexer();
    const summary = indexer.generateMarkdownSummary(
      'TestWorkspace',
      ['TypeScript', 'VS Code Extension API'],
      10,
      [{ name: 'src', relativePath: 'src', fileCount: 8, entrypoints: ['src/extension.ts'] }],
      ['vscode', 'typescript'],
      ['src/extension.ts']
    );

    expect(summary).toContain('Workspace Architecture Index: TestWorkspace');
    expect(summary).toContain('TypeScript, VS Code Extension API');
    expect(summary).toContain('src/extension.ts');
    expect(summary).toContain('`vscode`, `typescript`');
  });
});
