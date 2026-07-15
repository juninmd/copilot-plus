import * as vscode from 'vscode';
import { ExtensionManager } from './core/extension-manager';

let extensionManager: ExtensionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  extensionManager = new ExtensionManager(context);
  context.subscriptions.push(extensionManager);
  extensionManager.activate();
}

export function deactivate(): void {
  if (extensionManager) {
    extensionManager.dispose();
  }
}
