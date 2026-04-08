export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { checkRateLimit } from "@/lib/rateLimit";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

const TEXT_CHAR_LIMIT = 2500;
const UPSTREAM_TIMEOUT_MS = 15000;

const contentTypeForFormat = (format: string) => {
  if (format.startsWith("mp3_")) return "audio/mpeg";
  if (format.startsWith("wav_")) return "audio/wav";
  if (format.startsWith("pcm_")) return "audio/pcm";
  return "application/octet-stream";
};

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit(req, "api:tts", {
      limit: 15,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.ok) {
      return Response.json(
        { error: "Too many speech requests. Please retry shortly." },
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
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }
    if (text.length > TEXT_CHAR_LIMIT) {
      return Response.json(
        { error: `Text too long. Limit is ${TEXT_CHAR_LIMIT} characters.` },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return Response.json(
        { error: "Missing ElevenLabs configuration" },
        { status: 500 }
      );
    }

    const url = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}`
    );
    url.searchParams.set("output_format", ELEVENLABS_OUTPUT_FORMAT);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: contentTypeForFormat(ELEVENLABS_OUTPUT_FORMAT),
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: errorText || "ElevenLabs TTS failed" },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeForFormat(ELEVENLABS_OUTPUT_FORMAT),
        "Cache-Control": "no-store",
        ...rateLimit.headers,
      },
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to generate speech" },
      { status: 500 }
    );
  }
}
