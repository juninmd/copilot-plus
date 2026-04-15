import * as vscode from 'vscode';
import { fetchQuota, invalidateCache, type QuotaInfo } from './quota-service';
import { type RequestTracker } from './request-tracker';

function fmt(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(2);
}

function buildLabel(quota: QuotaInfo | null, tracker: RequestTracker): string {
  const sessionCost = tracker.getSessionCost();
  const sessionStr = sessionCost > 0 ? ` · -${fmt(sessionCost)}` : '';

  if (quota) {
    return `$(copilot) ${quota.remaining}/${quota.total} (${100 - quota.percentUsed}% left)${sessionStr}`;
  }

  const todayCost = tracker.getTodayCost();
  return `$(copilot) Today: ${fmt(todayCost)}${sessionStr}`;
}

function buildTooltip(quota: QuotaInfo | null, tracker: RequestTracker): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  if (quota) {
    const bar = '█'.repeat(Math.round(quota.percentUsed / 10)) + '░'.repeat(10 - Math.round(quota.percentUsed / 10));
    md.appendMarkdown(`### Copilot+ Quota\n\n`);
    md.appendMarkdown(`\`${bar}\` ${quota.percentUsed}% used\n\n`);
    md.appendMarkdown(`**Remaining:** ${quota.remaining} / ${quota.total} requests\n\n`);
  } else {
    md.appendMarkdown(`### Copilot+ (offline mode)\n\n`);
    md.appendMarkdown(`_Could not fetch live quota. Showing local tracking._\n\n`);
  }

  const breakdown = tracker.getSessionBreakdown();
  if (breakdown.length > 0) {
    md.appendMarkdown(`**Session breakdown:**\n\n`);
    md.appendMarkdown(`| Model | Calls | Cost |\n|---|---|---|\n`);
    for (const item of breakdown) {
      md.appendMarkdown(`| ${item.model} | ${item.count} | ${fmt(item.cost)} |\n`);
    }
  }

  md.appendMarkdown(`\n---\n_Click to open Agent Explorer · [Refresh](command:copilotPlus.refresh)_`);
  return md;
}

export class StatusBarProvider implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastQuota: QuotaInfo | null = null;

  constructor(private readonly tracker: RequestTracker) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'copilotPlus.openAgentExplorer';
    this.item.show();
  }

  async refresh(): Promise<void> {
    this.lastQuota = await fetchQuota();
    this.render();
  }

  render(): void {
    const quota = this.lastQuota;
    this.item.text = buildLabel(quota, this.tracker);
    this.item.tooltip = buildTooltip(quota, this.tracker);

    if (quota) {
      if (quota.percentUsed >= 100) {
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (quota.percentUsed >= 85) {
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.item.backgroundColor = undefined;
      }
    } else {
      this.item.backgroundColor = undefined;
    }
  }

  startAutoRefresh(intervalMinutes: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(
      () => {
        invalidateCache();
        void this.refresh();
      },
      intervalMinutes * 60 * 1000
    );
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.item.dispose();
  }
}
