import * as vscode from 'vscode';

export interface ArchitectureSummary {
  projectName: string;
  detectedLanguages: string[];
  entryPoints: string[];
  keyDependencies: string[];
  directoryOverview: string[];
  markdownSummary: string;
  outputPath: string;
}

export class ArchitectureIndexer {
  private static readonly EXCLUDED_FOLDERS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'target',
    'coverage',
    '.vscode-test'
  ];

  public async scanWorkspace(): Promise<ArchitectureSummary> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return {
        projectName: 'Unknown Workspace',
        detectedLanguages: [],
        entryPoints: [],
        keyDependencies: [],
        directoryOverview: [],
        markdownSummary: 'No open workspace folder found.',
        outputPath: '.github/copilot-architecture.md'
      };
    }

    const rootUri = workspaceFolders[0].uri;
    const projectName = workspaceFolders[0].name;

    const entryPoints: string[] = [];
    const detectedLanguages = new Set<string>();
    const keyDependencies: string[] = [];
    const directoryOverview: string[] = [];

    try {
      // Scan root configuration files
      const manifestUri = vscode.Uri.joinPath(rootUri, 'package.json');
      try {
        const bytes = await vscode.workspace.fs.readFile(manifestUri);
        const pkgJson = JSON.parse(new TextDecoder().decode(bytes));
        detectedLanguages.add('TypeScript/JavaScript');

        const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        if (deps) {
          const topDeps = Object.keys(deps).slice(0, 15);
          keyDependencies.push(...topDeps);
        }
      } catch {
        // package.json does not exist
      }

      // Check Python
      try {
        const pyproject = vscode.Uri.joinPath(rootUri, 'pyproject.toml');
        await vscode.workspace.fs.stat(pyproject);
        detectedLanguages.add('Python');
      } catch {
        // ignore
      }

      // Check Go
      try {
        const goMod = vscode.Uri.joinPath(rootUri, 'go.mod');
        await vscode.workspace.fs.stat(goMod);
        detectedLanguages.add('Go');
      } catch {
        // ignore
      }

      // Check Rust
      try {
        const cargo = vscode.Uri.joinPath(rootUri, 'Cargo.toml');
        await vscode.workspace.fs.stat(cargo);
        detectedLanguages.add('Rust');
      } catch {
        // ignore
      }

      // Scan directory entries
      const entries = await vscode.workspace.fs.readDirectory(rootUri);

      for (const [name, type] of entries) {
        if (ArchitectureIndexer.EXCLUDED_FOLDERS.includes(name) || name.startsWith('.')) {
          continue;
        }

        if (type === vscode.FileType.Directory) {
          directoryOverview.push(`📁 \`${name}/\``);
          try {
            const subEntries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(rootUri, name));
            for (const [subName, subType] of subEntries.slice(0, 8)) {
              if (!ArchitectureIndexer.EXCLUDED_FOLDERS.includes(subName) && !subName.startsWith('.')) {
                const subIcon = subType === vscode.FileType.Directory ? '📁' : '📄';
                directoryOverview.push(`  └─ ${subIcon} \`${subName}\``);
              }
            }
          } catch {
            // ignore subfolder read error
          }
        } else {
          directoryOverview.push(`📄 \`${name}\``);
        }

        // Common Entry points check
        if (['src/extension.ts', 'src/index.ts', 'src/main.ts', 'app.py', 'main.py', 'main.go', 'src/main.rs'].includes(name)) {
          entryPoints.push(name);
        }
      }

      // Scan src directory for entry points if present
      try {
        const srcUri = vscode.Uri.joinPath(rootUri, 'src');
        const srcEntries = await vscode.workspace.fs.readDirectory(srcUri);
        for (const [srcName] of srcEntries) {
          if (['extension.ts', 'index.ts', 'main.ts', 'app.ts', 'index.js', 'main.js'].includes(srcName)) {
            entryPoints.push(`src/${srcName}`);
            detectedLanguages.add('TypeScript/JavaScript');
          }
        }
      } catch {
        // no src directory
      }

    } catch (err) {
      // General filesystem scan warning
    }

    const langList = Array.from(detectedLanguages);
    if (langList.length === 0) langList.push('Polyglot / Generic');

    const markdownSummary = this.buildMarkdown(
      projectName,
      langList,
      entryPoints,
      keyDependencies,
      directoryOverview
    );

    return {
      projectName,
      detectedLanguages: langList,
      entryPoints,
      keyDependencies,
      directoryOverview,
      markdownSummary,
      outputPath: '.github/copilot-architecture.md'
    };
  }

  public async generateAndSaveArchitectureFile(): Promise<vscode.Uri | undefined> {
    const summary = await this.scanWorkspace();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

    const targetUri = vscode.Uri.joinPath(workspaceFolders[0].uri, summary.outputPath);
    const content = new TextEncoder().encode(summary.markdownSummary);

    // Ensure .github folder exists
    const githubFolderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.github');
    try {
      await vscode.workspace.fs.createDirectory(githubFolderUri);
    } catch {
      // directory might exist
    }

    await vscode.workspace.fs.writeFile(targetUri, content);
    return targetUri;
  }

  private buildMarkdown(
    projectName: string,
    languages: string[],
    entryPoints: string[],
    dependencies: string[],
    directoryOverview: string[]
  ): string {
    return [
      `# 🏗️ Workspace Architecture Context: ${projectName}`,
      ``,
      `> Auto-generated by Copilot+ Architecture Indexer. This document provides high-level architecture context for AI models & Copilot Agents.`,
      ``,
      `## 🧰 Tech Stack & Languages`,
      languages.map((l) => `- **${l}**`).join('\n') || '- Generic',
      ``,
      `## 🚀 Key Entry Points`,
      entryPoints.length > 0
        ? entryPoints.map((e) => `- \`${e}\``).join('\n')
        : '- Auto-detected from directory structure during AI indexer scan.',
      ``,
      `## 📦 Primary Dependencies`,
      dependencies.length > 0
        ? dependencies.map((d) => `- \`${d}\``).join('\n')
        : '- No primary manifest dependencies registered.',
      ``,
      `## 📁 Directory Structure Summary`,
      directoryOverview.length > 0
        ? directoryOverview.join('\n')
        : '- Root directory contains project files.',
      ``,
      `---`,
      `*Updated by Copilot+ Extension*`
    ].join('\n');
  }
}
