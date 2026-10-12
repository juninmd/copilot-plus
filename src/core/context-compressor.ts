import * as vscode from 'vscode';

export interface CompressionOptions {
  preserveTypes?: boolean;
  removeComments?: boolean;
  signaturesOnly?: boolean;
}

export interface CompressionResult {
  originalText: string;
  compressedText: string;
  originalEstimatedTokens: number;
  compressedEstimatedTokens: number;
  savingsPercentage: number;
}

export class ContextCompressor {
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  public compressCode(code: string, options: CompressionOptions = {}): CompressionResult {
    const { preserveTypes = true, removeComments = true, signaturesOnly = false } = options;

    const origTokens = this.estimateTokens(code);
    let processed = code;

    if (removeComments) {
      // Remove single line comments (keeping URIs intact) and block comments
      processed = processed.replace(/\/\/(?!\/).*$/gm, '');
      processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    if (signaturesOnly) {
      processed = this.extractSignatures(processed, preserveTypes);
    } else {
      // Strip excess whitespace & empty lines
      processed = processed
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    }

    const compTokens = this.estimateTokens(processed);
    const savings = origTokens > 0 ? Math.round(((origTokens - compTokens) / origTokens) * 100) : 0;

    return {
      originalText: code,
      compressedText: processed,
      originalEstimatedTokens: origTokens,
      compressedEstimatedTokens: compTokens,
      savingsPercentage: Math.max(0, savings)
    };
  }

  private extractSignatures(code: string, preserveTypes: boolean): string {
    const lines = code.split('\n');
    const signatureLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (
        /^(export\s+)?(async\s+)?function\b/.test(trimmed) ||
        /^(export\s+)?(abstract\s+)?class\b/.test(trimmed) ||
        /^(export\s+)?interface\b/.test(trimmed) ||
        /^(export\s+)?type\b/.test(trimmed) ||
        /^(public|private|protected|readonly|static|async|\s)+\w+\s*\(/.test(trimmed)
      ) {
        let sig = trimmed;
        if (sig.endsWith('{')) {
          sig = sig.substring(0, sig.length - 1).trim() + ' { ... }';
        }
        if (!preserveTypes) {
          sig = sig.replace(/:\s*[\w<>[\]|, ]+/g, '');
        }
        signatureLines.push(sig);
      }
    }

    return signatureLines.length > 0
      ? signatureLines.join('\n')
      : code.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  }

  public async compressActiveEditor(options?: CompressionOptions): Promise<CompressionResult | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    const text = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
    return this.compressCode(text, options);
  }
}
