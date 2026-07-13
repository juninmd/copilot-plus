import * as vscode from 'vscode';

export class ToolsExplorerProvider implements vscode.TreeDataProvider<vscode.LanguageModelToolInformation> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.LanguageModelToolInformation | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.LanguageModelToolInformation): vscode.TreeItem {
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.description = element.tags.join(', ');

    let tooltip = `**${element.name}**\n\n`;
    tooltip += `> ${element.description}\n\n`;
    if (element.tags && element.tags.length > 0) {
      tooltip += `- Tags: \`${element.tags.join('`, `')}\`\n`;
    }
    if (element.inputSchema) {
      tooltip += `\n**Input Schema:**\n\`\`\`json\n${JSON.stringify(element.inputSchema, null, 2)}\n\`\`\``;
    }

    item.tooltip = new vscode.MarkdownString(tooltip);
    item.iconPath = new vscode.ThemeIcon('symbol-method');
    item.contextValue = 'tool-item';

    return item;
  }

  getChildren(element?: vscode.LanguageModelToolInformation): vscode.ProviderResult<vscode.LanguageModelToolInformation[]> {
    if (element) {
      return [];
    }

    // Using vscode.lm.tools to get the available tools
    const tools = [...vscode.lm.tools];
    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }
}
