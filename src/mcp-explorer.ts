import * as vscode from 'vscode';
import { detectScope, scopeLabel, scopeIcon, ExtensionScope } from './scope-detector';

export interface McpProviderEntry {
  id: string;
  label: string;
  extensionId: string;
  publisher: string;
  scope: ExtensionScope;
  extensionPath: string;
}

export function listMcpProviders(): McpProviderEntry[] {
  const providers: McpProviderEntry[] = [];
  for (const ext of vscode.extensions.all) {
    const definedProviders = (
      ext.packageJSON as { contributes?: { mcpServerDefinitionProviders?: unknown[] } }
    )?.contributes?.mcpServerDefinitionProviders;

    if (!definedProviders || !Array.isArray(definedProviders) || definedProviders.length === 0) {
      continue;
    }
    const scope = detectScope(ext);
    for (const p of definedProviders as Array<Record<string, string>>) {
      providers.push({
        id: p['id'] ?? 'unknown',
        label: p['label'] ?? p['id'] ?? 'unknown',
        extensionId: ext.id,
        publisher: (ext.packageJSON as { publisher?: string }).publisher ?? 'unknown',
        scope,
        extensionPath: ext.extensionUri.fsPath
      });
    }
  }
  return providers.sort((a, b) => {
    const order: ExtensionScope[] = ['built-in', 'user', 'workspace', 'local-dev'];
    return order.indexOf(a.scope) - order.indexOf(b.scope);
  });
}

class McpTreeItem extends vscode.TreeItem {
  constructor(provider: McpProviderEntry) {
    super(`@${provider.label} ${scopeLabel(provider.scope)}`, vscode.TreeItemCollapsibleState.None);
    this.description = provider.extensionId;
    this.tooltip = new vscode.MarkdownString(
      `**@${provider.label}** ${scopeLabel(provider.scope)}\n\n` +
        `- ID: \`${provider.id}\`\n` +
        `- Extension: \`${provider.extensionId}\`\n` +
        `- Publisher: \`${provider.publisher}\`\n` +
        `- Path: \`${provider.extensionPath}\``
    );
    this.iconPath = scopeIcon(provider.scope);
    this.contextValue = `mcp-${provider.scope}`;
  }
}

export class McpExplorerProvider implements vscode.TreeDataProvider<McpProviderEntry> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<McpProviderEntry | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: McpProviderEntry): vscode.TreeItem {
    return new McpTreeItem(element);
  }

  getChildren(): McpProviderEntry[] {
    return listMcpProviders();
  }
}
