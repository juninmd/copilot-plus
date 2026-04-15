import * as vscode from 'vscode';
import { RequestTracker } from './request-tracker';
import { StatusBarProvider } from './status-bar';
import { AgentExplorerProvider } from './agent-explorer';

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new RequestTracker(context.globalState);
  const statusBar = new StatusBarProvider(tracker);
  const agentExplorer = new AgentExplorerProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('copilotPlus.agents', {
    treeDataProvider: agentExplorer,
    showCollapseAll: false
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotPlus.refresh', async () => {
      agentExplorer.refresh();
      await statusBar.refresh();
    }),

    vscode.commands.registerCommand('copilotPlus.openAgentExplorer', async () => {
      agentExplorer.refresh();
      await vscode.commands.executeCommand('copilotPlus.agents.focus');
      await statusBar.refresh();
    })
  );

  // Track LM usage for session cost + log available models on startup
  vscode.lm.selectChatModels({ vendor: 'copilot' }).then((models) => {
    tracker.logAvailableModels(models);
  }, () => { /* Copilot not available */ });

  // Intercept LM requestss via onDidChangeChatModels to stay fresh
  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      vscode.lm.selectChatModels({ vendor: 'copilot' }).then((models) => {
        tracker.logAvailableModels(models);
      }, () => { /* ignore */ });
    })
  );

  // Read config
  const config = vscode.workspace.getConfiguration('copilotPlus');
  const intervalMinutes: number = config.get('refreshIntervalMinutes', 15);
  statusBar.startAutoRefresh(intervalMinutes);

  // Initial render + fetch (async, non-blocking)
  statusBar.render();
  void statusBar.refresh();

  context.subscriptions.push(statusBar, treeView);

  console.log('[copilot-plus] activated');
}

export function deactivate(): void {
  console.log('[copilot-plus] deactivated');
}
