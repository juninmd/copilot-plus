import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { applyTurboSettings } from './turbo';
import { Logger } from './logger';

// Mock vscode module
vi.mock('vscode', () => {
  const updateMock = vi.fn().mockResolvedValue(undefined);
  const inspectMock = vi.fn().mockReturnValue({ globalValue: undefined });

  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        inspect: inspectMock,
        update: updateMock,
      })),
    },
    ConfigurationTarget: { Global: 1 },
    window: {
      showInformationMessage: vi.fn(),
    },
  };
});

describe('Turbo Settings', () => {
  it('should apply settings if they are different from current', async () => {
    // Mock the logger
    const loggerMock = {
      log: vi.fn(),
      showLogs: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Logger;

    // Run applyTurboSettings
    await applyTurboSettings(loggerMock);

    // Verify it tries to configure workspace settings
    expect(vscode.workspace.getConfiguration).toHaveBeenCalled();

    // In our mock, globalValue is always undefined, so shouldUpdate is true
    // Thus it should call update on all the keys
    const config = vscode.workspace.getConfiguration();
    expect(config.update).toHaveBeenCalled();

    // Since there are updates, it should log and show a message
    expect(loggerMock.log).toHaveBeenCalledWith(expect.stringContaining('Turbo mode: Updated'));
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Copilot+ Turbo: Enabled'));
  });
});
