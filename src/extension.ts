import * as vscode from 'vscode';
import { RequestTracker } from './request-tracker';
import { StatusBarProvider } from './status-bar';
import { AgentExplorerProvider } from './agent-explorer';
import { ModelsExplorerProvider } from './models-explorer';
import { ToolsExplorerProvider } from './tools-explorer';
import { McpExplorerProvider } from './mcp-explorer';
import { disposeLogger, log } from './logger';
import { resetThresholdNotifications } from './model-advisor';
import { invalidateCache } from './quota-service';
import { showHistoryPanel } from './history-panel';
import { applyTurboSettings } from './turbo';

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new RequestTracker(context.globalState);
  const statusBar = new StatusBarProvider(tracker);
  const agentExplorer = new AgentExplorerProvider();
  const modelsExplorer = new ModelsExplorerProvider();
  const toolsExplorer = new ToolsExplorerProvider();
  const mcpExplorer = new McpExplorerProvider();

  const agentTree = vscode.window.createTreeView('copilotPlus.agents', {
    treeDataProvider: agentExplorer,
    showCollapseAll: false
  });

  const modelsTree = vscode.window.createTreeView('copilotPlus.models', {
    treeDataProvider: modelsExplorer,
    showCollapseAll: false
  });

  const toolsTree = vscode.window.createTreeView('copilotPlus.tools', {
    treeDataProvider: toolsExplorer,
    showCollapseAll: false
  });

  const mcpsTree = vscode.window.createTreeView('copilotPlus.mcps', {
    treeDataProvider: mcpExplorer,
    showCollapseAll: false
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotPlus.turbo', () => {
      applyTurboSettings();
    }),

    vscode.commands.registerCommand('copilotPlus.refresh', async () => {
      invalidateCache();
      agentExplorer.refresh();
      modelsExplorer.refresh();
      toolsExplorer.refresh();
      mcpExplorer.refresh();
      await statusBar.refresh();
    }),

    vscode.commands.registerCommand('copilotPlus.openAgentExplorer', async () => {
      agentExplorer.refresh();
      modelsExplorer.refresh();
      toolsExplorer.refresh();
      mcpExplorer.refresh();
      await vscode.commands.executeCommand('copilotPlus.agents.focus');
      await statusBar.refresh();
    }),

    vscode.commands.registerCommand('copilotPlus.diagnose', () => {
      statusBar.showDiagnostics();
    }),

    vscode.commands.registerCommand('copilotPlus.showHistory', () => {
      showHistoryPanel(context, tracker);
    })
  );

  // Log available models on startup for runtime family-string discovery
  vscode.lm.selectChatModels().then(
    (models) => tracker.logAvailableModels(models),
    () => log('vscode.lm not available at startup')
  );

  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      modelsExplorer.refresh();
      resetThresholdNotifications(); // reset per model-set change
      vscode.lm.selectChatModels().then(
        (models) => tracker.logAvailableModels(models),
        () => { /* ignore */ }
      );
    })
  );

  const config = vscode.workspace.getConfiguration('copilotPlus');
  const intervalMinutes: number = config.get('refreshIntervalMinutes', 15);
  statusBar.startAutoRefresh(intervalMinutes);

  if (config.get('autoTurbo', false)) {
    applyTurboSettings();
  }

  statusBar.render();
  void statusBar.refresh();

  context.subscriptions.push(statusBar, agentTree, modelsTree, toolsTree, mcpsTree);
  log('Copilot+ activated. Run "Copilot+: Diagnose" to inspect quota data.');
}

export function deactivate(): void {
  disposeLogger();
}

