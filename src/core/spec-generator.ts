import * as vscode from 'vscode';
import { PromptManager } from './prompt-manager';

export interface SpecStep {
  stepNumber: number;
  title: string;
  description: string;
  filesToModifyOrCreate: string[];
  verificationCriteria: string;
}

export interface FeatureSpec {
  featureName: string;
  summary: string;
  architectureImpact: string;
  techStack: string[];
  steps: SpecStep[];
  markdownSpec: string;
}

export class SpecGenerator {
  private readonly promptManager: PromptManager;

  constructor(promptManager?: PromptManager) {
    this.promptManager = promptManager ?? new PromptManager();
  }

  public async generateSpec(featureDescription: string): Promise<FeatureSpec> {
    const name = featureDescription.split('\n')[0].substring(0, 50).trim() || 'New Feature Spec';
    const techStack = await this.promptManager.detectWorkspaceTechnologies();
    const stackText = techStack.length > 0 ? techStack.join(', ') : 'TypeScript / VS Code Extension';

    const steps: SpecStep[] = [
      {
        stepNumber: 1,
        title: 'Core Domain & Service Logic',
        description: `Implement fundamental core services and business logic for ${name}.`,
        filesToModifyOrCreate: ['src/core/feature-service.ts'],
        verificationCriteria: 'Compile without TypeScript errors and pass unit tests.'
      },
      {
        stepNumber: 2,
        title: 'Unit Test Coverage',
        description: 'Add isolated unit test cases covering edge cases and error handling.',
        filesToModifyOrCreate: ['src/core/feature-service.test.ts'],
        verificationCriteria: 'Run vitest and achieve high assertion coverage.'
      },
      {
        stepNumber: 3,
        title: 'UI & Chat Integration',
        description: 'Expose functionality via VS Code commands, Language Model Tools, and Chat Participant subcommands.',
        filesToModifyOrCreate: ['src/core/copilot-tools.ts', 'src/core/copilot-participant.ts', 'package.json'],
        verificationCriteria: 'Verify command palette registration and Chat participant response stream.'
      }
    ];

    const markdownSpec = this.formatMarkdownSpec(name, featureDescription, stackText, steps);

    return {
      featureName: name,
      summary: featureDescription,
      architectureImpact: 'Modular service addition adhering to Clean Code and Dependency Injection standards.',
      techStack,
      steps,
      markdownSpec
    };
  }

  private formatMarkdownSpec(
    name: string,
    description: string,
    stack: string,
    steps: SpecStep[]
  ): string {
    const lines = [
      `# 📋 Spec-Driven Feature Plan: ${name}`,
      ``,
      `## 🎯 Objective`,
      `${description}`,
      ``,
      `## 🛠️ Stack & Architecture Constraints`,
      `- **Tech Stack:** ${stack}`,
      `- **Architecture:** Clean Architecture, SOLID, DRY, KISS, YAGNI`,
      ``,
      `## 📌 Execution Steps`,
      ...steps.map(s =>
        `### Step ${s.stepNumber}: ${s.title}\n` +
        `- **Description:** ${s.description}\n` +
        `- **Target Files:** ${s.filesToModifyOrCreate.map(f => `\`${f}\``).join(', ')}\n` +
        `- **Verification:** ${s.verificationCriteria}\n`
      ),
      `## 🚀 Next Action`,
      `Execute each step systematically using Copilot Chat or Copilot+ tools.`
    ];

    return lines.join('\n');
  }
}
