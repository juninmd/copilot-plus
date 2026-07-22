import * as vscode from 'vscode';
import { Logger } from './logger';
import { TurboSettingsApplier } from './turbo-settings-applier';

export async function applyTurboSettings(logger: Logger): Promise<void> {
  const settings: Array<{ key: string, value: unknown }> = [
    // Security & Safety Defaults
    { key: 'chat.tools.terminal.autoApprove', value: false },
    { key: 'chat.tools.terminal.enableAutoApprove', value: false },

    // 1.130 Updates (Insiders)
    { key: 'agents.voice.handsFree', value: false },

    // 1.129 Updates
    { key: 'chat.agentHost.enabled', value: true },
    { key: 'chat.agents.claude.preferAgentHost', value: true },
    { key: 'chat.agentHost.byokModels.enabled', value: true },
    { key: 'chat.customizations.promptMigration.enabled', value: true },
    { key: 'sessions.layout.singlePaneDetailPanel', value: true },
    { key: 'workbench.experimental.modernUI', value: true },

    // 1.128 Updates
    { key: 'chat.byokUtilityModelDefault', value: 'copilot' },
    { key: 'chat.utilityModel', value: 'gpt-4o' },
    { key: 'chat.utilitySmallModel', value: 'gpt-4o-mini' },
    { key: 'sessions.list.showEmptyDefaultGroups', value: false },
    { key: 'workbench.browser.newTabPlacement', value: 'window' },

    // 1.121 Updates
    { key: 'github.copilot.chat.claudeAgent.allowAutoPermissions', value: true },
    { key: 'github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions', value: false },
    { key: 'markdown.preview.frontMatter', value: 'table' },
    {
      key: 'editor.quickSuggestions',
      value: {
        other: 'on',
        comments: 'off',
        strings: 'off'
      }
    },

    // 1.120 Updates
    { key: 'chat.tools.compressOutput.enabled', value: true },
    { key: 'chat.tools.riskAssessment.enabled', value: true },
    { key: 'chat.planWidget.inlineEditor.enabled', value: true },
    { key: 'extensions.supportAgentsWindow', value: { 'juninmd.copilot-plus': true } },
    { key: 'workbench.diffEditorAssociations', value: { '*.md': 'vscode.markdown.preview.editor' } },

    // 1.119 Updates
    { key: 'github.copilot.chat.otel.enabled', value: true },
    { key: 'github.copilot.chat.agent.modelDetails.enabled', value: true },
    { key: 'github.copilot.chat.agent.backgroundTodoAgent.enabled', value: true },
    { key: 'chat.agent.sandbox.enabled', value: 'allowNetwork' },
    { key: 'sessions.developerJoy.enabled', value: true },

    // 1.118 Updates
    { key: 'github.copilot.chat.cli.autoModel.enabled', value: true },
    { key: 'github.copilot.chat.cli.remote.enabled', value: true },
    { key: 'github.copilot.chat.skillTool.enabled', value: true },
    { key: 'chat.experimental.symbolTools.cacheStable', value: true },
    { key: 'github.copilot.chat.anthropic.cacheBreakpoints.lastTwoMessages', value: true },
    { key: 'github.copilot.chat.responsesApi.toolSearchTool.enabled', value: true },
    { key: 'github.copilot.chat.localIndex.enabled', value: true },
    { key: 'accessibility.verbosity.chatQuestionCarousel', value: true },
    { key: 'git.addAICoAuthor', value: true },

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

  const applier = new TurboSettingsApplier();
  const updated = await applier.applyAll(settings, logger);

  if (updated > 0) {
    logger.log(`Turbo mode: Updated ${updated} settings to bleeding edge Copilot features.`);
    vscode.window.showInformationMessage(`Copilot+ Turbo: Enabled ${updated} experimental features!`);
  }
}
