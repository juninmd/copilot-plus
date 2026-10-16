import { describe, it, expect, vi } from 'vitest';
import { CodeHealthAnalyzer } from './code-health-analyzer';

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined
  },
  workspace: {
    asRelativePath: (uri: { path: string }): string => uri.path,
    findFiles: vi.fn().mockResolvedValue([])
  },
  Uri: {
    file: (path: string): { path: string; fsPath: string } => ({ path, fsPath: path })
  }
}));

describe('CodeHealthAnalyzer', () => {
  it('analyzes clean code with high health score', () => {
    const analyzer = new CodeHealthAnalyzer();
    const cleanCode = `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `;

    const report = analyzer.analyzeCode(cleanCode, 'src/math.ts', true);

    expect(report.healthScore).toBe(100);
    expect(report.rating).toBe('Excellent');
    expect(report.debtMarkers.length).toBe(0);
    expect(report.hasAssociatedTestFile).toBe(true);
    expect(report.summaryMarkdown).toContain('100/100');
  });

  it('detects technical debt markers (TODO, FIXME, any)', () => {
    const analyzer = new CodeHealthAnalyzer();
    const messyCode = `
      // TODO: Refactor this method
      // FIXME: Handle null case
      function process(data: any): any {
        return data;
      }
    `;

    const report = analyzer.analyzeCode(messyCode, 'src/process.ts', true);

    expect(report.debtMarkers.length).toBeGreaterThan(0);
    expect(report.healthScore).toBeLessThan(100);
    expect(report.debtMarkers.some(d => d.type === 'TODO')).toBe(true);
    expect(report.debtMarkers.some(d => d.type === 'FIXME')).toBe(true);
    expect(report.debtMarkers.some(d => d.type === 'ANY_TYPE')).toBe(true);
  });

  it('detects missing test files and complexity issues', () => {
    const analyzer = new CodeHealthAnalyzer();
    const longCode = Array(350).fill('  const x = 1;').join('\n');

    const report = analyzer.analyzeCode(longCode, 'src/big.ts', false);

    expect(report.hasAssociatedTestFile).toBe(false);
    expect(report.complexityIssues.length).toBeGreaterThan(0);
    expect(report.healthScore).toBeLessThan(90);
    expect(report.summaryMarkdown).toContain('Missing Unit Test');
  });
});
