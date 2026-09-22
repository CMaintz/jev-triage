/**
 * Minimal POST-JSON helper with the retry policy TypeSafe's docs recommend:
 * exponential backoff on 429 (rate limited) and 529 (overloaded). The official
 * SDKs do this for you; the raw adapters share this instead.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  maxAttempts = 4,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status === 529;
    if (retryable && attempt < maxAttempts) {
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`Jev request failed: ${res.status} ${await res.text()}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
