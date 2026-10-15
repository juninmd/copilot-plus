import * as vscode from 'vscode';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { recommendModel } from './model-advisor';
import { ContextAuditor } from './context-auditor';
import { PromptManager } from './prompt-manager';
import { DiffReviewer } from './diff-reviewer';
import { ContextCompressor } from './context-compressor';
import { RuleSyncManager } from './rule-sync-manager';
import { ArchitectureIndexer } from './architecture-indexer';
import { CodeHealthAdvisor } from './code-health-advisor';

export class GetArchitectureTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private readonly indexer: ArchitectureIndexer = new ArchitectureIndexer()) {}

  public async invoke(): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await this.indexer.analyzeWorkspace();
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))]);
    } catch (err) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ error: String(err) }, null, 2))]);
    }
  }
}

export class AnalyzeCodeHealthTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private readonly advisor: CodeHealthAdvisor = new CodeHealthAdvisor()) {}

  public async invoke(): Promise<vscode.LanguageModelToolResult> {
    try {
      const report = await this.advisor.analyzeActiveEditor();
      if (!report) {
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ error: 'No active editor found to analyze.' }))]);
      }
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(report, null, 2))]);
    } catch (err) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ error: String(err) }, null, 2))]);
    }
  }
}

export class ConvertRulesTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private readonly ruleSyncManager: RuleSyncManager = new RuleSyncManager()) {}

  public async invoke(): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await this.ruleSyncManager.convertWorkspaceRules();
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))]);
    } catch (err) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ error: String(err) }, null, 2))]);
    }
  }
}

export interface CompressContextToolInput {
  code?: string;
  signaturesOnly?: boolean;
}

export class CompressContextTool implements vscode.LanguageModelTool<CompressContextToolInput> {
  constructor(private readonly compressor: ContextCompressor = new ContextCompressor()) {}

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CompressContextToolInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const signaturesOnly = options.input?.signaturesOnly ?? false;
    let result;
    if (options.input?.code) {
      result = this.compressor.compressCode(options.input.code, { signaturesOnly });
    } else {
      result = await this.compressor.compressActiveEditor({ signaturesOnly });
    }
    if (!result) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ error: 'No active editor or code provided to compress.' }))]);
    }
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))]);
  }
}

export interface ReviewChangesToolInput {
  stagedOnly?: boolean;
}

export class ReviewChangesTool implements vscode.LanguageModelTool<ReviewChangesToolInput> {
  constructor(private readonly reviewer: DiffReviewer = new DiffReviewer()) {}

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReviewChangesToolInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const stagedOnly = options.input?.stagedOnly ?? false;
    const reviewResult = await this.reviewer.getWorkspaceDiff(undefined, stagedOnly);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(reviewResult, null, 2))]);
  }
}

export interface OptimizePromptToolInput {
  prompt?: string;
  taskType?: string;
}

export class OptimizePromptTool implements vscode.LanguageModelTool<OptimizePromptToolInput> {
  constructor(private readonly promptManager: PromptManager = new PromptManager()) {}

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<OptimizePromptToolInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const rawPrompt = options.input?.prompt ?? '';
    const taskType = options.input?.taskType ?? 'general';
    const techStack = await this.promptManager.detectWorkspaceTechnologies();
    const stackText = techStack.length > 0 ? techStack.join(', ') : 'Software Engineering';
    const structuredPrompt = [
      `### Role & Context`,
      `You are an expert developer specializing in ${stackText}.`,
      ``,
      `### Task (${taskType.toUpperCase()})`,
      `${rawPrompt}`,
      ``,
      `### Constraints & Standards`,
      `- Follow Clean Code, SOLID, DRY, KISS, and YAGNI principles.`,
      `- Maintain strict type safety, proper error handling, and high test coverage.`,
      `- Output direct, production-ready implementation without filler.`,
      ``,
      `### Expected Output`,
      `1. Brief overview of changes/approach.`,
      `2. Production-ready code implementation.`,
      `3. Corresponding unit/integration test cases.`
    ].join('\n');
    const auditor = new ContextAuditor(this.promptManager);
    const estimatedTokens = auditor.estimateTokenCount(structuredPrompt);
    const result = {
      originalPrompt: rawPrompt,
      taskType,
      detectedStack: techStack,
      estimatedTokens,
      optimizedPrompt: structuredPrompt
    };
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))]);
  }
}

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
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(summary, null, 2))]);
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
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(summary, null, 2))]);
  }
}

export class AuditContextTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private readonly auditor: ContextAuditor = new ContextAuditor()) {}

  public async invoke(): Promise<vscode.LanguageModelToolResult> {
    const audit = await this.auditor.auditWorkspace();
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(audit, null, 2))]);
  }
}

export function registerCopilotTools(
  quotaService: QuotaService,
  tracker: RequestTracker
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  try {
    if (typeof vscode.lm?.registerTool === 'function') {
      const auditor = new ContextAuditor();
      const promptManager = new PromptManager();
      const indexer = new ArchitectureIndexer();
      const advisor = new CodeHealthAdvisor();
      disposables.push(
        vscode.lm.registerTool('copilotPlus_getQuota', new GetQuotaTool(quotaService, tracker)),
        vscode.lm.registerTool('copilotPlus_recommendModel', new RecommendModelTool()),
        vscode.lm.registerTool('copilotPlus_auditContext', new AuditContextTool(auditor)),
        vscode.lm.registerTool('copilotPlus_optimizePrompt', new OptimizePromptTool(promptManager)),
        vscode.lm.registerTool('copilotPlus_reviewChanges', new ReviewChangesTool(new DiffReviewer())),
        vscode.lm.registerTool('copilotPlus_compressContext', new CompressContextTool(new ContextCompressor())),
        vscode.lm.registerTool('copilotPlus_convertRules', new ConvertRulesTool(new RuleSyncManager())),
        vscode.lm.registerTool('copilotPlus_indexArchitecture', new GetArchitectureTool(new ArchitectureIndexer())),
        vscode.lm.registerTool('copilotPlus_analyzeCodeHealth', new AnalyzeCodeHealthTool(advisor))
      );
    }
  } catch {
    // vscode.lm.registerTool may not be available in mock environments
  }
  return disposables;
}
