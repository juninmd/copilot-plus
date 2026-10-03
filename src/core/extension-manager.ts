import * as vscode from 'vscode';
import { RequestTracker } from './request-tracker';
import { StatusBarProvider } from '../ui/status-bar';
import { AgentExplorerProvider } from '../providers/agent-explorer';
import { ModelsExplorerProvider } from '../providers/models-explorer';
import { ToolsExplorerProvider } from '../providers/tools-explorer';
import { McpExplorerProvider } from '../providers/mcp-explorer';
import { PromptsExplorerProvider } from '../providers/prompts-explorer';
import { PromptManager } from './prompt-manager';
import { Logger } from './logger';
import { resetThresholdNotifications, recommendModelQuickPick } from './model-advisor';
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
  private readonly promptsExplorer: PromptsExplorerProvider;
  private readonly promptManager: PromptManager;
  private readonly quotaService: QuotaService;
  private readonly turboSettingsApplier: TurboSettingsApplier;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {
    this.quotaService = new QuotaService(logger);
    this.turboSettingsApplier = new TurboSettingsApplier();
    this.promptManager = new PromptManager();
    this.tracker = new RequestTracker(context.globalState);
    this.statusBar = new StatusBarProvider(this.tracker, this.logger, this.quotaService);

    this.agentExplorer = new AgentExplorerProvider();
    this.modelsExplorer = new ModelsExplorerProvider();
    this.toolsExplorer = new ToolsExplorerProvider();
    this.mcpExplorer = new McpExplorerProvider();
    this.promptsExplorer = new PromptsExplorerProvider(this.promptManager);

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
      }),
      vscode.window.createTreeView('copilotPlus.prompts', {
        treeDataProvider: this.promptsExplorer,
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
        this.promptsExplorer.refresh();
        await this.statusBar.refresh();
      }),
      vscode.commands.registerCommand('copilotPlus.openAgentExplorer', async () => {
        this.agentExplorer.refresh();
        this.modelsExplorer.refresh();
        this.toolsExplorer.refresh();
        this.mcpExplorer.refresh();
        this.promptsExplorer.refresh();
        await vscode.commands.executeCommand('copilotPlus.agents.focus');
        await this.statusBar.refresh();
      }),
      vscode.commands.registerCommand('copilotPlus.diagnose', () => {
        this.statusBar.showDiagnostics();
      }),
      vscode.commands.registerCommand('copilotPlus.showHistory', () => {
        showHistoryPanel(this.context, this.tracker);
      }),
      vscode.commands.registerCommand('copilotPlus.recommendModel', async () => {
        await recommendModelQuickPick();
      }),
      vscode.commands.registerCommand('copilotPlus.generateInstructions', async () => {
        try {
          const uri = await this.promptManager.generateDefaultInstructions();
          if (uri) {
            this.promptsExplorer.refresh();
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('Generated .github/copilot-instructions.md successfully!');
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to generate copilot instructions: ${String(err)}`);
        }
      }),
      vscode.commands.registerCommand('copilotPlus.createPromptTemplate', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter prompt template name (e.g. code-review, security-audit)',
          value: 'code-review'
        });
        if (!name) return;
        try {
          const uri = await this.promptManager.createSamplePromptTemplate(name);
          this.promptsExplorer.refresh();
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(`Created ${vscode.workspace.asRelativePath(uri)} successfully!`);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to create prompt template: ${String(err)}`);
        }
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
