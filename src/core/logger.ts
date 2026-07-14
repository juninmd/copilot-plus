import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private ch: vscode.OutputChannel;

  constructor() {
    this.ch = vscode.window.createOutputChannel('Copilot+');
  }

  log(msg: string): void {
    this.ch.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  showLogs(): void {
    this.ch.show(true);
  }

  dispose(): void {
    this.ch.dispose();
  }
}
