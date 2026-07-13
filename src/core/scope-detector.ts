import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export type ExtensionScope = 'built-in' | 'user' | 'workspace' | 'local-dev';

const BUILTIN_EXTENSION_IDS = new Set([
  'github.copilot',
  'github.copilot-chat',
  'github.codespaces',
  'ms-vscode.vscode-github-issue-notebooks'
]);

function normalizeP(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/');
}

export function detectScope(ext: vscode.Extension<unknown>): ExtensionScope {
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

export function scopeIcon(scope: ExtensionScope): vscode.ThemeIcon {
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

export function scopeLabel(scope: ExtensionScope): string {
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
