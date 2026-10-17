import * as vscode from 'vscode';

export interface CodeSmell {
  type: 'complexity' | 'maintainability' | 'security' | 'testing' | 'type-safety';
  severity: 'error' | 'warning' | 'info';
  message: string;
  lineNumber?: number;
  suggestion: string;
}

export interface CodeHealthReport {
  fileName: string;
  score: number;
  rating: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: {
    totalLines: number;
    estimatedComplexity: number;
    functionCount: number;
    anyTypeCount: number;
  };
  smells: CodeSmell[];
  markdownSummary: string;
}

export class CodeHealthAdvisor {
  public analyzeCode(code: string, fileName: string = 'active-file.ts'): CodeHealthReport {
    const lines = code.split(/\r?\n/);
    const totalLines = lines.length;

    const smells: CodeSmell[] = [];
    let cyclomaticCount = 1;
    let functionCount = 0;
    let anyTypeCount = 0;

    const functionLineCounts: { name: string; line: number; length: number }[] = [];
    let currentFuncName = '';
    let currentFuncStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Cyclomatic complexity indicators
      if (/\b(if|else if|for|while|catch|switch|case)\b/.test(trimmed)) {
        cyclomaticCount++;
      }
      if (trimmed.includes('&&') || trimmed.includes('||')) {
        cyclomaticCount++;
      }

      // Count `any` types
      const anyMatches = trimmed.match(/:\s*any\b/g);
      if (anyMatches) {
        anyTypeCount += anyMatches.length;
        if (anyTypeCount <= 3) {
          smells.push({
            type: 'type-safety',
            severity: 'warning',
            message: `Overuse of explicit 'any' type at line ${i + 1}`,
            lineNumber: i + 1,
            suggestion: 'Replace explicit `any` with specific interfaces, generics, or `unknown`.'
          });
        }
      }

      // Detect function start
      const funcMatch = trimmed.match(/\b(function|class|const|let|var)\s+([a-zA-Z0-9_$]+)\s*=?\s*(async\s*)?\(?/);
      if (funcMatch && (trimmed.includes('function') || trimmed.includes('=>') || trimmed.includes('class'))) {
        functionCount++;
        if (currentFuncStart !== -1 && currentFuncName) {
          functionLineCounts.push({
            name: currentFuncName,
            line: currentFuncStart + 1,
            length: i - currentFuncStart
          });
        }
        currentFuncName = funcMatch[2] || 'anonymous';
        currentFuncStart = i;
      }

      // Hardcoded credentials detection
      if (/(api_key|password|secret|private_key|token)\s*=\s*['"][A-Za-z0-9_\-=]{8,}['"]/i.test(trimmed)) {
        smells.push({
          type: 'security',
          severity: 'error',
          message: `Potential hardcoded secret or credential at line ${i + 1}`,
          lineNumber: i + 1,
          suggestion: 'Extract secrets to environment variables or VS Code SecretStorage.'
        });
      }

      // Unsafe evaluation
      if (/\b(eval\(|new Function\(|child_process\.exec\()/i.test(trimmed)) {
        smells.push({
          type: 'security',
          severity: 'error',
          message: `Unsafe code execution detected at line ${i + 1}`,
          lineNumber: i + 1,
          suggestion: 'Avoid dynamic execution like eval(). Use safe alternatives or sandboxed parsing.'
        });
      }

      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
        smells.push({
          type: 'maintainability',
          severity: 'warning',
          message: `Empty catch block detected at line ${i + 1}`,
          lineNumber: i + 1,
          suggestion: 'Log errors or handle failure states explicitly instead of swallowing exceptions.'
        });
      }
    }

    if (currentFuncStart !== -1 && currentFuncName) {
      functionLineCounts.push({
        name: currentFuncName,
        line: currentFuncStart + 1,
        length: lines.length - currentFuncStart
      });
    }

    // Check long functions
    for (const f of functionLineCounts) {
      if (f.length > 50) {
        smells.push({
          type: 'maintainability',
          severity: 'warning',
          message: `Function/Class '${f.name}' is too long (${f.length} lines, started at line ${f.line})`,
          lineNumber: f.line,
          suggestion: 'Decompose long function into smaller single-responsibility helper functions.'
        });
      }
    }

    // High complexity warning
    if (cyclomaticCount > 15) {
      smells.push({
        type: 'complexity',
        severity: 'error',
        message: `High overall cyclomatic complexity (~${cyclomaticCount})`,
        suggestion: 'Simplify conditional branches and split complex logic using Strategy or Command patterns.'
      });
    }

    // Calculate score
    let score = 100;
    for (const s of smells) {
      if (s.severity === 'error') score -= 15;
      else if (s.severity === 'warning') score -= 7;
      else score -= 3;
    }
    score = Math.max(0, Math.min(100, score));

    let rating: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
    if (score < 60) rating = 'F';
    else if (score < 70) rating = 'D';
    else if (score < 80) rating = 'C';
    else if (score < 90) rating = 'B';

    const markdownSummary = this.buildMarkdown(fileName, score, rating, totalLines, cyclomaticCount, functionCount, anyTypeCount, smells);

    return {
      fileName,
      score,
      rating,
      metrics: {
        totalLines,
        estimatedComplexity: cyclomaticCount,
        functionCount,
        anyTypeCount
      },
      smells,
      markdownSummary
    };
  }

  public async analyzeActiveEditor(): Promise<CodeHealthReport | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;

    const code = editor.document.getText();
    const fileName = vscode.workspace.asRelativePath(editor.document.uri);

    return this.analyzeCode(code, fileName);
  }

  private buildMarkdown(
    fileName: string,
    score: number,
    rating: string,
    lines: number,
    complexity: number,
    functions: number,
    anyCount: number,
    smells: CodeSmell[]
  ): string {
    return [
      `### 🏥 Code Health Audit: \`${fileName}\``,
      ``,
      `- **Health Score:** **${score}/100** (Grade: **${rating}**)`,
      `- **Lines of Code:** ${lines}`,
      `- **Estimated Complexity:** ${complexity}`,
      `- **Detected Functions:** ${functions}`,
      `- **Explicit 'any' Types:** ${anyCount}`,
      ``,
      `#### ⚠️ Detected Code Smells & Suggestions (${smells.length})`,
      smells.length > 0
        ? smells
            .map((s) => {
              const icon = s.severity === 'error' ? '❌' : s.severity === 'warning' ? '⚠️' : 'ℹ️';
              const line = s.lineNumber ? ` (line ${s.lineNumber})` : '';
              return `- ${icon} **[${s.type.toUpperCase()}]** ${s.message}${line}\n  *Fix:* ${s.suggestion}`;
            })
            .join('\n')
        : '✅ No major code smells or quality bottlenecks detected! Code passes health checks.'
    ].join('\n');
  }
}
