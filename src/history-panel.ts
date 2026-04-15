import * as vscode from 'vscode';
import type { HistoryEntry, RequestTracker } from './request-tracker';

let activePanel: vscode.WebviewPanel | undefined;

export function showHistoryPanel(context: vscode.ExtensionContext, tracker: RequestTracker): void {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    activePanel.webview.html = buildHtml(tracker);
    return;
  }
  activePanel = vscode.window.createWebviewPanel(
    'copilotPlusHistory',
    'Copilot+ — Usage History',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  activePanel.webview.html = buildHtml(tracker);
  activePanel.onDidDispose(() => { activePanel = undefined; }, null, context.subscriptions);
}

function fmt(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(2);
}

function sparkline(history: HistoryEntry[]): string {
  if (!history.length) return '(no data yet)';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...history.map((h) => h.total), 1);
  return history.map((h) => {
    const idx = Math.min(Math.floor((h.total / max) * blocks.length), blocks.length - 1);
    return blocks[idx];
  }).join('');
}

function buildHistoryRows(history: HistoryEntry[]): string {
  if (!history.length) {
    return '<tr><td colspan="3" class="empty">No history yet. It builds as you use Copilot.</td></tr>';
  }
  return history
    .slice()
    .reverse()
    .map((h) => {
      const models = Object.entries(h.models)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([name, u]) => `${name} ×${u.count}`)
        .join(', ');
      const cls = h.total === 0 ? 'free' : h.total >= 10 ? 'high' : 'mid';
      return `<tr><td>${h.date}</td><td class="${cls}">${fmt(h.total)}</td><td class="dim">${models || '—'}</td></tr>`;
    })
    .join('');
}

function buildSessionRows(tracker: RequestTracker): string {
  const breakdown = tracker.getSessionBreakdown();
  if (!breakdown.length) {
    return '<p class="dim">No requests recorded in this session.</p>';
  }
  const rows = breakdown
    .map((u) => `<tr><td>${u.model}</td><td>${u.count}</td><td>${fmt(u.cost)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Model</th><th>Calls</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildHtml(tracker: RequestTracker): string {
  const history = tracker.getHistory();
  const spark = sparkline(history);
  const totalAll = history.reduce((s, h) => s + h.total, 0);
  const todayCost = tracker.getTodayCost();
  const sessionCost = tracker.getSessionCost();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 1.5rem; max-width: 800px; }
  h1 { font-size: 1.15rem; margin-bottom: 1rem; }
  h2 { font-size: 0.95rem; font-weight: 600; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.25rem; }
  .stats { display: flex; gap: 2rem; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
  .stat .val { font-size: 1.6rem; font-weight: bold; color: var(--vscode-charts-blue); }
  .stat .lbl { font-size: 0.78rem; color: var(--vscode-descriptionForeground); }
  .spark { font-family: monospace; font-size: 1.3rem; letter-spacing: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.25rem; }
  th { text-align: left; padding: 0.35rem 0.5rem; font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); }
  td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--vscode-panel-border); }
  tr:hover td { background: var(--vscode-list-hoverBackground); }
  .free { color: var(--vscode-charts-green); font-weight: bold; }
  .mid  { color: var(--vscode-charts-yellow); font-weight: bold; }
  .high { color: var(--vscode-charts-red); font-weight: bold; }
  .dim  { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .empty { text-align: center; color: var(--vscode-descriptionForeground); padding: 1rem 0; }
</style>
</head>
<body>
<h1>Copilot+ — Usage History</h1>
<div class="stats">
  <div class="stat"><div class="val">${fmt(totalAll)}</div><div class="lbl">30-day total</div></div>
  <div class="stat"><div class="val">${fmt(todayCost)}</div><div class="lbl">today</div></div>
  <div class="stat"><div class="val">${fmt(sessionCost)}</div><div class="lbl">this session</div></div>
  <div class="stat"><div class="val">${history.length}</div><div class="lbl">active days</div></div>
</div>
<h2>30-Day Trend</h2>
<div class="spark" title="Each block = one day of usage">${spark}</div>
<h2>Daily Breakdown</h2>
<table>
  <thead><tr><th>Date</th><th>Premium Cost</th><th>Models Used</th></tr></thead>
  <tbody>${buildHistoryRows(history)}</tbody>
</table>
<h2>Current Session</h2>
${buildSessionRows(tracker)}
</body>
</html>`;
}
