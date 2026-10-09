import * as vscode from 'vscode';
import { PromptManager } from './prompt-manager';

export interface AuditFinding {
  type: 'info' | 'warning' | 'error';
  category: 'instructions' | 'prompts' | 'active_file' | 'stack';
  message: string;
  suggestion?: string;
}

export interface ContextAuditResult {
  score: number;
  rating: 'Optimal' | 'Good' | 'Needs Improvement' | 'Poor';
  estimatedTokens: {
    instructions: number;
    promptTemplates: number;
    activeFile: number;
    total: number;
  };
  hasInstructions: boolean;
  instructionsPath?: string;
  templateCount: number;
  detectedTechStack: string[];
  findings: AuditFinding[];
}

export class ContextAuditor {
  constructor(private readonly promptManager: PromptManager = new PromptManager()) {}

  public estimateTokenCount(text: string): number {
    if (!text || text.trim().length === 0) return 0;
    return Math.ceil(text.trim().length / 4);
  }

  public async auditWorkspace(): Promise<ContextAuditResult> {
    const findings: AuditFinding[] = [];
    let score = 100;

    const instructionsFile = await this.promptManager.getWorkspaceInstructions();
    let instructionsTokens = 0;
    let instructionsContent = '';

    if (!instructionsFile) {
      score -= 30;
      findings.push({
        type: 'warning',
        category: 'instructions',
        message: 'No `.github/copilot-instructions.md` found in workspace root.',
        suggestion: 'Run "Copilot+: Generate Workspace Copilot Instructions" to create project-specific rules.'
      });
    } else {
      try {
        const doc = await vscode.workspace.openTextDocument(instructionsFile.uri);
        instructionsContent = doc.getText();
        instructionsTokens = this.estimateTokenCount(instructionsContent);

        if (instructionsTokens > 1500) {
          score -= 15;
          findings.push({
            type: 'warning',
            category: 'instructions',
            message: `Workspace instructions are large (~${instructionsTokens} tokens).`,
            suggestion: 'Consider trimming verbose descriptions to avoid consuming Copilot chat context window.'
          });
        } else if (instructionsTokens < 20) {
          score -= 10;
          findings.push({
            type: 'warning',
            category: 'instructions',
            message: 'Workspace instructions are too brief (< 20 tokens).',
            suggestion: 'Add clear coding standards, testing instructions, and framework rules.'
          });
        }

        if (!instructionsContent.toLowerCase().includes('standard') && !instructionsContent.toLowerCase().includes('rule')) {
          findings.push({
            type: 'info',
            category: 'instructions',
            message: 'Instructions lack clear coding or architectural standards sections.'
          });
        }
      } catch {
        score -= 20;
        findings.push({
          type: 'error',
          category: 'instructions',
          message: 'Unable to read `.github/copilot-instructions.md`.'
        });
      }
    }

    const templates = await this.promptManager.getWorkspacePromptTemplates();
    let templateTokens = 0;

    if (templates.length === 0) {
      score -= 15;
      findings.push({
        type: 'info',
        category: 'prompts',
        message: 'No custom prompt templates found in `.github/prompts/` or `.vscode/prompts/`.',
        suggestion: 'Run "Copilot+: Create Custom Prompt Template" to define reusable prompt templates.'
      });
    } else {
      for (const t of templates) {
        try {
          const doc = await vscode.workspace.openTextDocument(t.uri);
          templateTokens += this.estimateTokenCount(doc.getText());
        } catch {
          // ignore open errors
        }
      }
    }

    const techStack = await this.promptManager.detectWorkspaceTechnologies();
    if (techStack.length === 0) {
      findings.push({
        type: 'info',
        category: 'stack',
        message: 'No dominant language or framework configuration detected.'
      });
    } else if (instructionsFile && instructionsContent) {
      const missingTech = techStack.filter(
        (tech) => !instructionsContent.toLowerCase().includes(tech.toLowerCase())
      );
      if (missingTech.length > 0) {
        score -= 10;
        findings.push({
          type: 'warning',
          category: 'stack',
          message: `Detected technologies [${missingTech.join(', ')}] are not mentioned in copilot-instructions.md.`,
          suggestion: 'Update instructions to explicitly state coding guidelines for these technologies.'
        });
      }
    }

    let activeFileTokens = 0;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const doc = editor.document;
      activeFileTokens = this.estimateTokenCount(doc.getText());
      if (activeFileTokens > 3000) {
        findings.push({
          type: 'info',
          category: 'active_file',
          message: `Active file \`${vscode.workspace.asRelativePath(doc.uri)}\` is large (~${activeFileTokens} tokens).`,
          suggestion: 'When asking questions, consider selecting specific code blocks rather than referencing the whole file.'
        });
      }

      if (instructionsFile && instructionsContent) {
        const lang = doc.languageId;
        const knownLanguages = ['typescript', 'javascript', 'python', 'go', 'rust', 'dart', 'html', 'css'];
        if (knownLanguages.includes(lang) && !instructionsContent.toLowerCase().includes(lang)) {
          findings.push({
            type: 'warning',
            category: 'active_file',
            message: `Active file language \`${lang}\` has no explicit mention in copilot-instructions.md.`,
            suggestion: `Add explicit code style and testing directives for \`${lang}\` in workspace instructions.`
          });
        }
      }
    }

    score = Math.max(0, Math.min(100, score));

    let rating: ContextAuditResult['rating'] = 'Optimal';
    if (score < 50) rating = 'Poor';
    else if (score < 75) rating = 'Needs Improvement';
    else if (score < 90) rating = 'Good';

    return {
      score,
      rating,
      estimatedTokens: {
        instructions: instructionsTokens,
        promptTemplates: templateTokens,
        activeFile: activeFileTokens,
        total: instructionsTokens + templateTokens + activeFileTokens
      },
      hasInstructions: Boolean(instructionsFile),
      instructionsPath: instructionsFile?.relativePath,
      templateCount: templates.length,
      detectedTechStack: techStack,
      findings
    };
  }
}
