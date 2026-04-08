export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

const BASE_URL = process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
const API_KEY = process.env.POLLINATIONS_API_KEY;
const MODEL = process.env.POLLINATIONS_MODEL || "openai";
const PROMPT_CHAR_LIMIT = 2000;
const UPSTREAM_TIMEOUT_MS = 15000;

const isBadPollinations = (text: string) => {
  const s = (text || "").toLowerCase();
  return (
    s.includes("important notice") ||
    s.includes("legacy text api") ||
    s.includes("being deprecated") ||
    s.includes("migrate to our new service") ||
    s.includes("enter.pollinations.ai")
  );
};

async function callPollinationsChat(prompt: string) {
  if (!API_KEY) throw new Error("Missing POLLINATIONS_API_KEY");

  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: String(prompt) }],
      temperature: 0.3,
      max_tokens: 260,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  const textBody = await response.text();
  if (!response.ok || !textBody) {
    const preview = textBody ? textBody.slice(0, 500) : "empty response";
    throw new Error(`Pollinations error (${response.status}): ${preview}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(textBody);
  } catch {
    throw new Error(textBody.slice(0, 500));
  }

  const message = parsed?.choices?.[0]?.message || {};
  const text = typeof message?.content === "string" ? message.content : "";
  const blocks = Array.isArray(message?.content_blocks) ? message.content_blocks : [];
  const blockText = blocks
    .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
    .map((block: any) => block.text)
    .join("\n");
  const finalText = text || blockText;

  if (!finalText || isBadPollinations(finalText)) {
    const preview = finalText ? finalText.slice(0, 500) : "empty content";
    throw new Error(`Pollinations error (${response.status}): ${preview}`);
  }

  return finalText;
}

async function callPollinationsText(prompt: string) {
  if (!API_KEY) throw new Error("Missing POLLINATIONS_API_KEY");

  const query = new URLSearchParams({
    model: MODEL,
    temperature: "0.3",
  });
  query.set("key", API_KEY);

  const url = `${BASE_URL}/text/${encodeURIComponent(prompt)}?${query.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const textBody = await response.text();

  if (!response.ok || !textBody) {
    const preview = textBody ? textBody.slice(0, 500) : "empty response";
    throw new Error(`Pollinations error (${response.status}): ${preview}`);
  }

  if (isBadPollinations(textBody)) {
    throw new Error(`Pollinations error (${response.status}): ${textBody.slice(0, 500)}`);
  }

  return textBody;
}

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit(req, "api:ai", {
      limit: 20,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many AI requests. Please retry shortly." },
        {
          status: 429,
          headers: {
            ...rateLimit.headers,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    if (prompt.length > PROMPT_CHAR_LIMIT) {
      return NextResponse.json(
        { error: `Prompt too long. Limit is ${PROMPT_CHAR_LIMIT} characters.` },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        { error: "Missing POLLINATIONS_API_KEY. Use a valid Pollinations key." },
        { status: 500 }
      );
    }

    let text = "";
    try {
      text = await callPollinationsChat(prompt);
    } catch {
      text = await callPollinationsText(prompt);
    }

    return NextResponse.json({ text }, { headers: rateLimit.headers });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "PanAvest AI request failed" },
      { status: 500 }
    );
  }
}
