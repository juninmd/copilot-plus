import { describe, it, expect, vi } from 'vitest';
import { AntiRegressionGuard } from './anti-regression-guard';
import { DiffReviewer } from './diff-reviewer';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
  }
}));

describe('AntiRegressionGuard', () => {
  it('should detect export changes and missing test risks', async () => {
    const mockDiffReviewer = {
      getWorkspaceDiff: vi.fn().mockResolvedValue({
        workspacePath: '/test/workspace',
        files: [
          {
            filePath: 'src/core/service.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            patch: '-export interface LegacyConfig\n+export interface NewConfig\n+const val = x as any;'
          }
        ],
        totalAdditions: 10,
        totalDeletions: 5,
        issues: [],
        summaryMarkdown: '',
        estimatedTokens: 100
      })
    } as unknown as DiffReviewer;

    const guard = new AntiRegressionGuard(mockDiffReviewer);
    const report = await guard.evaluateRegressionRisk();

    expect(report.risks.length).toBeGreaterThan(0);
    expect(report.risks.some(r => r.type === 'export_change')).toBe(true);
    expect(report.risks.some(r => r.type === 'missing_test')).toBe(true);
    expect(report.summaryMarkdown).toContain('# 🛡️ Anti-Regression & Architectural Guard');
  });
});
