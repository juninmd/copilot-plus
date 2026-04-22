import * as vscode from 'vscode';
import { ExtensionScope, detectScope, scopeIcon, scopeLabel } from './scope-detector';

export type AgentScope = ExtensionScope;

export interface AgentEntry {
  participantId: string;
  name: string;
  fullName?: string;
  description?: string;
  extensionId: string;
  publisher: string;
  scope: AgentScope;
  extensionPath: string;
}

export function listAgents(): AgentEntry[] {
  const agents: AgentEntry[] = [];
  for (const ext of vscode.extensions.all) {
    const participants = (
      ext.packageJSON as { contributes?: { chatParticipants?: unknown[] } }
    )?.contributes?.chatParticipants;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      continue;
    }
    const scope = detectScope(ext);
    for (const p of participants as Array<Record<string, string>>) {
      agents.push({
        participantId: p['id'] ?? '',
        name: p['name'] ?? p['id'] ?? 'unknown',
        fullName: p['fullName'],
        description: p['description'],
        extensionId: ext.id,
        publisher: (ext.packageJSON as { publisher?: string }).publisher ?? 'unknown',
        scope,
        extensionPath: ext.extensionUri.fsPath
      });
    }
  }
  return agents.sort((a, b) => {
    const order: AgentScope[] = ['built-in', 'user', 'workspace', 'local-dev'];
    return order.indexOf(a.scope) - order.indexOf(b.scope);
  });
}

class AgentTreeItem extends vscode.TreeItem {
  constructor(agent: AgentEntry) {
    super(`@${agent.name} ${scopeLabel(agent.scope)}`, vscode.TreeItemCollapsibleState.None);
    this.description = agent.extensionId;
    this.tooltip = new vscode.MarkdownString(
      `**@${agent.name}** ${scopeLabel(agent.scope)}\n\n` +
        `${agent.description ? `> ${agent.description}\n\n` : ''}` +
        `- Extension: \`${agent.extensionId}\`\n` +
        `- Publisher: \`${agent.publisher}\`\n` +
        `- Path: \`${agent.extensionPath}\``
    );
    this.iconPath = scopeIcon(agent.scope);
    this.contextValue = `agent-${agent.scope}`;
  }
}

export class AgentExplorerProvider implements vscode.TreeDataProvider<AgentEntry> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AgentEntry | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentEntry): vscode.TreeItem {
    return new AgentTreeItem(element);
  }

  getChildren(): AgentEntry[] {
    return listAgents();
  }
}
