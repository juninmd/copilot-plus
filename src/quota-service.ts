import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { log } from './logger';

const CACHE_TTL_MS = 5 * 60 * 1000;
// Internal endpoint used by the VS Code Copilot extension itself
const TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';

export interface QuotaInfo {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
  source: 'api' | 'estimated';
}

export type QuotaFailReason = 'no-session' | 'no-quota-field' | 'api-error';

export interface QuotaResult {
  quota: QuotaInfo | null;
  failReason?: QuotaFailReason;
  failMessage?: string;
}

interface JwtPayload {
  sku?: string;
  // Free plan fields
  limited_user_quotas?: {
    month?: { chat_requests?: number; used?: number; remaining?: number };
    chat?: number;
    completions?: number;
  };
  // Paid plan fields (monthly_subscriber_quota)
  quota_snapshots?: Record<string, { used?: number; limit?: number; remaining?: number }>;
  quota_reset_date?: string;
  chat_quota?: { limit?: number; remaining?: number; used?: number };
  [key: string]: unknown;
}

interface CacheEntry {
  data: QuotaResult;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

async function getGitHubToken(): Promise<string | null> {
  try {
    // createIfNone: true allows VS Code to show the one-time "Copilot+ wants to sign in
    // using GitHub" trust prompt. Without this, getSession returns null silently when the
    // extension hasn't been granted access to the existing session yet.
    const session = await vscode.authentication.getSession('github', ['read:user'], {
      createIfNone: true
    });
    if (session) {
      log(`Auth: signed in as ${session.account.label}`);
      return session.accessToken;
    }
  } catch (err) {
    log(`Auth error: ${String(err)}`);
  }
  log('Auth: No GitHub session found. Sign in via VS Code → Accounts.');
  return null;
}

function httpGet(url: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'copilot-plus-vscode-ext/0.1.0',
          Accept: 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      },
      (res: http.IncomingMessage) => {
        let body = '';
        res.on('data', (chunk: { toString(): string }) => (body += chunk.toString()));
        res.on('end', () => {
          log(`HTTP ${res.statusCode} ← ${url}`);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });
}

function decodeJwtPayload(jwt: string): JwtPayload {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT structure');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  // globalThis.Buffer is always available in Node.js runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse((globalThis as any).Buffer.from(padded, 'base64').toString('utf-8')) as JwtPayload;
}

function extractQuota(payload: JwtPayload, configTotal: number): QuotaInfo | null {
  log(`JWT keys: [${Object.keys(payload).join(', ')}] | sku: ${payload.sku ?? 'n/a'}`);

  // 1. Free plan: limited_user_quotas.month (chat_requests / used / remaining)
  const month = payload.limited_user_quotas?.month;
  if (month && (month.remaining !== undefined || month.chat_requests !== undefined)) {
    const total = month.chat_requests ?? configTotal;
    const remaining = month.remaining ?? total;
    const used = month.used ?? (total - remaining);
    log(`Quota via limited_user_quotas.month: ${remaining}/${total}`);
    return { total, used, remaining, percentUsed: Math.round((used / total) * 100), source: 'api' };
  }

  // 2. Paid plan (monthly_subscriber_quota): chat_quota
  const cq = payload.chat_quota;
  if (cq?.remaining !== undefined) {
    const total = cq.limit ?? configTotal;
    const remaining = cq.remaining;
    const used = cq.used ?? (total - remaining);
    log(`Quota via chat_quota: ${remaining}/${total}`);
    return { total, used, remaining, percentUsed: Math.round((used / total) * 100), source: 'api' };
  }

  // 3. Paid plan: quota_snapshots (keyed object, pick 'chat' or first entry)
  const snaps = payload.quota_snapshots;
  if (snaps) {
    const entry = snaps['chat'] ?? snaps[Object.keys(snaps)[0]];
    if (entry?.remaining !== undefined) {
      const total = entry.limit ?? configTotal;
      const remaining = entry.remaining;
      const used = entry.used ?? (total - remaining);
      log(`Quota via quota_snapshots: ${remaining}/${total}`);
      return { total, used, remaining, percentUsed: Math.round((used / total) * 100), source: 'api' };
    }
  }

  // No quota fields found — log full payload keys to help diagnose
  log(`No quota fields found. Full payload: ${JSON.stringify(payload, null, 0).slice(0, 500)}`);
  return null;
}

export async function fetchQuota(forceRefresh = false): Promise<QuotaResult> {
  const configTotal = vscode.workspace.getConfiguration('copilotPlus').get<number>('quotaTotal') ?? 300;
  const now = Date.now();

  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const token = await getGitHubToken();
  if (!token) {
    return {
      quota: null,
      failReason: 'no-session',
      failMessage: 'Not signed in to GitHub. Use VS Code → Accounts to sign in.'
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const body = await httpGet(TOKEN_URL, token);
      const parsed = JSON.parse(body) as { token?: string };
      if (!parsed.token) {
        log('API response missing "token" field');
        break;
      }
      const payload = decodeJwtPayload(parsed.token);
      const quota = extractQuota(payload, configTotal);
      if (quota) {
        const result: QuotaResult = { quota };
        cache = { data: result, fetchedAt: now };
        return result;
      }
      const result: QuotaResult = {
        quota: null,
        failReason: 'no-quota-field',
        failMessage: 'GitHub API returned no premium request quota. Your plan may not expose this data via this endpoint.'
      };
      cache = { data: result, fetchedAt: now };
      return result;
    } catch (err) {
      log(`Attempt ${attempt + 1} failed: ${String(err)}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }

  return {
    quota: null,
    failReason: 'api-error',
    failMessage: 'Could not reach GitHub API. Check the Output log (Copilot+) for details.'
  };
}

export function invalidateCache(): void {
  cache = null;
}

