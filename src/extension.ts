import * as vscode from 'vscode';
import { ExtensionManager } from './core/extension-manager';
import { Logger } from './core/logger';

let extensionManager: ExtensionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  extensionManager = new ExtensionManager(context, logger);
  context.subscriptions.push(logger, extensionManager);
  extensionManager.activate();
}

export function deactivate(): void {
  if (extensionManager) {
    extensionManager.dispose();
  }
}
