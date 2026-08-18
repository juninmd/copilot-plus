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
    let valueToSet = value;
    let shouldUpdate = false;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const currentObj = (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) ? currentValue as Record<string, unknown> : {};
      valueToSet = { ...currentObj, ...value as Record<string, unknown> };
      shouldUpdate = Object.entries(value as Record<string, unknown>).some(([k, v]) => currentObj[k] !== v);
    } else if (Array.isArray(value) && Array.isArray(currentValue)) {
      shouldUpdate = JSON.stringify(value) !== JSON.stringify(currentValue);
    } else {
      shouldUpdate = currentValue !== value;
    }

    if (shouldUpdate) {
      try {
        await config.update(key, valueToSet, vscode.ConfigurationTarget.Global);
        return true;
      } catch (e) {
        logger.log(`Failed to update setting ${key}: ${e}`);
      }
    }
    return false;
  }
}
