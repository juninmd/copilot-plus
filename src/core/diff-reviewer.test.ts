import { describe, it, expect, vi } from 'vitest';
import { DiffReviewer } from './diff-reviewer';

vi.mock('vscode', () => {
  return {
    workspace: {
      workspaceFolders: [
        { name: 'mock-workspace', uri: { fsPath: '/mock/workspace', scheme: 'file' } }
      ]
    }
  };
});

describe('DiffReviewer', () => {
  const reviewer = new DiffReviewer();

  it('correctly parses raw unified git diff', () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index 1234567..89abcdef 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 import * as fs from 'fs';
+const apiKey = 'api_key="1234567890"';
+console.log(apiKey);
`;

    const files = reviewer.parseDiff(rawDiff);
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src/index.ts');
    expect(files[0].status).toBe('modified');
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(0);
  });

  it('detects security risks and code quality issues', () => {
    const rawDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,2 +1,4 @@
+const token = "secret: '1234567890'";
+eval(token);
+console.log(token);
`;

    const files = reviewer.parseDiff(rawDiff);
    const issues = reviewer.analyzeIssues(files);

    expect(issues.some((i) => i.type === 'security')).toBe(true);
    expect(issues.some((i) => i.message.includes('eval()'))).toBe(true);
    expect(issues.some((i) => i.message.includes('console.log'))).toBe(true);
  });

  it('suggests unit tests for substantial non-test file additions', () => {
    const patchLines: string[] = ['@@ -0,0 +1,40 @@'];
    for (let i = 0; i < 35; i++) {
      patchLines.push(`+const line${i} = ${i};`);
    }

    const files = [
      {
        filePath: 'src/heavy-feature.ts',
        status: 'added' as const,
        additions: 35,
        deletions: 0,
        patch: patchLines.join('\n')
      }
    ];

    const issues = reviewer.analyzeIssues(files);
    expect(issues.some((i) => i.type === 'testing')).toBe(true);
  });

  it('handles empty diff or non-git folder gracefully', async () => {
    const result = await reviewer.getWorkspaceDiff('/non-existent-dir-12345');
    expect(result.files).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.summaryMarkdown).toContain('Copilot+ Automated Git Diff Review');
  });
});
