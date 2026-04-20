import * as vscode from 'vscode';
import { detectMultiplier } from './request-tracker';

type CostTier = 'free' | 'lite' | 'standard' | 'premium';

const TIER_ORDER: CostTier[] = ['free', 'lite', 'standard', 'premium'];
const TIER_META: Record<CostTier, { label: string; icon: string; color: string }> = {
  free:     { label: 'Free (0×) — no premium cost',   icon: 'star-full',   color: 'charts.green' },
  lite:     { label: 'Lite (0.25–0.33×) — budget',    icon: 'lightbulb',   color: 'charts.blue' },
  standard: { label: 'Standard (1×) — default',       icon: 'check',       color: 'charts.yellow' },
  premium:  { label: 'Premium (3×+) — expensive',     icon: 'flame',       color: 'charts.red' }
};

function getTier(cost: number): CostTier {
  if (cost === 0) return 'free';
  if (cost < 1) return 'lite';
  if (cost === 1) return 'standard';
  return 'premium';
}

interface ModelGroup {
  kind: 'group';
  tier: CostTier;
  models: vscode.LanguageModelChat[];
}

interface ModelItem {
  kind: 'model';
  model: vscode.LanguageModelChat;
  cost: number;
}

type Node = ModelGroup | ModelItem;

function modelCostLabel(cost: number): string {
  if (cost === 0) return '0× — FREE';
  if (cost < 1) return `${cost}× (~${Math.round(1 / cost)} msgs/req)`;
  if (cost === 1) return '1× per message';
  return `${cost}× per message`;
}

class ModelTreeItem extends vscode.TreeItem {
  constructor(node: Node) {
    if (node.kind === 'group') {
      const meta = TIER_META[node.tier];
      const count = node.models.length;
      super(`${meta.label} — ${count} model${count !== 1 ? 's' : ''}`, vscode.TreeItemCollapsibleState.Expanded);
      this.iconPath = new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color));
      this.contextValue = 'model-group';
    } else {
      super(node.model.name, vscode.TreeItemCollapsibleState.None);
      this.description = modelCostLabel(node.cost);
      this.tooltip = new vscode.MarkdownString(
        `**${node.model.name}**\n\n` +
          `| Property | Value |\n|---|---|\n` +
          `| Premium cost | ${modelCostLabel(node.cost)} |\n` +
          `| Context window | ${Math.round(node.model.maxInputTokens / 1000)}K tokens |\n` +
          `| Family | \`${node.model.family}\` |\n` +
          `| Vendor | \`${node.model.vendor}\` |`
      );
      const tier = getTier(node.cost);
      const meta = TIER_META[tier];
      this.iconPath = new vscode.ThemeIcon(
        node.cost === 0 ? 'pass' : node.cost < 1 ? 'lightbulb' : node.cost === 1 ? 'dash' : 'warning',
        new vscode.ThemeColor(meta.color)
      );
      this.contextValue = 'model-item';
    }
  }
}

export class ModelsExplorerProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onChange = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onChange.event;

  refresh(): void {
    this._onChange.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return new ModelTreeItem(element);
  }

  getChildren(element?: Node): vscode.ProviderResult<Node[]> {
    if (!element) {
      return this.buildRoot();
    }
    if (element.kind === 'group') {
      return element.models.map((m) => ({ kind: 'model' as const, model: m, cost: detectMultiplier(m.name) }));
    }
    return [];
  }

  private async buildRoot(): Promise<Node[]> {
    let models: vscode.LanguageModelChat[] = [];
    try {
      models = await vscode.lm.selectChatModels();
    } catch {
      /* Copilot not available */
    }

    const byTier = new Map<CostTier, vscode.LanguageModelChat[]>();
    for (const model of models) {
      const tier = getTier(detectMultiplier(model.name));
      if (!byTier.has(tier)) byTier.set(tier, []);
      byTier.get(tier)!.push(model);
    }

    return TIER_ORDER
      .filter((t) => byTier.has(t))
      .map((t) => ({ kind: 'group' as const, tier: t, models: byTier.get(t)! }));
  }
}
