import * as vscode from 'vscode';
import { fetchQuota, invalidateCache, type QuotaInfo, type QuotaResult } from './quota-service';
import { type RequestTracker } from './request-tracker';
import { showLogs } from './logger';
import { checkThresholds } from './model-advisor';

function fmt(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(2);
}

function buildLabel(result: QuotaResult, tracker: RequestTracker): string {
  const sessionCost = tracker.getSessionCost();
  const sessionStr = sessionCost > 0 ? ` · -${fmt(sessionCost)}` : '';

  if (result.quota) {
    const { remaining, total, percentUsed } = result.quota;
    const icon = percentUsed >= 100 ? '$(error)' : percentUsed >= 85 ? '$(warning)' : '$(copilot)';
    return `${icon} ${remaining}/${total} (${100 - percentUsed}% left)${sessionStr}`;
  }

  const todayCost = tracker.getTodayCost();
  const todayStr = todayCost > 0 ? ` · ${fmt(todayCost)} today` : '';
  return `$(copilot) ~est${sessionStr}${todayStr}`;
}

function buildOfflineSection(result: QuotaResult): string {
  const reason = result.failReason;
  const icon = reason === 'no-session' ? '$(account)' : '$(warning)';
  const lines = [
    `### Copilot+ — Estimated Mode\n`,
    `${icon} **${result.failMessage ?? 'Could not fetch live quota.'}**\n\n`
  ];

  if (reason === 'no-session') {
    lines.push(`→ Sign in via **VS Code → Accounts → Sign in with GitHub**\n\n`);
  } else if (reason === 'no-quota-field') {
    lines.push(`→ Your plan may not expose premium request counts via this endpoint.\n`);
    lines.push(`→ [Open Diagnostics Log](command:copilotPlus.diagnose) for full JWT details.\n\n`);
  } else {
    lines.push(`→ [Retry / Open Diagnostics](command:copilotPlus.diagnose)\n\n`);
  }

  return lines.join('');
}

function buildTooltip(result: QuotaResult, tracker: RequestTracker): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = false;

  const { quota } = result;
  if (quota) {
    const filled = Math.round(quota.percentUsed / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    md.appendMarkdown(`### Copilot+ Premium Requests\n\n`);
    md.appendMarkdown(`\`${bar}\` ${quota.percentUsed}% used\n\n`);
    md.appendMarkdown(`**Remaining:** ${quota.remaining} / ${quota.total}\n\n`);

    const burn = tracker.getBurnRate(quota.remaining);
    if (burn.daysLeft !== null) {
      md.appendMarkdown(`**Burn rate:** ~${burn.requestsPerDay} reqs/day → ~${burn.daysLeft} days left\n\n`);
    }
  } else {
    md.appendMarkdown(buildOfflineSection(result));
    const configTotal = vscode.workspace.getConfiguration('copilotPlus').get<number>('quotaTotal') ?? 300;
    const today = tracker.getTodayCost();
    md.appendMarkdown(`**Estimated remaining:** ~${configTotal - today} / ${configTotal}\n`);
    md.appendMarkdown(`_(Based on configured quota and locally tracked usage)_\n\n`);

    const burn = tracker.getBurnRate();
    if (burn.requestsPerDay > 0) {
      md.appendMarkdown(`**Local burn rate:** ~${burn.requestsPerDay} reqs/day\n\n`);
    }
  }

  const breakdown = tracker.getSessionBreakdown();
  if (breakdown.length > 0) {
    md.appendMarkdown(`**Session breakdown:**\n\n| Model | Calls | Cost |\n|---|---|---|\n`);
    for (const item of breakdown) {
      md.appendMarkdown(`| ${item.model} | ${item.count} | ${fmt(item.cost)} |\n`);
    }
    md.appendMarkdown('\n');
  }

  md.appendMarkdown(`---\n_Click to open sidebar · [Refresh](command:copilotPlus.refresh)_`);
  return md;
}

export class StatusBarProvider implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastResult: QuotaResult = { quota: null };

  constructor(private readonly tracker: RequestTracker) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'copilotPlus.openAgentExplorer';
    this.item.show();
  }

  async refresh(): Promise<void> {
    this.lastResult = await fetchQuota();
    const { quota } = this.lastResult;
    if (quota) {
      await checkThresholds(quota.remaining, quota.total);
    }
    this.render();
  }

  render(): void {
    this.item.text = buildLabel(this.lastResult, this.tracker);
    this.item.tooltip = buildTooltip(this.lastResult, this.tracker);

    const q: QuotaInfo | null = this.lastResult.quota;
    if (q && q.percentUsed >= 100) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (q && q.percentUsed >= 85) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }
  }

  startAutoRefresh(intervalMinutes: number): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(
      () => {
        invalidateCache();
        void this.refresh();
      },
      intervalMinutes * 60 * 1000
    );
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }

  showDiagnostics(): void {
    showLogs();
    invalidateCache();
    void this.refresh();
  }
}

