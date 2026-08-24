import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { applyTurboSettings } from './turbo';
import { Logger } from './logger';
import { TurboSettingsApplier } from './turbo-settings-applier';

const mocks = vi.hoisted(() => ({
  updateMock: vi.fn().mockResolvedValue(undefined),
  inspectMock: vi.fn().mockReturnValue({ globalValue: undefined }),
}));

// Mock vscode module
vi.mock('vscode', () => {
  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        inspect: mocks.inspectMock,
        update: mocks.updateMock,
      })),
    },
    ConfigurationTarget: { Global: 1 },
    window: {
      showInformationMessage: vi.fn(),
    },
  };
});

describe('Turbo Settings and Applier', () => {
  const loggerMock = {
    log: vi.fn(),
    showLogs: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectMock.mockReturnValue({ globalValue: undefined });
  });

  describe('applyTurboSettings', () => {
    it('should log and show message if settings were updated', async () => {
      const config = vscode.workspace.getConfiguration();
      const showMessageMock = vi.fn();

      await applyTurboSettings(
        loggerMock,
        config,
        new TurboSettingsApplier(),
        showMessageMock
      );

      expect(config.update).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(expect.stringContaining('Turbo mode: Updated'));
      expect(showMessageMock).toHaveBeenCalledWith(expect.stringContaining('Copilot+ Turbo: Enabled'));
    });
  });

  describe('TurboSettingsApplier.applyAll', () => {
    it('should skip update if primitive value is the same', async () => {
      mocks.inspectMock.mockReturnValue({ globalValue: 'same-value' });
      const config = vscode.workspace.getConfiguration();

      const applier = new TurboSettingsApplier();
      const updatedCount = await applier.applyAll(config, [{ key: 'some.key', value: 'same-value' }], loggerMock);

      expect(updatedCount).toBe(0);
      expect(config.update).not.toHaveBeenCalled();
    });

    it('should skip update if object value is identical', async () => {
      mocks.inspectMock.mockReturnValue({ globalValue: { prop: 'value' } });
      const config = vscode.workspace.getConfiguration();

      const applier = new TurboSettingsApplier();
      const updatedCount = await applier.applyAll(config, [{ key: 'some.key', value: { prop: 'value' } }], loggerMock);

      expect(updatedCount).toBe(0);
      expect(config.update).not.toHaveBeenCalled();
    });

    it('should merge objects and update if new properties exist', async () => {
      mocks.inspectMock.mockReturnValue({ globalValue: { existingProp: 'old' } });
      const config = vscode.workspace.getConfiguration();

      const applier = new TurboSettingsApplier();
      const updatedCount = await applier.applyAll(config, [{ key: 'some.key', value: { newProp: 'new' } }], loggerMock);

      expect(updatedCount).toBe(1);
      expect(config.update).toHaveBeenCalledWith('some.key', { existingProp: 'old', newProp: 'new' }, 1);
    });

    it('should skip update if array is identical', async () => {
      mocks.inspectMock.mockReturnValue({ globalValue: ['a', 'b'] });
      const config = vscode.workspace.getConfiguration();

      const applier = new TurboSettingsApplier();
      const updatedCount = await applier.applyAll(config, [{ key: 'some.key', value: ['a', 'b'] }], loggerMock);

      expect(updatedCount).toBe(0);
      expect(config.update).not.toHaveBeenCalled();
    });
  });
});
