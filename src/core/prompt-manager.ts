import * as vscode from 'vscode';
import * as path from 'path';

export interface PromptFile {
  name: string;
  relativePath: string;
  uri: vscode.Uri;
  type: 'instruction' | 'prompt-template';
  lineCount?: number;
}

export class PromptManager {
  public async getWorkspaceInstructions(): Promise<PromptFile | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const rootUri = workspaceFolders[0].uri;
    const instructionsPath = vscode.Uri.joinPath(rootUri, '.github', 'copilot-instructions.md');

    try {
      const stat = await vscode.workspace.fs.stat(instructionsPath);
      if (stat.type === vscode.FileType.File) {
        const doc = await vscode.workspace.openTextDocument(instructionsPath);
        return {
          name: 'copilot-instructions.md',
          relativePath: '.github/copilot-instructions.md',
          uri: instructionsPath,
          type: 'instruction',
          lineCount: doc.lineCount
        };
      }
    } catch {
      // File does not exist
    }

    return null;
  }

  public async getWorkspacePromptTemplates(): Promise<PromptFile[]> {
    const templates: PromptFile[] = [];
    const files = await vscode.workspace.findFiles('{ .github/prompts/*.prompt.md, .vscode/prompts/*.prompt.md }', '**/node_modules/**');

    for (const uri of files) {
      const relativePath = vscode.workspace.asRelativePath(uri);
      const name = path.basename(uri.fsPath);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        templates.push({
          name,
          relativePath,
          uri,
          type: 'prompt-template',
          lineCount: doc.lineCount
        });
      } catch {
        templates.push({
          name,
          relativePath,
          uri,
          type: 'prompt-template'
        });
      }
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async generateDefaultInstructions(): Promise<vscode.Uri | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No open workspace folder found.');
    }

    const rootUri = workspaceFolders[0].uri;
    const instructionsUri = vscode.Uri.joinPath(rootUri, '.github', 'copilot-instructions.md');

    const defaultContent = `# GitHub Copilot Workspace Instructions

## Project Context
This project follows strict software engineering standards to maintain high quality, reliability, and maintainability.

## Engineering Standards
- **Code Quality:** Strictly adhere to Clean Code, SOLID, DRY, KISS, and YAGNI principles.
- **TypeScript & Node.js:** Prefer strong typing, explicit return types, and async/await over raw promises.
- **Testing:** Write unit and integration tests using Vitest / Jest. Ensure high test coverage for core domain logic.
- **Refactoring:** Keep functions small, single-purpose, and free of side effects where possible.

## Interaction & Code Generation Rules
- Deliver clear, concise code solutions without unnecessary preamble or boilerplate explanations.
- Prioritize modularity and maintainability.
- Ensure all introduced imports and dependencies are correct and up to date.
`;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(instructionsUri, encoder.encode(defaultContent));
    return instructionsUri;
  }

  public async createSamplePromptTemplate(templateName: string = 'code-review'): Promise<vscode.Uri> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No open workspace folder found.');
    }

    const rootUri = workspaceFolders[0].uri;
    const sanitizedName = templateName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const templateUri = vscode.Uri.joinPath(rootUri, '.github', 'prompts', `${sanitizedName}.prompt.md`);

    const templateContent = `---
description: Custom prompt template for ${sanitizedName}
---

# ${sanitizedName.toUpperCase()} Prompt

Please perform a thorough check on the selected code:
1. Identify any potential performance bottlenecks or memory leaks.
2. Verify adherence to SOLID principles and Clean Code.
3. Suggest concrete improvements with code snippets.
`;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(templateUri, encoder.encode(templateContent));
    return templateUri;
  }
}
