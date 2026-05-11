/**
 * pushplus（推送加）— 通过 HTTP 调用发到微信等渠道
 * 文档：https://www.pushplus.plus/doc/guide/api.html
 */

const PUSHPLUS_SEND = "https://www.pushplus.plus/send";

export type PushPlusResult =
  | { ok: true; code: number; shortCode?: string; raw: unknown }
  | { ok: false; error: string };

export async function sendPushPlusMarkdown(params: {
  token: string;
  title: string;
  markdown: string;
  channel?: string;
}): Promise<PushPlusResult> {
  const { token, title, markdown, channel = "wechat" } = params;
  try {
    const res = await fetch(PUSHPLUS_SEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        content: markdown,
        template: "markdown",
        channel,
      }),
    });
    const raw = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: string;
    };
    const code = raw.code ?? res.status;
    if (!res.ok || (code !== undefined && code !== 200)) {
      return {
        ok: false,
        error: raw.msg || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      code: code as number,
      shortCode: typeof raw.data === "string" ? raw.data : undefined,
      raw,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
