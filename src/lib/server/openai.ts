import "server-only";
export class OpenAIRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly param: string | null,
    readonly requestId: string | null = null,
  ) {
    super(`OpenAI ${status}`);
  }
}
const base = () =>
  (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
export async function openaiFetch(
  path: string,
  body: unknown,
  timeout = 30_000,
) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    const payload = await response.json().catch(() => null);
    const detail = payload?.error;
    const code = typeof detail?.code === "string" ? detail.code : null;
    const param = typeof detail?.param === "string" ? detail.param : null;
    console.error("OpenAI request failed", {
      path,
      status: response.status,
      code,
      param,
      requestId,
    });
    throw new OpenAIRequestError(response.status, code, param, requestId);
  }
  return response.json();
}
