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

  public async detectWorkspaceTechnologies(): Promise<string[]> {
    const technologies: string[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return technologies;
    }

    const rootUri = workspaceFolders[0].uri;

    const checkFileExists = async (fileName: string): Promise<boolean> => {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(rootUri, fileName));
        return true;
      } catch {
        return false;
      }
    };

    if (await checkFileExists('package.json')) {
      technologies.push('Node.js');
      try {
        const pkgUri = vscode.Uri.joinPath(rootUri, 'package.json');
        const content = await vscode.workspace.fs.readFile(pkgUri);
        const pkgJson = JSON.parse(new TextDecoder().decode(content));
        const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

        if (allDeps.typescript || await checkFileExists('tsconfig.json')) technologies.push('TypeScript');
        if (allDeps.react || allDeps['react-dom']) technologies.push('React');
        if (allDeps['@nestjs/core']) technologies.push('NestJS');
        if (allDeps.vue) technologies.push('Vue');
        if (allDeps['@angular/core']) technologies.push('Angular');
        if (allDeps.vitest) technologies.push('Vitest');
        if (allDeps.jest) technologies.push('Jest');
      } catch {
        // Fallback if parsing fails
      }
    }

    if (await checkFileExists('requirements.txt') || await checkFileExists('pyproject.toml')) {
      technologies.push('Python');
    }
    if (await checkFileExists('pubspec.yaml')) {
      technologies.push('Flutter');
    }
    if (await checkFileExists('Cargo.toml')) {
      technologies.push('Rust');
    }
    if (await checkFileExists('go.mod')) {
      technologies.push('Go');
    }

    return Array.from(new Set(technologies));
  }

  public async interpolateTemplate(rawTemplate: string): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    const selectedText = editor ? editor.document.getText(editor.selection) : '';
    const filePath = editor ? vscode.workspace.asRelativePath(editor.document.uri) : '';
    const fileName = editor ? path.basename(editor.document.uri.fsPath) : '';
    const languageId = editor ? editor.document.languageId : '';
    const workspaceName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : '';

    return rawTemplate
      .replace(/\$\{selectedText\}/g, selectedText)
      .replace(/\$\{filePath\}/g, filePath)
      .replace(/\$\{fileName\}/g, fileName)
      .replace(/\$\{languageId\}/g, languageId)
      .replace(/\$\{workspaceName\}/g, workspaceName);
  }

  public async generateDefaultInstructions(): Promise<vscode.Uri | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No open workspace folder found.');
    }

    const rootUri = workspaceFolders[0].uri;
    const instructionsUri = vscode.Uri.joinPath(rootUri, '.github', 'copilot-instructions.md');

    const techStack = await this.detectWorkspaceTechnologies();
    const techStackList = techStack.length > 0
      ? techStack.map((t) => `- **${t}**`).join('\n')
      : '- General Software Engineering';

    const defaultContent = `# GitHub Copilot Workspace Instructions

## Project Tech Stack
${techStackList}

## Engineering Standards
- **Code Quality:** Strictly adhere to Clean Code, SOLID, DRY, KISS, and YAGNI principles.
- **Architecture:** Keep modules decoupled, cohesive, and follow clean architectural boundaries.
- **Testing:** Write high-coverage unit and integration tests.
- **Refactoring:** Keep functions small, single-purpose, and free of side effects.

## Interaction Rules
- Deliver direct, production-ready code with zero fluff or conversational filler.
- Respect existing code formatting and project architectural decisions.
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
