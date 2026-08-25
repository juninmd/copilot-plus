import * as vscode from 'vscode';
import { RequestTracker } from './request-tracker';
import { StatusBarProvider } from '../ui/status-bar';
import { AgentExplorerProvider } from '../providers/agent-explorer';
import { ModelsExplorerProvider } from '../providers/models-explorer';
import { ToolsExplorerProvider } from '../providers/tools-explorer';
import { McpExplorerProvider } from '../providers/mcp-explorer';
import { Logger } from './logger';
import { resetThresholdNotifications } from './model-advisor';
import { QuotaService } from './quota-service';
import { showHistoryPanel } from '../ui/history-panel';
import { applyTurboSettings } from './turbo';
import { TurboSettingsApplier } from './turbo-settings-applier';

export class ExtensionManager implements vscode.Disposable {
  private readonly tracker: RequestTracker;
  private readonly statusBar: StatusBarProvider;

  private readonly agentExplorer: AgentExplorerProvider;
  private readonly modelsExplorer: ModelsExplorerProvider;
  private readonly toolsExplorer: ToolsExplorerProvider;
  private readonly mcpExplorer: McpExplorerProvider;
  private readonly quotaService: QuotaService;
  private readonly turboSettingsApplier: TurboSettingsApplier;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {
    this.quotaService = new QuotaService(logger);
    this.turboSettingsApplier = new TurboSettingsApplier();
    this.tracker = new RequestTracker(context.globalState);
    this.statusBar = new StatusBarProvider(this.tracker, this.logger, this.quotaService);

    this.agentExplorer = new AgentExplorerProvider();
    this.modelsExplorer = new ModelsExplorerProvider();
    this.toolsExplorer = new ToolsExplorerProvider();
    this.mcpExplorer = new McpExplorerProvider();

    this.disposables.push(this.logger, this.statusBar);
  }

  public activate(): void {
    this.registerViews();
    this.registerCommands();
    this.registerModelListeners();
    this.initializeSettings();

    this.statusBar.render();
    void this.statusBar.refresh();

    this.logger.log('Copilot+ activated. Run "Copilot+: Diagnose" to inspect quota data.');
  }

  private registerViews(): void {
    this.disposables.push(
      vscode.window.createTreeView('copilotPlus.agents', {
        treeDataProvider: this.agentExplorer,
        showCollapseAll: false
      }),
      vscode.window.createTreeView('copilotPlus.models', {
        treeDataProvider: this.modelsExplorer,
        showCollapseAll: false
      }),
      vscode.window.createTreeView('copilotPlus.tools', {
        treeDataProvider: this.toolsExplorer,
        showCollapseAll: false
      }),
      vscode.window.createTreeView('copilotPlus.mcps', {
        treeDataProvider: this.mcpExplorer,
        showCollapseAll: false
      })
    );
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('copilotPlus.turbo', () => {
        applyTurboSettings(
          this.logger,
          vscode.workspace.getConfiguration(),
          this.turboSettingsApplier,
          (msg) => vscode.window.showInformationMessage(msg)
        );
      }),
      vscode.commands.registerCommand('copilotPlus.refresh', async () => {
        this.quotaService.invalidateCache();
        this.agentExplorer.refresh();
        this.modelsExplorer.refresh();
        this.toolsExplorer.refresh();
        this.mcpExplorer.refresh();
        await this.statusBar.refresh();
      }),
      vscode.commands.registerCommand('copilotPlus.openAgentExplorer', async () => {
        this.agentExplorer.refresh();
        this.modelsExplorer.refresh();
        this.toolsExplorer.refresh();
        this.mcpExplorer.refresh();
        await vscode.commands.executeCommand('copilotPlus.agents.focus');
        await this.statusBar.refresh();
      }),
      vscode.commands.registerCommand('copilotPlus.diagnose', () => {
        this.statusBar.showDiagnostics();
      }),
      vscode.commands.registerCommand('copilotPlus.showHistory', () => {
        showHistoryPanel(this.context, this.tracker);
      })
    );
  }

  private registerModelListeners(): void {
    vscode.lm.selectChatModels().then(
      (models) => this.tracker.logAvailableModels(models),
      () => this.logger.log('vscode.lm not available at startup')
    );

    this.disposables.push(
      vscode.lm.onDidChangeChatModels(() => {
        this.modelsExplorer.refresh();
        resetThresholdNotifications();
        vscode.lm.selectChatModels().then(
          (models) => this.tracker.logAvailableModels(models),
          () => { /* ignore */ }
        );
      })
    );
  }

  private initializeSettings(): void {
    const config = vscode.workspace.getConfiguration('copilotPlus');
    const intervalMinutes: number = config.get('refreshIntervalMinutes', 15);
    this.statusBar.startAutoRefresh(intervalMinutes);

    if (config.get('autoTurbo', false)) {
      applyTurboSettings(
        this.logger,
        vscode.workspace.getConfiguration(),
        this.turboSettingsApplier,
        (msg) => vscode.window.showInformationMessage(msg)
      );
    }
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
