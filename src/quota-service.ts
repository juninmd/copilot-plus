import * as vscode from 'vscode';
import * as https from 'https';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_URL = 'https://api.githubcopilot.com/copilot_internal/v2/token';

export interface QuotaInfo {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
}

interface JwtPayload {
  limited_user_quotas?: {
    month?: {
      chat_requests?: number;
      used?: number;
      remaining?: number;
    };
  };
}

interface CacheEntry {
  data: QuotaInfo;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

async function getGitHubToken(): Promise<string | null> {
  try {
    const session = await vscode.authentication.getSession('github', ['read:user'], {
      createIfNone: false
    });
    return session?.accessToken ?? null;
  } catch {
    return null;
  }
}

function fetchCopilotJwt(githubToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      TOKEN_URL,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'User-Agent': 'copilot-plus-vscode-ext/0.1.0',
          Accept: 'application/json'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body) as { token?: string };
              if (parsed.token) {
                resolve(parsed.token);
              } else {
                reject(new Error('No token in response'));
              }
            } catch {
              reject(new Error('Failed to parse JSON response'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });
}

function decodeJwtPayload(jwt: string): JwtPayload {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT structure');
  }
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded) as JwtPayload;
}

async function fetchWithRetry(githubToken: string, attempts = 3): Promise<QuotaInfo | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const jwt = await fetchCopilotJwt(githubToken);
      const payload = decodeJwtPayload(jwt);
      const month = payload.limited_user_quotas?.month;
      if (!month) {
        return null;
      }
      const total = month.chat_requests ?? 300;
      const remaining = month.remaining ?? total;
      const used = month.used ?? (total - remaining);
      return {
        total,
        used,
        remaining,
        percentUsed: Math.round((used / total) * 100)
      };
    } catch (err) {
      if (i === attempts - 1) {
        console.error('[copilot-plus] quota fetch failed after retries:', err);
      } else {
        await new Promise((r) => setTimeout(r, 2 ** i * 500));
      }
    }
  }
  return null;
}

export async function fetchQuota(): Promise<QuotaInfo | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const token = await getGitHubToken();
  if (!token) {
    console.warn('[copilot-plus] no GitHub session — running in offline mode');
    return null;
  }

  const data = await fetchWithRetry(token);
  if (data) {
    cache = { data, fetchedAt: now };
  }
  return data;
}

export function invalidateCache(): void {
  cache = null;
}
