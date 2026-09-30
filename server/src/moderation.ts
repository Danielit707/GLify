import { loadConfig } from "./config.js";

type ModerationContent = {
  text: string;
  imageUrl?: string;
};

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; statusCode: 403 | 503; error: string };

/**
 * Classifies user-submitted text and optional public image URLs before storage.
 * Requests fail closed so content is never accepted while moderation is unavailable.
 */
export async function moderateContent({ text, imageUrl }: ModerationContent): Promise<ModerationResult> {
  const { OPENAI_API_KEY } = loadConfig();
  if (!OPENAI_API_KEY) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Content moderation is not configured. Please try again later.",
    };
  }

  const input: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text },
  ];
  if (imageUrl) input.push({ type: "image_url", image_url: { url: imageUrl } });

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI moderation returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const results = typeof payload === "object" && payload !== null && "results" in payload
      ? (payload as { results?: unknown }).results
      : undefined;
    if (!Array.isArray(results) || results.some((result) =>
      typeof result !== "object" || result === null || (result as { flagged?: unknown }).flagged !== false
    )) {
      return {
        allowed: false,
        statusCode: 403,
        error: "This content could not be published because it does not meet our community guidelines.",
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error("Content moderation request failed:", error);
    return {
      allowed: false,
      statusCode: 503,
      error: "Content moderation is temporarily unavailable. Please try again later.",
    };
  }
}
