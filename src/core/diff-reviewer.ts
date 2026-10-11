import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DiffFileChange {
  filePath: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  patch: string;
}

export interface DiffIssue {
  type: 'security' | 'clean-code' | 'testing';
  severity: 'high' | 'medium' | 'info';
  filePath: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface DiffReviewResult {
  workspacePath: string;
  files: DiffFileChange[];
  totalAdditions: number;
  totalDeletions: number;
  issues: DiffIssue[];
  summaryMarkdown: string;
  estimatedTokens: number;
}

export class DiffReviewer {
  public async getWorkspaceDiff(
    workspacePath?: string,
    stagedOnly: boolean = false
  ): Promise<DiffReviewResult> {
    const rootPath = workspacePath || this.getWorkspaceRoot();
    if (!rootPath) {
      return this.buildEmptyResult('No workspace folder open.');
    }

    try {
      const gitCmd = stagedOnly ? 'git diff --cached' : 'git diff HEAD';
      let { stdout: rawDiff } = await execAsync(gitCmd, { cwd: rootPath });

      // Fallback to git diff if HEAD has no commits yet
      if (!rawDiff && !stagedOnly) {
        const fallback = await execAsync('git diff', { cwd: rootPath }).catch(() => ({ stdout: '' }));
        rawDiff = fallback.stdout;
      }

      if (!rawDiff || !rawDiff.trim()) {
        return this.buildEmptyResult(rootPath, 'No uncommitted git changes detected.');
      }

      const files = this.parseDiff(rawDiff);
      const issues = this.analyzeIssues(files);
      const estimatedTokens = Math.ceil(rawDiff.length / 4);

      let totalAdditions = 0;
      let totalDeletions = 0;
      for (const f of files) {
        totalAdditions += f.additions;
        totalDeletions += f.deletions;
      }

      const summaryMarkdown = this.formatMarkdownReport(
        files,
        issues,
        totalAdditions,
        totalDeletions,
        estimatedTokens
      );

      return {
        workspacePath: rootPath,
        files,
        totalAdditions,
        totalDeletions,
        issues,
        summaryMarkdown,
        estimatedTokens
      };
    } catch (err) {
      return this.buildEmptyResult(
        rootPath,
        `Git diff execution failed or workspace is not a git repository (${String(err)})`
      );
    }
  }

  public parseDiff(rawDiff: string): DiffFileChange[] {
    const fileBlocks = rawDiff.split(/^diff --git /m).filter(Boolean);
    const result: DiffFileChange[] = [];

    for (const block of fileBlocks) {
      const lines = block.split('\n');
      const headerLine = lines[0] || '';
      const match = headerLine.match(/a\/(.+?)\s+b\/(.+)/);
      const filePath = match ? match[2] : headerLine.split(' ').pop() || 'unknown';

      let status: 'added' | 'modified' | 'deleted' = 'modified';
      if (block.includes('new file mode')) {
        status = 'added';
      } else if (block.includes('deleted file mode')) {
        status = 'deleted';
      }

      let additions = 0;
      let deletions = 0;
      const patchLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
          patchLines.push(line);
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
          patchLines.push(line);
        } else if (line.startsWith('@@ ')) {
          patchLines.push(line);
        }
      }

      result.push({
        filePath,
        status,
        additions,
        deletions,
        patch: patchLines.join('\n')
      });
    }

    return result;
  }

  public analyzeIssues(files: DiffFileChange[]): DiffIssue[] {
    const issues: DiffIssue[] = [];

    const secretPatterns = [
      { pattern: /(api[_-]?key|secret|password|bearer|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{8,}['"]/i, msg: 'Possible hardcoded secret or API key detected.' },
      { pattern: /ghp_[A-Za-z0-9_]{36}/, msg: 'Exposed GitHub Personal Access Token.' },
      { pattern: /AKIA[0-9A-Z]{16}/, msg: 'Exposed AWS Access Key ID.' }
    ];

    const codeQualityPatterns = [
      { pattern: /\beval\s*\(/, msg: 'Use of eval() introduces severe security risks.' },
      { pattern: /innerHTML\s*=/, msg: 'Direct innerHTML assignment may lead to XSS vulnerabilities.' },
      { pattern: /:\s*any\b/, msg: 'Use of explicit "any" type bypasses TypeScript type safety.' },
      { pattern: /console\.log\(/, msg: 'Leftover console.log debug statement detected.' }
    ];

    for (const file of files) {
      const addedLines = file.patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));

      for (const line of addedLines) {
        // Security checks
        for (const sp of secretPatterns) {
          if (sp.pattern.test(line)) {
            issues.push({
              type: 'security',
              severity: 'high',
              filePath: file.filePath,
              message: sp.msg,
              suggestion: 'Store credentials safely in environment variables or VS Code secret storage.'
            });
          }
        }

        // Clean code checks
        for (const qp of codeQualityPatterns) {
          if (qp.pattern.test(line)) {
            issues.push({
              type: 'clean-code',
              severity: qp.msg.includes('eval') || qp.msg.includes('innerHTML') ? 'high' : 'info',
              filePath: file.filePath,
              message: qp.msg,
              suggestion: 'Refactor line to follow strict typing and secure practices.'
            });
          }
        }
      }

      // Check test files presence
      if (
        !file.filePath.includes('.test.') &&
        !file.filePath.includes('.spec.') &&
        file.additions > 30 &&
        !files.some((f) => f.filePath.includes('.test.') || f.filePath.includes('.spec.'))
      ) {
        issues.push({
          type: 'testing',
          severity: 'medium',
          filePath: file.filePath,
          message: `Significant changes (${file.additions} additions) made without corresponding unit tests.`,
          suggestion: 'Add test cases in a .test.ts file to ensure continuous regression protection.'
        });
      }
    }

    return issues;
  }

  private formatMarkdownReport(
    files: DiffFileChange[],
    issues: DiffIssue[],
    totalAdditions: number,
    totalDeletions: number,
    estimatedTokens: number
  ): string {
    const parts: string[] = [];
    parts.push('### 🔍 Copilot+ Automated Git Diff Review\n');
    parts.push(`- **Files Modified:** ${files.length}`);
    parts.push(`- **Changes:** \`+${totalAdditions}\` / \`-${totalDeletions}\``);
    parts.push(`- **Estimated Diff Context:** ~${estimatedTokens} tokens\n`);

    if (issues.length > 0) {
      parts.push('#### ⚠️ Detected Issues & Recommendations');
      for (const issue of issues) {
        const icon = issue.severity === 'high' ? '🚨' : issue.severity === 'medium' ? '⚠️' : 'ℹ️';
        parts.push(`- ${icon} **[${issue.type.toUpperCase()}]** \`${issue.filePath}\`: ${issue.message}`);
        if (issue.suggestion) {
          parts.push(`  *Suggestion:* ${issue.suggestion}`);
        }
      }
      parts.push('');
    } else {
      parts.push('✅ **No critical security or code quality issues detected in the diff.**\n');
    }

    parts.push('#### 📁 Modified Files');
    for (const f of files) {
      const statusIcon = f.status === 'added' ? '🟢' : f.status === 'deleted' ? '🔴' : '🟡';
      parts.push(`- ${statusIcon} \`${f.filePath}\` (\`+${f.additions}\` / \`-${f.deletions}\`)`);
    }

    return parts.join('\n');
  }

  private buildEmptyResult(workspacePath: string, message?: string): DiffReviewResult {
    return {
      workspacePath,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      issues: [],
      summaryMarkdown: `### 🔍 Copilot+ Automated Git Diff Review\n\n${message || 'No workspace open or no changes found.'}`,
      estimatedTokens: 0
    };
  }

  private getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  }
}
