import * as vscode from 'vscode';
import { DiffReviewer } from './diff-reviewer';

export interface RegressionRisk {
  type: 'breaking_change' | 'missing_test' | 'type_safety' | 'export_change';
  severity: 'high' | 'medium' | 'low';
  message: string;
  file?: string;
  line?: number;
}

export interface AntiRegressionGuardReport {
  riskScore: number; // 0 to 100 (0 = safe, 100 = critical risk)
  status: 'safe' | 'warning' | 'critical';
  risks: RegressionRisk[];
  summaryMarkdown: string;
}

export class AntiRegressionGuard {
  private readonly diffReviewer: DiffReviewer;

  constructor(diffReviewer?: DiffReviewer) {
    this.diffReviewer = diffReviewer ?? new DiffReviewer();
  }

  public async evaluateRegressionRisk(): Promise<AntiRegressionGuardReport> {
    const diff = await this.diffReviewer.getWorkspaceDiff();
    const risks: RegressionRisk[] = [];

    let hasSourceChanges = false;
    let hasTestChanges = false;

    for (const file of diff.files) {
      if (file.filePath.includes('.test.') || file.filePath.includes('.spec.') || file.filePath.includes('test/')) {
        hasTestChanges = true;
      } else {
        hasSourceChanges = true;
      }

      const patchLines = file.patch.split('\n');
      for (const line of patchLines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
          const content = line.substring(1).trim();
          if (content.startsWith('export ') || content.includes('interface ') || content.includes('type ')) {
            risks.push({
              type: 'export_change',
              severity: 'high',
              message: `Exported interface/type signature removed or modified in ${file.filePath}`,
              file: file.filePath
            });
          }
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
          const content = line.substring(1).trim();
          if (content.includes('as any') || content.includes('@ts-ignore') || content.includes('any')) {
            risks.push({
              type: 'type_safety',
              severity: 'medium',
              message: `Potential type safety degradation detected in ${file.filePath}: "${content}"`,
              file: file.filePath
            });
          }
        }
      }
    }

    if (hasSourceChanges && !hasTestChanges) {
      risks.push({
        type: 'missing_test',
        severity: 'high',
        message: 'Source code was modified without corresponding test file updates.'
      });
    }

    const highSeverityCount = risks.filter(r => r.severity === 'high').length;
    const mediumSeverityCount = risks.filter(r => r.severity === 'medium').length;

    let riskScore = Math.min(100, highSeverityCount * 35 + mediumSeverityCount * 15);
    let status: 'safe' | 'warning' | 'critical' = 'safe';

    if (riskScore >= 60) {
      status = 'critical';
    } else if (riskScore > 0) {
      status = 'warning';
    }

    const summaryMarkdown = this.formatSummary(riskScore, status, risks, diff.files.length);

    return {
      riskScore,
      status,
      risks,
      summaryMarkdown
    };
  }

  private formatSummary(
    score: number,
    status: 'safe' | 'warning' | 'critical',
    risks: RegressionRisk[],
    fileCount: number
  ): string {
    const statusIcon = status === 'safe' ? '🟢 SAFE' : status === 'warning' ? '🟡 WARNING' : '🔴 CRITICAL RISK';

    const lines = [
      `# 🛡️ Anti-Regression & Architectural Guard`,
      ``,
      `- **Status:** **${statusIcon}**`,
      `- **Regression Risk Score:** **${score}/100**`,
      `- **Modified Files Analyzed:** ${fileCount}`,
      ``
    ];

    if (risks.length === 0) {
      lines.push('✅ No architectural or test regression risks detected in current uncommitted changes.');
    } else {
      lines.push('### ⚠️ Detected Risks & Warnings');
      for (const r of risks) {
        const icon = r.severity === 'high' ? '🚨' : '⚠️';
        lines.push(`- ${icon} **[${r.severity.toUpperCase()}]** ${r.message}`);
      }
    }

    return lines.join('\n');
  }
}
