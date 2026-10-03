import * as vscode from 'vscode';
import { PromptFile, PromptManager } from '../core/prompt-manager';

export interface PromptGroupItem {
  kind: 'group';
  label: string;
  type: 'instructions-group' | 'templates-group';
}

export interface PromptTreeLeafItem {
  kind: 'item';
  prompt: PromptFile;
}

export interface PromptActionItem {
  kind: 'action';
  label: string;
  actionId: 'generate-instructions' | 'create-template';
}

export type PromptNode = PromptGroupItem | PromptTreeLeafItem | PromptActionItem;

export class PromptsExplorerProvider implements vscode.TreeDataProvider<PromptNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PromptNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly promptManager: PromptManager = new PromptManager()) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PromptNode): vscode.TreeItem {
    if (element.kind === 'group') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(
        element.type === 'instructions-group' ? 'book' : 'file-code'
      );
      item.contextValue = element.type;
      return item;
    }

    if (element.kind === 'action') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('add');
      item.command = {
        command: element.actionId === 'generate-instructions' ? 'copilotPlus.generateInstructions' : 'copilotPlus.createPromptTemplate',
        title: element.label
      };
      item.contextValue = 'prompt-action';
      return item;
    }

    const { prompt } = element;
    const item = new vscode.TreeItem(prompt.name, vscode.TreeItemCollapsibleState.None);
    item.description = prompt.lineCount !== undefined ? `${prompt.lineCount} lines` : prompt.relativePath;
    item.tooltip = new vscode.MarkdownString(
      `**${prompt.name}**\n\n` +
      `- Path: \`${prompt.relativePath}\`\n` +
      `- Type: \`${prompt.type}\``
    );
    item.iconPath = new vscode.ThemeIcon(
      prompt.type === 'instruction' ? 'verified' : 'symbol-keyword'
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [prompt.uri]
    };
    item.contextValue = 'prompt-item';
    return item;
  }

  async getChildren(element?: PromptNode): Promise<PromptNode[]> {
    if (!element) {
      return [
        { kind: 'group', label: 'Workspace Instructions', type: 'instructions-group' },
        { kind: 'group', label: 'Prompt Templates', type: 'templates-group' }
      ];
    }

    if (element.kind === 'group') {
      if (element.type === 'instructions-group') {
        const instruction = await this.promptManager.getWorkspaceInstructions();
        if (instruction) {
          return [{ kind: 'item', prompt: instruction }];
        }
        return [{ kind: 'action', label: 'Generate copilot-instructions.md', actionId: 'generate-instructions' }];
      }

      if (element.type === 'templates-group') {
        const templates = await this.promptManager.getWorkspacePromptTemplates();
        if (templates.length > 0) {
          return templates.map((p) => ({ kind: 'item', prompt: p }));
        }
        return [{ kind: 'action', label: 'Create Custom Prompt Template', actionId: 'create-template' }];
      }
    }

    return [];
  }
}
