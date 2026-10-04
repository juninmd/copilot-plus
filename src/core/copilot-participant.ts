import * as vscode from 'vscode';
import { QuotaService } from './quota-service';
import { RequestTracker } from './request-tracker';
import { recommendModel } from './model-advisor';
import { applyTurboSettings } from './turbo';
import { TurboSettingsApplier } from './turbo-settings-applier';
import { Logger } from './logger';

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

          // Default handler
          response.markdown('### 🤖 Copilot+ Assistant\n\n');
          response.markdown('I am your Copilot+ assistant! Here is how I can help you:\n\n');
          response.markdown('- `@copilotPlus /quota` — Check remaining monthly quota and session usage.\n');
          response.markdown('- `@copilotPlus /recommend [task]` — Get optimal model recommendations for your task.\n');
          response.markdown('- `@copilotPlus /turbo` — Enable cutting-edge Copilot workspace settings.\n');
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
