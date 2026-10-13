import * as vscode from 'vscode';
import * as path from 'path';

export interface ConvertedRuleSource {
  sourceName: string;
  relativePath: string;
  content: string;
}

export interface RuleConversionResult {
  convertedFiles: string[];
  totalRulesImported: number;
  targetUri: vscode.Uri;
  instructionsContent: string;
}

export class RuleSyncManager {
  private readonly ruleFilePatterns = [
    '.cursorrules',
    '.windsurfrules',
    '.clinerules',
    'AGENTS.md',
    '.cursor/rules/*.mdc'
  ];

  public async scanRuleSources(): Promise<ConvertedRuleSource[]> {
    const sources: ConvertedRuleSource[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return sources;
    }

    const globPattern = `{${this.ruleFilePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**');

    for (const fileUri of files) {
      try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const text = new TextDecoder().decode(fileData).trim();
        if (text) {
          const relativePath = vscode.workspace.asRelativePath(fileUri);
          const sourceName = path.basename(fileUri.fsPath);
          sources.push({
            sourceName,
            relativePath,
            content: text
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return sources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  public async convertWorkspaceRules(): Promise<RuleConversionResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open.');
    }

    const rootUri = workspaceFolders[0].uri;
    const targetUri = vscode.Uri.joinPath(rootUri, '.github', 'copilot-instructions.md');

    const ruleSources = await this.scanRuleSources();
    if (ruleSources.length === 0) {
      throw new Error('No external AI rule files (.cursorrules, .windsurfrules, .clinerules, AGENTS.md, etc.) found in workspace.');
    }

    let existingContent = '';
    try {
      const existingData = await vscode.workspace.fs.readFile(targetUri);
      existingContent = new TextDecoder().decode(existingData).trim();
    } catch {
      // File does not exist yet
    }

    const importedSections: string[] = [];
    const convertedFiles: string[] = [];

    for (const source of ruleSources) {
      convertedFiles.push(source.relativePath);
      // Clean frontmatter or title markers if needed
      const cleanedContent = this.cleanRuleContent(source.content);
      importedSections.push(
        `### Imported from \`${source.relativePath}\`\n\n${cleanedContent}`
      );
    }

    // Strip previous "## Synchronized External Rules" section if it exists to ensure idempotency
    let baseContent = existingContent;
    const syncHeaderIndex = baseContent.indexOf('## Synchronized External Rules');
    if (syncHeaderIndex !== -1) {
      baseContent = baseContent.substring(0, syncHeaderIndex).trim();
    }

    const header = baseContent
      ? baseContent
      : `# GitHub Copilot Workspace Instructions\n\n*Converted and synchronized from external AI rules.*`;

    const fullContent = [
      header,
      `\n## Synchronized External Rules\n`,
      importedSections.join('\n\n---\n\n')
    ].join('\n');

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(targetUri, encoder.encode(fullContent));

    return {
      convertedFiles,
      totalRulesImported: ruleSources.length,
      targetUri,
      instructionsContent: fullContent
    };
  }

  private cleanRuleContent(content: string): string {
    // Strip YAML frontmatter if present
    if (content.startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 3) {
        return parts.slice(2).join('---').trim();
      }
    }
    return content.trim();
  }
}
