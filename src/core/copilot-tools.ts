import * as vscode from 'vscode';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { recommendModel } from './model-advisor';

export class GetQuotaTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly tracker: RequestTracker
  ) {}

  public async invoke(): Promise<vscode.LanguageModelToolResult> {
    const quotaResult = await this.quotaService.fetchQuota();
    const configTotal = vscode.workspace.getConfiguration('copilotPlus').get<number>('quotaTotal', 300);

    const quotaInfo = quotaResult.quota;
    const total = quotaInfo?.total ?? configTotal;
    const remaining = quotaInfo?.remaining ?? total;
    const percentLeft = quotaInfo ? 100 - quotaInfo.percentUsed : 100;

    const summary = {
      status: quotaInfo ? 'live' : 'fallback',
      totalQuota: total,
      remainingQuota: remaining,
      percentRemaining: percentLeft,
      sessionSpent: Number(this.tracker.getSessionCost().toFixed(2)),
      dailySpent: Number(this.tracker.getTodayCost().toFixed(2))
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(summary, null, 2))
    ]);
  }
}

export interface RecommendModelToolInput {
  taskDescription?: string;
}

export class RecommendModelTool implements vscode.LanguageModelTool<RecommendModelToolInput> {
  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RecommendModelToolInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const task = options.input?.taskDescription ?? 'general coding task';
    const rec = recommendModel(task);

    const summary = {
      task,
      recommendedModel: rec.model,
      multiplier: rec.multiplier,
      reasoning: rec.reason
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(summary, null, 2))
    ]);
  }
}

export function registerCopilotTools(
  quotaService: QuotaService,
  tracker: RequestTracker
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  try {
    if (typeof vscode.lm?.registerTool === 'function') {
      disposables.push(
        vscode.lm.registerTool('copilotPlus_getQuota', new GetQuotaTool(quotaService, tracker)),
        vscode.lm.registerTool('copilotPlus_recommendModel', new RecommendModelTool())
      );
    }
  } catch {
    // vscode.lm.registerTool may not be available in mock environments
  }

  return disposables;
}
