import * as vscode from 'vscode';
import { Logger } from './logger';

export class TurboSettingsApplier {
  async applyAll(config: vscode.WorkspaceConfiguration, settings: ReadonlyArray<{ key: string, value: unknown }>, logger: Logger): Promise<number> {
    let updated = 0;
    for (const { key, value } of settings) {
      if (await this.applySettingIfChanged(config, key, value, logger)) {
        updated++;
      }
    }
    return updated;
  }

  private async applySettingIfChanged(config: vscode.WorkspaceConfiguration, key: string, value: unknown, logger: Logger): Promise<boolean> {
    const currentValue = config.inspect(key)?.globalValue;
    const { valueToSet, shouldUpdate } = this.evaluateUpdate(currentValue, value);

    if (!shouldUpdate) return false;

    try {
      await config.update(key, valueToSet, vscode.ConfigurationTarget.Global);
      return true;
    } catch (e) {
      logger.log(`Failed to update setting ${key}: ${e}`);
      return false;
    }
  }

  private evaluateUpdate(currentValue: unknown, newValue: unknown): { valueToSet: unknown; shouldUpdate: boolean } {
    if (this.isPlainObject(newValue)) {
      return this.evaluateObjectUpdate(currentValue, newValue as Record<string, unknown>);
    }

    if (Array.isArray(newValue) && Array.isArray(currentValue)) {
      return { valueToSet: newValue, shouldUpdate: JSON.stringify(newValue) !== JSON.stringify(currentValue) };
    }

    return { valueToSet: newValue, shouldUpdate: currentValue !== newValue };
  }

  private evaluateObjectUpdate(currentValue: unknown, newValue: Record<string, unknown>): { valueToSet: unknown; shouldUpdate: boolean } {
    const currentObj = this.isPlainObject(currentValue) ? currentValue as Record<string, unknown> : {};
    const valueToSet = { ...currentObj, ...newValue };
    const shouldUpdate = Object.entries(newValue).some(([k, v]) => currentObj[k] !== v);
    return { valueToSet, shouldUpdate };
  }

  private isPlainObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
