import * as vscode from 'vscode';

export interface ModelUsage {
  model: string;
  count: number;
  cost: number;
}

// Premium request multipliers per model (April 2026)
// 0 = base model included in plan, no premium cost
const MULTIPLIERS: Array<{ match: string; cost: number }> = [
  { match: 'opus.*fast', cost: 30 },
  { match: 'claude-opus', cost: 3 },
  { match: 'claude.*opus', cost: 3 },
  { match: 'claude-haiku', cost: 0.33 },
  { match: 'claude.*haiku', cost: 0.33 },
  { match: 'claude-sonnet', cost: 1 },
  { match: 'claude.*sonnet', cost: 1 },
  { match: 'gemini.*flash', cost: 0.33 },
  { match: 'gemini.*pro', cost: 1 },
  { match: 'grok.*fast', cost: 0.25 },
  { match: 'grok', cost: 1 },
  { match: 'gpt-4o', cost: 0 },
  { match: 'gpt-4.1', cost: 0 },
  { match: 'gpt-5-mini', cost: 0 },
  { match: 'gpt-5.4-mini', cost: 0.33 },
  { match: 'raptor.*mini', cost: 0 },
  { match: 'gpt-5', cost: 1 }
];

export function detectMultiplier(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const entry of MULTIPLIERS) {
    if (new RegExp(entry.match).test(lower)) {
      return entry.cost;
    }
  }
  // Unknown model: default to 1 (conservative)
  return 1;
}

const TODAY_KEY = 'copilotPlus.todayCost';
const TODAY_DATE_KEY = 'copilotPlus.todayDate';
const SESSION_KEY = 'copilotPlus.sessionCost';

export class RequestTracker {
  private sessionCost = 0;
  private sessionUsage: Map<string, ModelUsage> = new Map();

  constructor(private readonly state: vscode.ExtensionContext['globalState']) {
    this.resetSessionIfNewDay();
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetSessionIfNewDay(): void {
    const lastDate = this.state.get<string>(TODAY_DATE_KEY);
    if (lastDate !== this.today()) {
      void this.state.update(TODAY_KEY, 0);
      void this.state.update(TODAY_DATE_KEY, this.today());
    }
  }

  record(modelName: string): void {
    this.resetSessionIfNewDay();
    const cost = detectMultiplier(modelName);
    this.sessionCost += cost;

    const existing = this.sessionUsage.get(modelName) ?? { model: modelName, count: 0, cost: 0 };
    existing.count += 1;
    existing.cost += cost;
    this.sessionUsage.set(modelName, existing);

    const todayCost = (this.state.get<number>(TODAY_KEY) ?? 0) + cost;
    void this.state.update(TODAY_KEY, todayCost);
    void this.state.update(SESSION_KEY, this.sessionCost);
  }

  getSessionCost(): number {
    return this.sessionCost;
  }

  getTodayCost(): number {
    this.resetSessionIfNewDay();
    return this.state.get<number>(TODAY_KEY) ?? 0;
  }

  getSessionBreakdown(): ModelUsage[] {
    return [...this.sessionUsage.values()].sort((a, b) => b.cost - a.cost);
  }

  logAvailableModels(models: readonly vscode.LanguageModelChat[]): void {
    console.log('[copilot-plus] available models:');
    models.forEach((m) => {
      const mult = detectMultiplier(m.name);
      console.log(`  name="${m.name}" family="${m.family}" id="${m.id}" multiplier=${mult}x`);
    });
  }
}
