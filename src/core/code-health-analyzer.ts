import * as vscode from 'vscode';

export interface DebtMarker {
  line: number;
  type: string;
  text: string;
}

export interface ComplexityIssue {
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface CodeHealthReport {
  fileName: string;
  totalLines: number;
  healthScore: number;
  rating: 'Excellent' | 'Good' | 'Needs Improvement' | 'Critical';
  debtMarkers: DebtMarker[];
  complexityIssues: ComplexityIssue[];
  hasAssociatedTestFile: boolean;
  summaryMarkdown: string;
}

export class CodeHealthAnalyzer {
  public async analyzeActiveEditor(): Promise<CodeHealthReport | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const code = document.getText();
    const fileName = vscode.workspace.asRelativePath(document.uri);
    const hasTestFile = await this.checkAssociatedTestFile(document.uri);

    return this.analyzeCode(code, fileName, hasTestFile);
  }

  public analyzeCode(
    code: string,
    fileName: string = 'active-file.ts',
    hasAssociatedTestFile: boolean = true
  ): CodeHealthReport {
    const lines = code.split(/\r?\n/);
    const totalLines = lines.length;

    const debtMarkers: DebtMarker[] = [];
    const complexityIssues: ComplexityIssue[] = [];

    let maxIndentationDepth = 0;

    // Debt pattern matchers
    const markerRegex = /(?:^|[\s/])(TODO|FIXME|HACK|XXX|DEPRECATED|@?ts-(?:ignore|nocheck))\b/i;
    const anyRegex = /(:\s*any\b|<any\b|as\s+any\b)/;

    lines.forEach((lineText, index) => {
      const lineNumber = index + 1;

      // Debt marker check
      const markerMatch = lineText.match(markerRegex);
      if (markerMatch) {
        debtMarkers.push({
          line: lineNumber,
          type: markerMatch[1].toUpperCase(),
          text: lineText.trim()
        });
      }

      // Explicit 'any' usage check
      if (anyRegex.test(lineText)) {
        debtMarkers.push({
          line: lineNumber,
          type: 'ANY_TYPE',
          text: lineText.trim()
        });
      }

      // Indentation depth heuristic (assuming 2 or 4 spaces per indent)
      const indentMatch = lineText.match(/^(\s+)/);
      if (indentMatch && lineText.trim().length > 0) {
        const indentStr = indentMatch[1];
        const depth = indentStr.includes('\t')
          ? indentStr.length
          : Math.floor(indentStr.length / 2);
        if (depth > maxIndentationDepth) {
          maxIndentationDepth = depth;
        }
      }
    });

    // Complexity checks
    if (totalLines > 500) {
      complexityIssues.push({
        message: `File exceeds 500 lines (${totalLines} lines). Consider splitting into smaller modules.`,
        severity: 'error'
      });
    } else if (totalLines > 300) {
      complexityIssues.push({
        message: `File is getting large (${totalLines} lines). Monitor for single responsibility violations.`,
        severity: 'warning'
      });
    }

    if (maxIndentationDepth > 6) {
      complexityIssues.push({
        message: `Deep indentation nesting detected (max depth: ${maxIndentationDepth}). Refactor deeply nested logic.`,
        severity: 'warning'
      });
    }

    if (!hasAssociatedTestFile) {
      complexityIssues.push({
        message: 'No associated unit test file found for this module.',
        severity: 'info'
      });
    }

    // Score calculation
    let healthScore = 100;
    healthScore -= debtMarkers.filter(d => d.type === 'FIXME' || d.type === 'HACK').length * 8;
    healthScore -= debtMarkers.filter(d => d.type === 'TODO' || d.type === 'XXX').length * 3;
    healthScore -= debtMarkers.filter(d => d.type === 'ANY_TYPE' || d.type.includes('TS-')).length * 4;

    if (totalLines > 500) healthScore -= 15;
    else if (totalLines > 300) healthScore -= 8;

    if (maxIndentationDepth > 6) healthScore -= 10;
    if (!hasAssociatedTestFile) healthScore -= 10;

    healthScore = Math.max(0, Math.min(100, healthScore));

    let rating: CodeHealthReport['rating'] = 'Excellent';
    if (healthScore < 50) rating = 'Critical';
    else if (healthScore < 75) rating = 'Needs Improvement';
    else if (healthScore < 90) rating = 'Good';

    const summaryMarkdown = this.formatMarkdownSummary(
      fileName,
      totalLines,
      healthScore,
      rating,
      debtMarkers,
      complexityIssues,
      hasAssociatedTestFile
    );

    return {
      fileName,
      totalLines,
      healthScore,
      rating,
      debtMarkers,
      complexityIssues,
      hasAssociatedTestFile,
      summaryMarkdown
    };
  }

  public async checkAssociatedTestFile(fileUri: vscode.Uri): Promise<boolean> {
    const fsPath = fileUri.fsPath;
    if (fsPath.includes('.test.') || fsPath.includes('.spec.') || fsPath.includes('_test.')) {
      return true;
    }

    const baseName = fileUri.path.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? '';
    if (!baseName) return false;

    try {
      const matches = await vscode.workspace.findFiles(
        `**/${baseName}{.test,.spec,_test}.*`,
        '**/node_modules/**',
        1
      );
      return matches.length > 0;
    } catch {
      return false;
    }
  }

  private formatMarkdownSummary(
    fileName: string,
    totalLines: number,
    healthScore: number,
    rating: CodeHealthReport['rating'],
    debtMarkers: DebtMarker[],
    complexityIssues: ComplexityIssue[],
    hasAssociatedTestFile: boolean
  ): string {
    const scoreBadge = rating === 'Excellent' ? '🟢' : rating === 'Good' ? '🟡' : rating === 'Needs Improvement' ? '🟠' : '🔴';

    const lines = [
      `### ${scoreBadge} Code Health Analysis: \`${fileName}\``,
      ``,
      `- **Health Score:** **${healthScore}/100** (${rating})`,
      `- **Total Lines:** ${totalLines}`,
      `- **Test File Status:** ${hasAssociatedTestFile ? '✅ Unit Test Found' : '⚠️ Missing Unit Test'}`,
      `- **Technical Debt Markers:** ${debtMarkers.length}`,
      ``
    ];

    if (complexityIssues.length > 0) {
      lines.push(`#### ⚠️ Complexity & Structural Issues`);
      for (const issue of complexityIssues) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        lines.push(`- ${icon} ${issue.message}`);
      }
      lines.push(``);
    }

    if (debtMarkers.length > 0) {
      lines.push(`#### 📋 Technical Debt Markers`);
      for (const debt of debtMarkers.slice(0, 10)) {
        lines.push(`- Line ${debt.line} [**${debt.type}**]: \`${debt.text}\``);
      }
      if (debtMarkers.length > 10) {
        lines.push(`- ...and ${debtMarkers.length - 10} more marker(s).`);
      }
      lines.push(``);
    }

    return lines.join('\n');
  }
}
