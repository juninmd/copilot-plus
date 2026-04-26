import * as vscode from 'vscode';
import { log } from './logger';

export async function applyTurboSettings(): Promise<void> {
  const settings = [
    // 1.118 Updates
    { key: 'github.copilot.chat.cli.autoModel.enabled', value: true },

    // Extra Proactive 1.118+ Turbo settings
    { key: 'chat.experimental.detectParticipant.enabled', value: true },
    { key: 'chat.experimental.renderMarkdownImmediately', value: true },
    { key: 'chat.experimental.serverlessWebEnabled', value: true },
    { key: 'chat.experimental.useSkillAdherencePrompt', value: true },
    { key: 'chat.tools.autoExpandFailures', value: true },
    { key: 'chat.tools.edits.autoApprove', value: true },
    { key: 'chat.tools.urls.autoApprove', value: true },


    // 1.117 Updates
    { key: 'chat.experimental.incrementalRendering.enabled', value: true },
    { key: 'chat.experimental.incrementalRendering.animationStyle', value: 'reveal' },
    { key: 'chat.experimental.incrementalRendering.buffering', value: 'word' },
    { key: 'terminal.integrated.tabs.allowAgentCliTitle', value: true },

    // 1.116 Updates
    { key: 'github.copilot.chat.agentDebugLog.fileLogging.enabled', value: true },
    { key: 'chat.tools.confirmationCarousel.enabled', value: true },
    { key: 'chat.tools.terminal.backgroundNotifications', value: true },
    { key: 'jsts-chat-features.skills.enabled', value: true },
  ];

  const config = vscode.workspace.getConfiguration();
  let updated = 0;

  for (const { key, value } of settings) {
    const currentValue = config.inspect(key)?.globalValue;
    if (currentValue !== value) {
      try {
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        updated++;
      } catch (e) {
        log(`Failed to update setting ${key}: ${e}`);
      }
    }
  }

  if (updated > 0) {
    log(`Turbo mode: Updated ${updated} settings to bleeding edge Copilot features.`);
    vscode.window.showInformationMessage(`Copilot+ Turbo: Enabled ${updated} experimental features!`);
  }
}
