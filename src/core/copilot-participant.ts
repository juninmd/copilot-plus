import * as vscode from 'vscode';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { recommendModel } from './model-advisor';
import { applyTurboSettings } from './turbo';
import { TurboSettingsApplier } from './turbo-settings-applier';
import { Logger } from './logger';
import { ContextAuditor } from './context-auditor';
import { PromptManager } from './prompt-manager';

export function registerCopilotParticipant(
  quotaService: QuotaService,
  tracker: RequestTracker,
  logger: Logger
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  try {
    if (typeof vscode.chat?.createChatParticipant === 'function') {
      const applier = new TurboSettingsApplier();

      const participant = vscode.chat.createChatParticipant(
        'copilotPlus.participant',
        async (
          request: vscode.ChatRequest,
          _context: vscode.ChatContext,
          response: vscode.ChatResponseStream
        ): Promise<void> => {
          if (request.command === 'quota') {
            response.progress('Fetching Copilot quota details...');
            const quotaResult = await quotaService.fetchQuota();
            const configTotal = vscode.workspace
              .getConfiguration('copilotPlus')
              .get<number>('quotaTotal', 300);

            const info = quotaResult.quota;
            const total = info?.total ?? configTotal;
            const remaining = info?.remaining ?? total;
            const percentLeft = info ? 100 - info.percentUsed : 100;

            response.markdown('### 📊 GitHub Copilot Quota Summary\n\n');
            response.markdown(`- **Status:** ${info ? 'Live API' : 'Fallback Local Tracking'}\n`);
            response.markdown(`- **Remaining Quota:** ${remaining}/${total} (${percentLeft}% remaining)\n`);
            response.markdown(`- **Session Spent:** ${tracker.getSessionCost().toFixed(2)} premium requests\n`);
            response.markdown(`- **Daily Spent:** ${tracker.getTodayCost().toFixed(2)} premium requests\n\n`);

            const breakdown = tracker.getSessionBreakdown();
            if (breakdown.length > 0) {
              response.markdown('#### Session Breakdown\n');
              for (const item of breakdown) {
                response.markdown(`- **${item.model}:** ${item.count} requests (${item.cost.toFixed(2)} cost)\n`);
              }
            }
            return;
          }

          if (request.command === 'recommend') {
            const task = request.prompt || 'general development task';
            const rec = recommendModel(task);

            response.markdown('### 💡 Model Recommendation\n\n');
            response.markdown(`- **Task:** ${task}\n`);
            response.markdown(`- **Recommended Model:** \`${rec.model}\`\n`);
            response.markdown(`- **Cost Multiplier:** \`${rec.multiplier}×\`\n`);
            response.markdown(`- **Reason:** ${rec.reason}\n`);
            return;
          }

          if (request.command === 'turbo') {
            response.progress('Applying experimental Copilot settings...');
            let updatedCount = 0;
            await applyTurboSettings(
              logger,
              vscode.workspace.getConfiguration(),
              applier,
              (msg) => {
                const match = msg.match(/\d+/);
                if (match) updatedCount = parseInt(match[0], 10);
              }
            );

            response.markdown('### ⚡ Turbo Mode\n\n');
            response.markdown(`Successfully enabled **${updatedCount}** experimental Copilot & VS Code features for maximum efficiency!\n`);
            return;
          }

          if (request.command === 'audit') {
            response.progress('Auditing Copilot workspace context & prompt instructions...');
            const auditor = new ContextAuditor();
            const audit = await auditor.auditWorkspace();

            response.markdown('### 🔍 Copilot Context Health Audit\n\n');
            response.markdown(`- **Context Health Score:** **${audit.score}/100** (${audit.rating})\n`);
            response.markdown(`- **Estimated Context Tokens:** ~${audit.estimatedTokens.total} tokens (Instructions: ~${audit.estimatedTokens.instructions}, Templates: ~${audit.estimatedTokens.promptTemplates}, Active File: ~${audit.estimatedTokens.activeFile})\n`);
            response.markdown(`- **Workspace Instructions:** ${audit.hasInstructions ? `\`${audit.instructionsPath}\`` : '❌ Missing'}\n`);
            response.markdown(`- **Prompt Templates:** ${audit.templateCount} custom template(s)\n`);
            response.markdown(`- **Detected Stack:** ${audit.detectedTechStack.length > 0 ? audit.detectedTechStack.join(', ') : 'None'}\n\n`);

            if (audit.findings.length > 0) {
              response.markdown('#### 📋 Findings & Recommendations\n');
              for (const f of audit.findings) {
                const icon = f.type === 'error' ? '❌' : f.type === 'warning' ? '⚠️' : 'ℹ️';
                response.markdown(`- ${icon} **${f.message}**\n`);
                if (f.suggestion) {
                  response.markdown(`  *Suggestion:* ${f.suggestion}\n`);
                }
              }
            }
            return;
          }

          if (request.command === 'optimize') {
            response.progress('Optimizing prompt for project tech stack...');
            const promptMgr = new PromptManager();
            const auditor = new ContextAuditor(promptMgr);
            const techStack = await promptMgr.detectWorkspaceTechnologies();
            const raw = request.prompt?.trim() || 'Implement clean, well-tested feature code.';
            const stackText = techStack.length > 0 ? techStack.join(', ') : 'Software Engineering';

            const optimizedText = [
              `### Role & Context`,
              `You are an expert developer specializing in ${stackText}.`,
              ``,
              `### Objective`,
              `${raw}`,
              ``,
              `### Quality & Architectural Standards`,
              `- Adhere to Clean Code, SOLID, DRY, KISS, and YAGNI principles.`,
              `- Ensure modular structure, strict typing, and comprehensive tests.`,
              `- Provide production-grade implementation with zero conversational filler.`
            ].join('\n');

            const tokenEst = auditor.estimateTokenCount(optimizedText);

            response.markdown('### ✨ Optimized Copilot Prompt\n\n');
            response.markdown(`- **Detected Stack:** ${stackText}\n`);
            response.markdown(`- **Estimated Tokens:** ~${tokenEst} tokens\n\n`);
            response.markdown('```markdown\n');
            response.markdown(`${optimizedText}\n`);
            response.markdown('```\n');
            return;
          }

          // Default handler
          response.markdown('### 🤖 Copilot+ Assistant\n\n');
          response.markdown('I am your Copilot+ assistant! Here is how I can help you:\n\n');
          response.markdown('- `@copilotPlus /quota` — Check remaining monthly quota and session usage.\n');
          response.markdown('- `@copilotPlus /recommend [task]` — Get optimal model recommendations for your task.\n');
          response.markdown('- `@copilotPlus /turbo` — Enable cutting-edge Copilot workspace settings.\n');
          response.markdown('- `@copilotPlus /audit` — Audit workspace prompt context, instructions, and token efficiency.\n');
          response.markdown('- `@copilotPlus /optimize [prompt]` — Optimize a raw prompt into a structured, stack-aware Copilot prompt.\n');
        }
      );

      participant.iconPath = new vscode.ThemeIcon('copilot');
      disposables.push(participant);
    }
  } catch {
    // vscode.chat.createChatParticipant may not be available in mock environments
  }

  return disposables;
}
