import * as vscode from 'vscode';
import { detectMultiplier } from './request-tracker';

const THRESHOLDS = [75, 90, 100] as const;
type Threshold = (typeof THRESHOLDS)[number];

// In-memory: reset per session (re-notify on next VS Code launch)
const notified = new Set<Threshold>();

export function resetThresholdNotifications(): void {
  notified.clear();
}

async function cheapestModel(): Promise<{ name: string; cost: number } | null> {
  try {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    const candidates = models
      .map((m) => ({ name: m.name, cost: detectMultiplier(m.name) }))
      .filter((m) => m.cost < 1)
      .sort((a, b) => a.cost - b.cost);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function notify(threshold: Threshold, remaining: number, total: number): Promise<void> {
  if (threshold === 100) {
    const pick = await vscode.window.showErrorMessage(
      `Copilot+ quota exhausted — ${total}/${total} premium requests used. Free models (GPT-4o, GPT-5 mini) still work.`,
      'See Free Models'
    );
    if (pick) await vscode.commands.executeCommand('copilotPlus.agents.focus');
    return;
  }

  const cheap = await cheapestModel();
  const tip = cheap
    ? ` Try **${cheap.name}** (${cheap.cost}×) to get ${Math.round(1 / cheap.cost)}× more messages.`
    : '';

  const pick = await vscode.window.showWarningMessage(
    `Copilot+ ${threshold}% used — only ${remaining} premium requests left.${tip}`,
    'See Models',
    'Dismiss'
  );
  if (pick === 'See Models') await vscode.commands.executeCommand('copilotPlus.agents.focus');
}

export async function checkThresholds(remaining: number, total: number): Promise<void> {
  const percentUsed = Math.round(((total - remaining) / total) * 100);
  for (const t of THRESHOLDS) {
    if (percentUsed >= t && !notified.has(t)) {
      notified.add(t);
      await notify(t, remaining, total);
    }
  }
}
