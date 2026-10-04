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
    const models = await vscode.lm.selectChatModels();
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

export interface ModelQuickPickItem extends vscode.QuickPickItem {
  modelName: string;
  multiplier: number;
}

export async function recommendModelQuickPick(): Promise<void> {
  let models: vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels();
  } catch {
    vscode.window.showWarningMessage('Copilot Language Models API is not available.');
    return;
  }

  if (models.length === 0) {
    vscode.window.showInformationMessage('No Copilot Chat models available in VS Code session.');
    return;
  }

  const items: ModelQuickPickItem[] = models.map((m) => {
    const multiplier = detectMultiplier(m.name);
    let recommendation = '';
    if (multiplier === 0) {
      recommendation = '$(star-full) Recommended for Everyday Coding & Refactoring (FREE - 0x)';
    } else if (multiplier < 1) {
      recommendation = '$(lightbulb) Best for Quick Edits & Fast Search (Lite - ' + multiplier + 'x)';
    } else if (multiplier === 1) {
      recommendation = '$(check) Standard Reasoning & Complex Coding (1x)';
    } else {
      recommendation = '$(flame) Heavy Architectural Design & Logic Proofs (Premium - ' + multiplier + 'x)';
    }

    return {
      label: `$(symbol-misc) ${m.name}`,
      description: `${multiplier}× cost multiplier`,
      detail: `${recommendation} | Context: ${Math.round(m.maxInputTokens / 1000)}K tokens | Family: ${m.family}`,
      modelName: m.name,
      multiplier
    };
  }).sort((a, b) => a.multiplier - b.multiplier);

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a model recommendation for your current task cost-efficiency:',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (selected) {
    vscode.window.showInformationMessage(
      `Selected ${selected.modelName} (${selected.multiplier}× request cost). Use this model in Copilot Chat for optimal quota consumption.`
    );
  }
}

export function recommendModel(taskDescription: string): { model: string; multiplier: number; reason: string } {
  const lower = taskDescription.toLowerCase();
  if (lower.includes('architecture') || lower.includes('complex') || lower.includes('proof') || lower.includes('hard')) {
    return { model: 'Claude 3.7 Sonnet / Claude Opus', multiplier: 1, reason: 'High reasoning capacity required for complex architecture.' };
  }
  if (lower.includes('quick') || lower.includes('edit') || lower.includes('small') || lower.includes('fast')) {
    return { model: 'GPT-4o mini / Claude Haiku', multiplier: 0.33, reason: 'Fast and cheap model ideal for quick edits and lightweight tasks.' };
  }
  return { model: 'GPT-4o / Claude Sonnet', multiplier: 0, reason: 'Included model with zero premium cost for everyday development.' };
}
