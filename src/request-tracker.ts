import * as vscode from 'vscode';

export interface ModelUsage {
  model: string;
  count: number;
  cost: number;
}

export interface AuditEntry {
  timestamp: number;
  model: string;
  cost: number;
}

export interface BurnRate {
  requestsPerDay: number;
  daysLeft: number | null;
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
  return 1; // unknown: conservative default
}

const TODAY_KEY = 'copilotPlus.todayCost';
const TODAY_DATE_KEY = 'copilotPlus.todayDate';

export class RequestTracker {
  private sessionCost = 0;
  private sessionUsage: Map<string, ModelUsage> = new Map();
  private readonly auditLog: AuditEntry[] = [];
  private readonly todayStartTs: number;

  constructor(private readonly state: vscode.ExtensionContext['globalState']) {
    this.resetDayIfNeeded();
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    this.todayStartTs = d.getTime();
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetDayIfNeeded(): void {
    const lastDate = this.state.get<string>(TODAY_DATE_KEY);
    if (lastDate !== this.today()) {
      void this.state.update(TODAY_KEY, 0);
      void this.state.update(TODAY_DATE_KEY, this.today());
    }
  }

  record(modelName: string): void {
    this.resetDayIfNeeded();
    const cost = detectMultiplier(modelName);
    this.sessionCost += cost;

    const existing = this.sessionUsage.get(modelName) ?? { model: modelName, count: 0, cost: 0 };
    existing.count += 1;
    existing.cost += cost;
    this.sessionUsage.set(modelName, existing);

    this.auditLog.unshift({ timestamp: Date.now(), model: modelName, cost });
    if (this.auditLog.length > 50) this.auditLog.pop();

    const todayCost = (this.state.get<number>(TODAY_KEY) ?? 0) + cost;
    void this.state.update(TODAY_KEY, todayCost);
  }

  getSessionCost(): number {
    return this.sessionCost;
  }

  getTodayCost(): number {
    this.resetDayIfNeeded();
    return this.state.get<number>(TODAY_KEY) ?? 0;
  }

  getSessionBreakdown(): ModelUsage[] {
    return [...this.sessionUsage.values()].sort((a, b) => b.cost - a.cost);
  }

  getAuditLog(limit = 20): AuditEntry[] {
    return this.auditLog.slice(0, limit);
  }

  getBurnRate(remainingQuota?: number): BurnRate {
    const hoursElapsed = (Date.now() - this.todayStartTs) / (1000 * 60 * 60);
    const todayCost = this.getTodayCost();
    if (hoursElapsed < 0.5 || todayCost === 0) {
      return { requestsPerDay: 0, daysLeft: null };
    }
    const requestsPerDay = Math.round((todayCost / hoursElapsed) * 24);
    const daysLeft = remainingQuota != null && requestsPerDay > 0
      ? Math.floor(remainingQuota / requestsPerDay)
      : null;
    return { requestsPerDay, daysLeft };
  }

  logAvailableModels(models: readonly vscode.LanguageModelChat[]): void {
    console.log('[copilot-plus] available models:');
    models.forEach((m) => {
      console.log(`  name="${m.name}" family="${m.family}" multiplier=${detectMultiplier(m.name)}x`);
    });
  }
}
