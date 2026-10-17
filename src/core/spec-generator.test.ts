import { describe, it, expect, vi } from 'vitest';
import { SpecGenerator } from './spec-generator';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/test/workspace', path: '/test/workspace' }
      }
    ],
    findFiles: vi.fn().mockResolvedValue([])
  }
}));

describe('SpecGenerator', () => {
  it('should generate feature specification with formatted steps', async () => {
    const generator = new SpecGenerator();
    const result = await generator.generateSpec('Add real-time web socket dashboard');

    expect(result.featureName).toBe('Add real-time web socket dashboard');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.markdownSpec).toContain('# 📋 Spec-Driven Feature Plan: Add real-time web socket dashboard');
    expect(result.markdownSpec).toContain('## 📌 Execution Steps');
  });
});
