import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CodeHealthAdvisor } from './code-health-advisor';

vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: undefined
    },
    workspace: {
      asRelativePath: (uri: { path: string }) => uri.path
    }
  };
});

describe('CodeHealthAdvisor', () => {
  let advisor: CodeHealthAdvisor;

  beforeEach(() => {
    advisor = new CodeHealthAdvisor();
  });

  it('should return score 100 and grade A for clean code', () => {
    const code = `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `;

    const report = advisor.analyzeCode(code, 'src/math.ts');

    expect(report.score).toBe(100);
    expect(report.rating).toBe('A');
    expect(report.smells.length).toBe(0);
  });

  it('should detect secrets, eval usage, and explicit any types', () => {
    const dirtyCode = `
      const api_key = "secret_1234567890";
      function doStuff(data: any): any {
        eval(data);
        if (data) { if (data) { if (data) { if (data) {} } } }
        try {} catch (e) {}
      }
    `;

    const report = advisor.analyzeCode(dirtyCode, 'src/dirty.ts');

    expect(report.score).toBeLessThan(100);
    expect(report.smells.some((s) => s.type === 'security')).toBe(true);
    expect(report.smells.some((s) => s.type === 'type-safety')).toBe(true);
    expect(report.smells.some((s) => s.type === 'maintainability')).toBe(true);
  });

  it('should analyze active editor text document when present', async () => {
    const mockEditor = {
      document: {
        getText: () => 'const x: number = 42;',
        uri: { path: 'src/active.ts' }
      }
    };

    (vscode.window as any).activeTextEditor = mockEditor;

    const report = await advisor.analyzeActiveEditor();

    expect(report).toBeDefined();
    expect(report?.fileName).toBe('src/active.ts');
    expect(report?.score).toBe(100);
  });
});
