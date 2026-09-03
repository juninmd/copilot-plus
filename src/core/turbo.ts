import * as vscode from 'vscode';
import { Logger } from './logger';
import { TurboSettingsApplier } from './turbo-settings-applier';

export interface TurboSetting {
  readonly key: string;
  readonly value: unknown;
}

const SECURITY_SETTINGS: ReadonlyArray<TurboSetting> = [
  { key: 'chat.tools.terminal.autoApprove', value: false },
  { key: 'chat.tools.terminal.enableAutoApprove', value: false },
  { key: 'github.copilot.chat.claudeAgent.allowAutoPermissions', value: true },
  { key: 'github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions', value: false },
  { key: 'chat.agent.sandbox.enabled', value: 'allowNetwork' },
  { key: 'chat.tools.riskAssessment.enabled', value: true },
  { key: 'security.workspace.trust.startupPrompt', value: 'never' },
];

const VOICE_SETTINGS: ReadonlyArray<TurboSetting> = [
  { key: 'agents.voice.language', value: 'auto' },
  { key: 'dictation.enabled', value: true },
  { key: 'dictation.experimental.llmCleanup', value: true },
  { key: 'agents.voice.handsFree', value: false },
  { key: 'dictation.showTranscript', value: true },
];

const EDITOR_SETTINGS: ReadonlyArray<TurboSetting> = [
  { key: 'workbench.experimental.modernUI', value: true },
  { key: 'window.density.layout', value: 'compact' },
  { key: 'notebook.cellToolbarLocation', value: { default: 'right', jupyter: 'left' } },
  { key: 'workbench.browser.autoReloadOnFileChange', value: true },
  { key: 'breadcrumbs.showEditorType', value: true },
  { key: 'workbench.editor.markdownDefaultEditorInAgentsWindow', value: true },
  { key: 'terminal.integrated.accessibleViewPreserveCursorPosition', value: true },
  { key: 'sessions.layout.singlePaneDetailPanel', value: true },
  { key: 'workbench.experimental.modernUI', value: true },
  { key: 'sessions.list.showEmptyDefaultGroups', value: false },
  { key: 'workbench.browser.newTabPlacement', value: 'window' },
  { key: 'markdown.preview.frontMatter', value: 'table' },
  { key: 'editor.quickSuggestions', value: { other: 'on', comments: 'off', strings: 'off' } },
  { key: 'workbench.diffEditorAssociations', value: { '*.md': 'vscode.markdown.preview.editor' } },
  { key: 'chat.experimental.renderMarkdownImmediately', value: true },
  { key: 'terminal.integrated.tabs.allowAgentCliTitle', value: true },
  { key: 'terminal.integrated.resizeDimensionsOverlay.enabled', value: false },
  { key: 'sessions.layout.autoCollapseSessionsSidebar', value: true },
  { key: 'workbench.editorAssociations', value: { '*.html': 'workbench.editor.browser' } },
  { key: 'workbench.editor.showTabs', value: 'single' },
  { key: 'javascript.inlayHints.enumMemberValues.enabled', value: true },
  { key: 'typescript.inlayHints.enumMemberValues.enabled', value: true },
];

const CHAT_SETTINGS: ReadonlyArray<TurboSetting> = [
  { key: 'chat.agentHost.copilotAgent.multiRootEnabled', value: true },
  { key: 'chat.agentHost.claudeAgent.multiRootEnabled', value: true },
  { key: 'chat.notifyWindowOnConfirmation', value: true },
  { key: 'chat.notifyWindowOnResponseReceived', value: true },
  { key: 'chat.agentMerge.enabled', value: true },
  { key: 'chat.stickyScroll.enabled', value: true },
  { key: 'chat.agentHost.allowSignedOutWhenUsable', value: true },
  { key: 'chat.agentSessions.showExternal', value: 'recent' },
  { key: 'chat.agentHost.enabled', value: true },
  { key: 'chat.agents.claude.preferAgentHost', value: true },
  { key: 'chat.agentHost.byokModels.enabled', value: true },
  { key: 'chat.customizations.promptMigration.enabled', value: true },
  { key: 'chat.byokUtilityModelDefault', value: 'copilot' },
  { key: 'chat.utilityModel', value: 'gpt-4o' },
  { key: 'chat.utilitySmallModel', value: 'gpt-4o-mini' },
  { key: 'chat.tools.compressOutput.enabled', value: true },
  { key: 'chat.planWidget.inlineEditor.enabled', value: true },
  { key: 'extensions.supportAgentsWindow', value: { 'juninmd.copilot-plus': true } },
  { key: 'github.copilot.chat.otel.enabled', value: true },
  { key: 'github.copilot.chat.agent.modelDetails.enabled', value: true },
  { key: 'github.copilot.chat.agent.backgroundTodoAgent.enabled', value: true },
  { key: 'sessions.developerJoy.enabled', value: true },
  { key: 'github.copilot.chat.cli.autoModel.enabled', value: true },
  { key: 'github.copilot.chat.cli.remote.enabled', value: true },
  { key: 'github.copilot.chat.skillTool.enabled', value: true },
  { key: 'chat.experimental.symbolTools.cacheStable', value: true },
  { key: 'github.copilot.chat.anthropic.cacheBreakpoints.lastTwoMessages', value: true },
  { key: 'github.copilot.chat.responsesApi.toolSearchTool.enabled', value: true },
  { key: 'github.copilot.chat.localIndex.enabled', value: true },
  { key: 'accessibility.verbosity.chatQuestionCarousel', value: true },
  { key: 'git.addAICoAuthor', value: true },
  { key: 'chat.experimental.detectParticipant.enabled', value: true },
  { key: 'chat.experimental.serverlessWebEnabled', value: true },
  { key: 'chat.experimental.useSkillAdherencePrompt', value: true },
  { key: 'chat.tools.autoExpandFailures', value: true },
  { key: 'chat.tools.edits.autoApprove', value: true },
  { key: 'chat.tools.urls.autoApprove', value: true },
  { key: 'chat.experimental.incrementalRendering.enabled', value: true },
  { key: 'chat.experimental.incrementalRendering.animationStyle', value: 'reveal' },
  { key: 'chat.experimental.incrementalRendering.buffering', value: 'word' },
  { key: 'github.copilot.chat.agentDebugLog.fileLogging.enabled', value: true },
  { key: 'chat.tools.confirmationCarousel.enabled', value: true },
  { key: 'chat.tools.terminal.backgroundNotifications', value: true },
  { key: 'jsts-chat-features.skills.enabled', value: true },
  { key: 'chat.assistedPermissions.enabled', value: true },
  { key: 'workbench.browser.enableChatTools', value: true },
  { key: 'chat.verbose', value: true },
  { key: 'sessions.chatTimeline.display', value: 'ruler' },
  { key: 'chat.experimental.stickyScroll.enabled', value: true },
];

const ALL_SETTINGS: ReadonlyArray<TurboSetting> = [
  ...SECURITY_SETTINGS,
  ...VOICE_SETTINGS,
  ...EDITOR_SETTINGS,
  ...CHAT_SETTINGS,
];

export async function applyTurboSettings(
  logger: Logger,
  config: vscode.WorkspaceConfiguration,
  applier: TurboSettingsApplier,
  showMessage: (msg: string) => void
): Promise<void> {
  const updated = await applier.applyAll(config, ALL_SETTINGS, logger);

  if (updated > 0) {
    logger.log(`Turbo mode: Updated ${updated} settings to bleeding edge Copilot features.`);
    showMessage(`Copilot+ Turbo: Enabled ${updated} experimental features!`);
  }
}
