import * as vscode from 'vscode';

let ch: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!ch) {
    ch = vscode.window.createOutputChannel('Copilot+');
  }
  return ch;
}

export function log(msg: string): void {
  getOutputChannel().appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

export function showLogs(): void {
  getOutputChannel().show(true);
}

export function disposeLogger(): void {
  ch?.dispose();
  ch = undefined;
}
