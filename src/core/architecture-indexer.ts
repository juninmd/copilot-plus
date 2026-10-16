import * as vscode from 'vscode';

export interface ModuleInfo {
  name: string;
  relativePath: string;
  fileCount: number;
  entrypoints: string[];
}

export interface ArchitectureSummary {
  workspaceName: string;
  techStack: string[];
  totalFiles: number;
  modules: ModuleInfo[];
  keyDependencies: string[];
  entrypoints: string[];
  markdownSummary: string;
}

export class ArchitectureIndexer {
  public async analyzeWorkspace(): Promise<ArchitectureSummary> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : 'Workspace';

    const files = await vscode.workspace.findFiles(
      '**/*.{ts,js,jsx,tsx,py,go,rs,java,kt,dart,c,cpp,cs}',
      '**/node_modules/**'
    );

    const relativePaths = files.map((f) => vscode.workspace.asRelativePath(f, false));

    const techStack = await this.detectTechStack();
    const keyDependencies = await this.detectDependencies();
    const entrypoints = this.detectEntrypoints(relativePaths);
    const modules = this.detectModules(relativePaths, entrypoints);

    const markdownSummary = this.generateMarkdownSummary(
      workspaceName,
      techStack,
      files.length,
      modules,
      keyDependencies,
      entrypoints
    );

    return {
      workspaceName,
      techStack,
      totalFiles: files.length,
      modules,
      keyDependencies,
      entrypoints,
      markdownSummary
    };
  }

  public detectEntrypoints(paths: string[]): string[] {
    const entryPatterns = [
      /index\.(ts|js|jsx|tsx)$/i,
      /main\.(ts|js|py|go|rs|java|kt|dart)$/i,
      /app\.(ts|js|py)$/i,
      /extension\.(ts|js)$/i,
      /server\.(ts|js|py)$/i,
      /manage\.py$/i
    ];

    return paths.filter((p) => entryPatterns.some((pattern) => pattern.test(p))).sort();
  }

  public detectModules(paths: string[], entrypoints: string[]): ModuleInfo[] {
    const moduleMap = new Map<string, { count: number; entries: string[] }>();

    for (const p of paths) {
      const parts = p.split('/');
      const topDir = parts.length > 1 ? parts[0] : 'root';

      if (!moduleMap.has(topDir)) {
        moduleMap.set(topDir, { count: 0, entries: [] });
      }

      const mod = moduleMap.get(topDir)!;
      mod.count += 1;

      if (entrypoints.includes(p)) {
        mod.entries.push(p);
      }
    }

    const modules: ModuleInfo[] = [];
    for (const [name, data] of moduleMap.entries()) {
      modules.push({
        name,
        relativePath: name === 'root' ? '.' : name,
        fileCount: data.count,
        entrypoints: data.entries
      });
    }

    return modules.sort((a, b) => b.fileCount - a.fileCount);
  }

  public async detectTechStack(): Promise<string[]> {
    const stack: string[] = [];

    const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    if (packageJsonFiles.length > 0) {
      stack.push('Node.js/JavaScript');
      try {
        const bytes = await vscode.workspace.fs.readFile(packageJsonFiles[0]);
        const content = new TextDecoder().decode(bytes);
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (allDeps.typescript) stack.push('TypeScript');
        if (allDeps.react || allDeps['react-dom']) stack.push('React');
        if (allDeps.vue) stack.push('Vue');
        if (allDeps['@nestjs/core']) stack.push('NestJS');
        if (allDeps.express) stack.push('Express');
        if (allDeps.vscode || allDeps['@types/vscode']) stack.push('VS Code Extension API');
      } catch {
        // ignore parse error
      }
    }

    const pyFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**');
    if (pyFiles.length > 0) stack.push('Python');

    const goFiles = await vscode.workspace.findFiles('**/go.mod', '**/node_modules/**');
    if (goFiles.length > 0) stack.push('Go');

    const rsFiles = await vscode.workspace.findFiles('**/Cargo.toml', '**/node_modules/**');
    if (rsFiles.length > 0) stack.push('Rust');

    return Array.from(new Set(stack));
  }

  public async detectDependencies(): Promise<string[]> {
    const deps: string[] = [];

    const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    if (packageJsonFiles.length > 0) {
      try {
        const bytes = await vscode.workspace.fs.readFile(packageJsonFiles[0]);
        const content = new TextDecoder().decode(bytes);
        const pkg = JSON.parse(content);

        if (pkg.dependencies) {
          deps.push(...Object.keys(pkg.dependencies));
        }
      } catch {
        // ignore parse error
      }
    }

    return deps.slice(0, 15);
  }

  public generateMarkdownSummary(
    workspaceName: string,
    techStack: string[],
    totalFiles: number,
    modules: ModuleInfo[],
    keyDependencies: string[],
    entrypoints: string[]
  ): string {
    const lines: string[] = [];

    lines.push(`### 🏗️ Workspace Architecture Index: ${workspaceName}`);
    lines.push(``);
    lines.push(`- **Tech Stack:** ${techStack.length > 0 ? techStack.join(', ') : 'Unknown'}`);
    lines.push(`- **Total Source Files:** ${totalFiles}`);
    lines.push(`- **Entrypoints Detected:** ${entrypoints.length}`);
    lines.push(``);

    if (entrypoints.length > 0) {
      lines.push(`#### 🚀 Entrypoints`);
      for (const entry of entrypoints) {
        lines.push(`- \`${entry}\``);
      }
      lines.push(``);
    }

    lines.push(`#### 📦 Modules Breakdown`);
    for (const mod of modules) {
      lines.push(`- **\`${mod.name}\`**: ${mod.fileCount} file(s)`);
    }
    lines.push(``);

    if (keyDependencies.length > 0) {
      lines.push(`#### 🔗 Core Dependencies`);
      lines.push(`\`${keyDependencies.join('`, `')}\``);
      lines.push(``);
    }

    return lines.join('\n');
  }
}
