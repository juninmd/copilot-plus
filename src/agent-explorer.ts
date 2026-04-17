import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export type AgentScope = 'built-in' | 'user' | 'workspace' | 'local-dev';

const BUILTIN_EXTENSION_IDS = new Set([
  'github.copilot',
  'github.copilot-chat',
  'github.codespaces',
  'ms-vscode.vscode-github-issue-notebooks'
]);

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

function normalizeP(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/');
}

function detectScope(ext: vscode.Extension<unknown>): AgentScope {
  const extId = ext.id.toLowerCase();

  if (BUILTIN_EXTENSION_IDS.has(extId) || extId.startsWith('ms-vscode.') || extId.startsWith('vscode.')) {
    return 'built-in';
  }

  const extPath = normalizeP(ext.extensionUri.fsPath);
  const homedir = normalizeP(os.homedir());
  const userExtPath = normalizeP(path.join(os.homedir(), '.vscode', 'extensions'));

  if (extPath.startsWith(normalizeP(path.join(homedir, '.vscode-insiders', 'extensions')))) {
    return 'user';
  }
  if (extPath.startsWith(userExtPath)) {
    return 'user';
  }

  const folders = vscode.workspace.workspaceFolders;
  if (folders) {
    for (const folder of folders) {
      if (extPath.startsWith(normalizeP(folder.uri.fsPath))) {
        return 'workspace';
      }
    }
  }

  return 'local-dev';
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

function scopeIcon(scope: AgentScope): vscode.ThemeIcon {
  switch (scope) {
    case 'built-in':
      return new vscode.ThemeIcon('github', new vscode.ThemeColor('charts.blue'));
    case 'user':
      return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green'));
    case 'workspace':
      return new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.yellow'));
    case 'local-dev':
      return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.orange'));
  }
}

function scopeLabel(scope: AgentScope): string {
  switch (scope) {
    case 'built-in':
      return '[built-in]';
    case 'user':
      return '[user]';
    case 'workspace':
      return '[workspace]';
    case 'local-dev':
      return '[local-dev]';
  }
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
