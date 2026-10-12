import { describe, it, expect, vi } from 'vitest';
import { ContextCompressor } from './context-compressor';

vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: undefined
    }
  };
});

describe('ContextCompressor', () => {
  const compressor = new ContextCompressor();

  it('estimates token count correctly', () => {
    const text = 'Hello world!';
    expect(compressor.estimateTokens(text)).toBe(3);
    expect(compressor.estimateTokens('')).toBe(0);
  });

  it('compresses code by removing comments and extra whitespace', () => {
    const code = `
      // This is a comment
      function add(a: number, b: number): number {
        /* Block comment */
        return a + b;
      }
    `;

    const result = compressor.compressCode(code, { removeComments: true });
    expect(result.compressedText).not.toContain('// This is a comment');
    expect(result.compressedText).not.toContain('/* Block comment */');
    expect(result.compressedText).toContain('function add(a: number, b: number): number {');
    expect(result.compressedEstimatedTokens).toBeLessThan(result.originalEstimatedTokens);
    expect(result.savingsPercentage).toBeGreaterThan(0);
  });

  it('extracts signatures when signaturesOnly is true', () => {
    const code = `
      export class Calculator {
        public add(a: number, b: number): number {
          const res = a + b;
          return res;
        }

        private log(msg: string): void {
          console.log(msg);
        }
      }
    `;

    const result = compressor.compressCode(code, { signaturesOnly: true });
    expect(result.compressedText).toContain('export class Calculator');
    expect(result.compressedText).toContain('public add(a: number, b: number): number');
    expect(result.compressedText).not.toContain('const res = a + b;');
  });
});
