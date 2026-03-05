"use client";

import Fuse from "fuse.js";
import Papa from "papaparse";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Entry = {
  id?: string;
  term: string;
  definition: string;
  synonyms?: string;
  tags?: string;
  pronunciation?: string;
  pos?: string;
  examples?: string;
  [key: string]: any;
};

type Message = {
  id: string;
  role: "user" | "bot";
  content?: string;
  entry?: Entry;
  timestamp?: number;
};

type DataStatus = "loading" | "ready" | "error" | "empty";

type TtsControls = {
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  setSelectedVoiceURI: (voiceURI: string) => void;
  speakingId: string | null;
  speak: (id: string, text: string) => void;
  cancel: () => void;
};

const STOP_WORDS = /^(what is|what's|define|explain|describe|meaning of|tell me about|search for|look up|do you know)\s+/i;

const uuid = () => Math.random().toString(36).slice(2, 9);

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fallbackExplanation = (anchor: Entry) => {
  const concept = escapeHtml(anchor.definition || `${anchor.term} is a supply chain concept.`);
  const exampleText =
    anchor.examples ||
    `In practice, ${anchor.term} could involve ${
      anchor.definition?.replace(/\.$/, "") || "real-world operations"
    }.`;
  const example = escapeHtml(exampleText);
  return `<b>Concept:</b> ${concept}<br/><br/><b>Real-World Example:</b> ${example}`;
};

function useDictionaryData() {
  const [data, setData] = useState<Entry[]>([]);
  const [status, setStatus] = useState<DataStatus>("loading");

  const processCsv = (csvText: string) => {
    try {
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });
      const entries = (parsed.data as Record<string, string>[])
        .map((row) => ({
          term: (row.term || row.Term || "").trim(),
          definition: (row.definition || row.Definition || "").trim(),
          synonyms: row.synonyms || row.Synonyms || "",
          tags: row.tags || row.Tags || "",
          pos: row.pos || row.Pos || "",
          pronunciation: row.pronunciation || row.Pronunciation || "",
          examples: row.examples || row.Examples || "",
        }))
        .filter((entry) => entry.term && entry.definition);

      if (entries.length > 0) {
        setData(entries);
        setStatus("ready");
      } else {
        setData([]);
        setStatus("empty");
      }
    } catch {
      setData([]);
      setStatus("error");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadCsv = async () => {
      const sources = ["/scmpedia_full_UPDATED.csv", "/scmpedia_full.csv"];
      for (const source of sources) {
        try {
          const response = await fetch(`${source}?v=${Date.now()}`, { cache: "no-store" });
          if (!response.ok) continue;
          const text = await response.text();
          if (!text) continue;
          if (!cancelled) processCsv(text);
          return;
        } catch {
          // Try the next source.
        }
      }

      if (!cancelled) setStatus("empty");
    };

    loadCsv();

    return () => {
      cancelled = true;
    };
  }, []);

  const fuse = useMemo(
    () =>
      data.length
        ? new Fuse(data, {
            keys: [
              { name: "term", weight: 0.7 },
              { name: "definition", weight: 0.3 },
              { name: "tags", weight: 0.1 },
            ],
            threshold: 0.3,
            includeScore: true,
          })
        : null,
    [data]
  );

  return { data, status, processCsv, fuse };
}

function useTtsControls(): TtsControls {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const setSpeaking = (id: string | null) => {
    speakingIdRef.current = id;
    setSpeakingId(id);
  };

  const revokeAudioUrl = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const clearAudioElement = () => {
    if (!audioRef.current) return;
    audioRef.current.onended = null;
    audioRef.current.onerror = null;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.src = "";
    audioRef.current = null;
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    synthRef.current = window.speechSynthesis;

    const pickBestVoice = (list: SpeechSynthesisVoice[]) => {
      const englishVoices = list.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
      const pool = englishVoices.length ? englishVoices : list;
      const patterns = [
        /google us english/i,
        /google uk english female/i,
        /google uk english/i,
        /microsoft (aria|jenny|guy|sara|zira|david)/i,
        /natural/i,
        /neural/i,
        /samantha/i,
        /alex/i,
        /karen/i,
        /moira/i,
        /google/i,
      ];

      for (const pattern of patterns) {
        const found = pool.find((voice) => pattern.test(voice.name));
        if (found) return found;
      }

      return pool[0];
    };

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis
        .getVoices()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      setVoices(availableVoices);
      const saved = window.localStorage.getItem("panavest-ai-voice-uri") || "";
      const hasSaved = availableVoices.some((voice) => voice.voiceURI === saved);
      if (hasSaved) {
        setSelectedVoiceURIState(saved);
        return;
      }
      const best = pickBestVoice(availableVoices);
      if (best) setSelectedVoiceURIState(best.voiceURI);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      requestAbortRef.current?.abort();
      clearAudioElement();
      revokeAudioUrl();
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  const setSelectedVoiceURI = (voiceURI: string) => {
    setSelectedVoiceURIState(voiceURI);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("panavest-ai-voice-uri", voiceURI);
    }
  };

  const cancel = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    clearAudioElement();
    revokeAudioUrl();
    synthRef.current?.cancel();
    setSpeaking(null);
  };

  const speak = (id: string, text: string) => {
    if (!text.trim()) return;
    if (speakingIdRef.current === id) {
      cancel();
      return;
    }

    cancel();
    setSpeaking(id);

    const speakWithBrowserVoice = () => {
      if (!synthRef.current) {
        setSpeaking(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const selectedVoice = voices.find((voice) => voice.voiceURI === selectedVoiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => setSpeaking(null);
      utterance.onerror = () => setSpeaking(null);
      synthRef.current.cancel();
      synthRef.current.speak(utterance);
    };

    void (async () => {
      const controller = new AbortController();
      requestAbortRef.current = controller;

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const audioBlob = await response.blob();
        if (controller.signal.aborted) return;

        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          clearAudioElement();
          revokeAudioUrl();
          setSpeaking(null);
        };
        audio.onerror = () => {
          clearAudioElement();
          revokeAudioUrl();
          speakWithBrowserVoice();
        };

        await audio.play();
      } catch (error) {
        if (controller.signal.aborted) return;
        speakWithBrowserVoice();
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    })();
  };

  return {
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    speakingId,
    speak,
    cancel,
  };
}

function VoiceActivity({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span className="ml-1 inline-flex h-4 items-end gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-current animate-pulse"
          style={{
            height: `${8 + index * 2}px`,
            animationDelay: `${index * 160}ms`,
            animationDuration: "0.8s",
          }}
        />
      ))}
    </span>
  );
}

function useAiGenerator() {
  const formatToHtml = (raw: string, anchor: Entry) => {
    let text = raw.trim();
    if (!text) return fallbackExplanation(anchor);

    const hasHtml = /<\/?[a-z][\s\S]*>/i.test(text);
    if (!hasHtml) {
      text = escapeHtml(text).replace(/\r?\n+/g, "\n");
    }

    text = text
      .replace(/Concept:/i, "<b>Concept:</b>")
      .replace(/Real-World Example:/i, "<b>Real-World Example:</b>");

    if (!text.includes("<b>Concept:</b>")) {
      text = `<b>Concept:</b> ${text}`;
    }

    if (!text.includes("<b>Real-World Example:</b>")) {
      text += `<br/><br/><b>Real-World Example:</b> ${escapeHtml(
        anchor.examples || "A practical example can be observed in day-to-day supply chain operations."
      )}`;
    } else {
      text = text.replace(/\n/g, "<br/>");
    }

    return text;
  };

  const generate = async (anchor: Entry, isRegen?: boolean) => {
    const instruction = isRegen
      ? "Re-explain this concept simply for a beginner. Use a fresh analogy."
      : "Explain this concept simply to a professional. Provide a clear definition and a real-world supply chain example.";

    const prompt = [
      "You are a Supply Chain Tutor.",
      `Term: "${anchor.term}"`,
      `Definition: "${anchor.definition}"`,
      `Tags: "${anchor.tags || ""}"`,
      "",
      `Task: ${instruction}`,
      "",
      "Output Format:",
      "Return strictly HTML with <b> tags. No markdown.",
      "1. <b>Concept:</b> (Explanation)",
      "2. <b>Real-World Example:</b> (Example)",
    ].join("\n");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "PanAvest AI request failed");
      }

      const data = await response.json();
      const text = typeof data?.text === "string" ? data.text : "";
      if (!text) throw new Error("PanAvest AI returned empty response");

      return formatToHtml(text, anchor);
    } catch {
      return `<i>Could not reach PanAvest AI services. Here is a summary:</i><br/><br/><b>Concept:</b> ${escapeHtml(
        `${anchor.term} is a concept in ${anchor.tags || "supply chain"} regarding ${anchor.definition}.`
      )}<br/><br/><b>Real-World Example:</b> ${escapeHtml(
        anchor.examples ||
          "This often appears when companies manage sourcing, inventory, logistics, or supplier performance related to the term."
      )}`;
    }
  };

  return { status: "ready" as const, generate };
}

function SettingsDialog({
  open,
  onClose,
  tts,
  autoReadAi,
  setAutoReadAi,
}: {
  open: boolean;
  onClose: () => void;
  tts: TtsControls;
  autoReadAi: boolean;
  setAutoReadAi: (value: boolean) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full rounded-[28px] border border-[color:var(--color-light)] bg-white p-5 shadow-[0_24px_80px_-28px_rgba(44,37,34,0.45)] sm:max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[color:var(--color-text-dark)]">PanAvest AI Settings</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Voice and reading controls for the mobile AI view.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--color-light)] p-2 text-[color:var(--color-text-muted)]"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
              Browser Fallback Voice
            </label>
            <select
              value={tts.selectedVoiceURI}
              onChange={(e) => tts.setSelectedVoiceURI(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-4 py-3 text-sm text-[color:var(--color-text-dark)] outline-none focus:ring-2 focus:ring-[color:var(--color-accent-red)]/20"
            >
              {tts.voices
                .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
                .map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
            </select>
            <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
              ElevenLabs is now the default reading voice. This browser voice is only used if ElevenLabs is unavailable.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--color-text-dark)]">Auto-read AI insights</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Start reading the explanation as soon as it loads.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoReadAi}
              onChange={(e) => setAutoReadAi(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--color-accent-red)]"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-[color:var(--color-accent-red)] px-4 py-3 text-sm font-semibold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  const thoughts = useMemo(
    () => [
      "Scanning database...",
      "Connecting concepts...",
      "Analyzing context...",
      "Drafting insight...",
      "Formatting response...",
    ],
    []
  );
  const [thought, setThought] = useState(thoughts[0]);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % thoughts.length;
      setThought(thoughts[index]);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [thoughts]);

  return (
    <div className="mt-3 rounded-3xl border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-accent-red)]">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        PanAvest AI is thinking...
      </div>
      <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">{thought}</div>
    </div>
  );
}

function SmartCard({
  entry,
  tts,
  ai,
  autoReadAi,
}: {
  entry: Entry;
  tts: TtsControls;
  ai: ReturnType<typeof useAiGenerator>;
  autoReadAi: boolean;
}) {
  const [expanded, setExpanded] = useState<"details" | "ai" | null>(null);
  const [aiText, setAiText] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAltUrl, setImageAltUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageErrorMessage, setImageErrorMessage] = useState("");
  const autoReadKeyRef = useRef("");

  useEffect(() => {
    if (!autoReadAi || !aiText) return;
    const nextKey = `${entry.term}:${aiText}`;
    if (autoReadKeyRef.current === nextKey) return;
    autoReadKeyRef.current = nextKey;
    tts.speak(`ai-${entry.term}`, aiText.replace(/<[^>]*>/g, ""));
  }, [aiText, autoReadAi, entry.term, tts]);

  const fetchAi = async (regen = false) => {
    setLoadingAi(true);
    try {
      const text = await ai.generate(entry, regen);
      setAiText(text || fallbackExplanation(entry));
    } finally {
      setLoadingAi(false);
    }
  };

  const fetchImage = async () => {
    if (imageLoading || imageUrl) return;
    const query = entry.term.trim();
    if (!query) return;

    setImageLoading(true);
    setImageErrorMessage("");

    try {
      const response = await fetch(`/api/image?q=${encodeURIComponent(query)}`);
      const bodyText = await response.text();
      let data: any = {};

      if (bodyText) {
        try {
          data = JSON.parse(bodyText);
        } catch {
          data = {};
        }
      }

      if (!response.ok) {
        const message = typeof data?.error === "string" ? data.error : bodyText;
        throw new Error(message || `Image lookup failed (${response.status})`);
      }

      const primary = typeof data?.url === "string" ? data.url : "";
      const fallback = typeof data?.link === "string" ? data.link : "";
      const thumbnail = typeof data?.thumbnail === "string" ? data.thumbnail : "";

      if (!primary && !thumbnail && !fallback) {
        throw new Error("No image found");
      }

      setImageUrl(thumbnail || primary || fallback);
      setImageAltUrl(primary || fallback || thumbnail);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImageErrorMessage(message);
    } finally {
      setImageLoading(false);
    }
  };

  const handleAiPanel = async () => {
    if (expanded === "ai") {
      setExpanded(null);
      return;
    }

    setExpanded("ai");
    if (!aiText) void fetchAi();
    void fetchImage();
  };

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(`${entry.term}: ${entry.definition}`);
    } catch {
      // Silent failure keeps the action low-friction on devices where clipboard is restricted.
    }
  };

  const isSpeakingDefinition = tts.speakingId === `def-${entry.term}`;
  const isSpeakingAi = tts.speakingId === `ai-${entry.term}`;

  return (
    <article className="w-full max-w-[42rem] rounded-[28px] border border-[color:var(--color-light)] bg-white p-4 shadow-[0_18px_40px_-28px_rgba(44,37,34,0.55)] sm:p-5">
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-[color:var(--color-text-dark)]">{entry.term}</h2>
        {entry.pos ? (
          <span className="rounded-full bg-[color:var(--color-accent-red)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-red)]">
            {entry.pos}
          </span>
        ) : null}
        {entry.pronunciation ? (
          <span className="text-sm text-[color:var(--color-text-muted)]">/{entry.pronunciation}/</span>
        ) : null}
      </div>

      <p className="mt-3 text-[15px] leading-7 text-[color:var(--color-text-dark)]">{entry.definition}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => tts.speak(`def-${entry.term}`, `${entry.term}. ${entry.definition}`)}
          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
            isSpeakingDefinition
              ? "border-[color:var(--color-accent-red)]/25 bg-[color:var(--color-accent-red)]/10 text-[color:var(--color-accent-red)]"
              : "border-[color:var(--color-light)] bg-[color:var(--color-bg)] text-[color:var(--color-text-muted)]"
          }`}
        >
          <Volume2 className="h-4 w-4" />
          {isSpeakingDefinition ? "Stop" : "Read"}
          <VoiceActivity active={isSpeakingDefinition} />
        </button>

        <button
          type="button"
          onClick={handleAiPanel}
          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
            expanded === "ai"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[color:var(--color-light)] bg-[color:var(--color-bg)] text-[color:var(--color-text-muted)]"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          {ai.status === "ready" ? "Explain with AI" : "Loading AI..."}
        </button>

        <button
          type="button"
          onClick={() => setExpanded(expanded === "details" ? null : "details")}
          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
            expanded === "details"
              ? "border-[color:var(--color-accent-red)]/25 bg-[color:var(--color-accent-red)]/10 text-[color:var(--color-accent-red)]"
              : "border-[color:var(--color-light)] bg-[color:var(--color-bg)] text-[color:var(--color-text-muted)]"
          }`}
        >
          <ChevronRight className="h-4 w-4" />
          Details
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-medium text-[color:var(--color-text-muted)] transition"
        >
          <Clipboard className="h-4 w-4" />
          Copy
        </button>
      </div>

      {expanded === "details" ? (
        <div className="mt-4 rounded-[24px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)] p-4 text-sm text-[color:var(--color-text-dark)]">
          {entry.synonyms ? (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                Synonyms
              </div>
              <div className="mt-1 leading-6">{entry.synonyms}</div>
            </div>
          ) : null}
          {entry.tags ? (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                Tags
              </div>
              <div className="mt-1 leading-6">{entry.tags}</div>
            </div>
          ) : null}
          {entry.examples ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                Example
              </div>
              <div className="mt-1 leading-6">{entry.examples}</div>
            </div>
          ) : null}
          {!entry.synonyms && !entry.tags && !entry.examples ? (
            <div className="italic text-[color:var(--color-text-muted)]">No additional details available.</div>
          ) : null}
        </div>
      ) : null}

      {expanded === "ai" ? (
        <div className="mt-4 rounded-[24px] border border-emerald-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              PanAvest AI
            </div>

            {aiText && !loadingAi ? (
              <button
                type="button"
                onClick={() => tts.speak(`ai-${entry.term}`, aiText.replace(/<[^>]*>/g, ""))}
                className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700"
              >
                <Volume2 className="h-3.5 w-3.5" />
                {isSpeakingAi ? "Stop reading" : "Read insight"}
                <VoiceActivity active={isSpeakingAi} />
              </button>
            ) : null}
          </div>

          <div className="mt-3 overflow-hidden rounded-[20px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={entry.term}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-52 w-full object-cover"
                onError={() => {
                  if (imageAltUrl && imageAltUrl !== imageUrl) {
                    setImageUrl(imageAltUrl);
                    return;
                  }
                  setImageUrl("");
                }}
              />
            ) : (
              <div className="flex h-52 flex-col items-center justify-center gap-2 px-6 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                {imageLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                {imageLoading
                  ? "Loading image..."
                  : imageErrorMessage.toLowerCase().includes("google cse")
                  ? "Image unavailable - Google image keys missing"
                  : "Image unavailable"}
              </div>
            )}
          </div>

          {loadingAi ? (
            <ThinkingIndicator />
          ) : (
            <>
              <div
                className="mt-4 text-sm leading-7 text-[color:var(--color-text-dark)]"
                dangerouslySetInnerHTML={{
                  __html: aiText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                }}
              />

              <a
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${entry.term} supply chain`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700"
              >
                View Google Images
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={() => void fetchAi(true)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-4 py-3 text-sm font-semibold text-[color:var(--color-text-dark)]"
              >
                <Sparkles className="h-4 w-4" />
                Try Different Explanation
              </button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function PanavestAiClient() {
  const { data, status, processCsv, fuse } = useDictionaryData();
  const tts = useTtsControls();
  const ai = useAiGenerator();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Entry[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoReadAi, setAutoReadAi] = useState(true);

  const deferredInput = useDeferredValue(input);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("panavest-ai-auto-read");
    if (saved !== null) setAutoReadAi(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("panavest-ai-auto-read", String(autoReadAi));
    }
  }, [autoReadAi]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const query = deferredInput.trim();
    if (!query || !fuse) {
      setSuggestions([]);
      setSelectedSuggestion(-1);
      return;
    }

    const nextSuggestions = fuse.search(query).slice(0, 5).map((hit) => hit.item);
    setSuggestions(nextSuggestions);
    setSelectedSuggestion(-1);
  }, [deferredInput, fuse]);

  const handleSubmit = (text: string) => {
    const originalQuery = text.trim();
    if (!originalQuery) return;

    setInput("");
    setSuggestions([]);
    setSelectedSuggestion(-1);
    setMessages((current) => [
      ...current,
      { id: uuid(), role: "user", content: originalQuery, timestamp: Date.now() },
    ]);

    if (status !== "ready") {
      window.setTimeout(() => {
        setMessages((current) => [
          ...current,
          { id: uuid(), role: "bot", content: "Please load the database file first." },
        ]);
      }, 200);
      return;
    }

    const cleanedQuery = originalQuery.replace(STOP_WORDS, "").replace(/[?]/g, "").trim();

    let match = data.find((entry) => entry.term.toLowerCase() === cleanedQuery.toLowerCase());
    if (!match && fuse) {
      const result = fuse.search(cleanedQuery);
      if (result[0]) match = result[0].item;
    }

    if (!match && cleanedQuery !== originalQuery) {
      const exactOriginal = data.find((entry) => entry.term.toLowerCase() === originalQuery.toLowerCase());
      if (exactOriginal) {
        match = exactOriginal;
      } else if (fuse) {
        const result = fuse.search(originalQuery);
        if (result[0]) match = result[0].item;
      }
    }

    if (match) {
      setMessages((current) => [
        ...current,
        { id: uuid(), role: "bot", entry: match, timestamp: Date.now() },
      ]);
      return;
    }

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: uuid(),
          role: "bot",
          content: `I couldn't find a match for "${cleanedQuery}". Try a different term.`,
        },
      ]);
    }, 300);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSuggestion((current) => Math.min(current + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSuggestion((current) => Math.max(current - 1, -1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
        handleSubmit(suggestions[selectedSuggestion].term);
      } else {
        handleSubmit(input);
      }
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === "string" ? event.target.result : "";
      if (text) processCsv(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files?.[0]) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const topUiInset = "max(var(--kds-native-top-offset, 0px), env(safe-area-inset-top, 0px))";
  const bottomUiInset =
    "max(var(--kds-native-tabbar-height, 0px), calc(var(--kds-native-bottom-offset, 0px) + env(safe-area-inset-bottom, 0px)))";
  const composerBottomInset = `calc(${bottomUiInset} + 0.375rem)`;
  const composerPadding = `calc(${bottomUiInset} + 8.75rem)`;

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tts={tts}
        autoReadAi={autoReadAi}
        setAutoReadAi={setAutoReadAi}
      />

      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(245,183,80,0.16),_transparent_38%),linear-gradient(180deg,_#fefdfa_0%,_#f7efe7_100%)]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <header
          className="sticky top-0 z-20 border-b border-white/60 bg-[rgba(254,253,250,0.92)] px-4 pb-3 backdrop-blur sm:px-6"
          style={{ paddingTop: `calc(${topUiInset} + 0.75rem)` }}
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-light)] bg-white text-[color:var(--color-text-dark)] shadow-[0_10px_24px_-18px_rgba(44,37,34,0.6)]"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[color:var(--color-accent-red)] text-white shadow-[0_14px_24px_-18px_rgba(182,84,55,0.9)]">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-red)]">
                      PanAvest AI
                    </div>
                    <div className="truncate text-sm text-[color:var(--color-text-muted)]">
                      Supply chain dictionary for mobile
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--color-light)] bg-white text-[color:var(--color-text-dark)]"
                aria-label="Open settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`inline-flex h-10 items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold ${
                  status === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {status === "ready" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
                <span className="sr-only">{status === "ready" ? "Database active" : "Load database"}</span>
                <span className="hidden sm:inline sm:pl-2">
                  {status === "ready" ? "Database active" : "Load database"}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".csv"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: composerPadding }}>
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-4xl flex-col px-4 pb-6 pt-10 sm:px-6">
              <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_30px_80px_-34px_rgba(44,37,34,0.4)]">
                <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-accent-red)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-red)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Mobile AI
                </div>
                <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[color:var(--color-text-dark)]">
                  Search, learn, and explain supply chain terms fast.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--color-text-muted)] sm:text-base">
                  This is the mobile PanAvest AI experience built into KDS. It uses the same dictionary workflow as the
                  main app: predictive term search, rich concept cards, AI explanations, text-to-speech, and image context.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)] p-4">
                    <Search className="h-5 w-5 text-[color:var(--color-accent-red)]" />
                    <div className="mt-3 text-sm font-semibold text-[color:var(--color-text-dark)]">Predictive search</div>
                    <p className="mt-1 text-xs leading-6 text-[color:var(--color-text-muted)]">
                      Fuzzy-matched dictionary search over the full SCM dataset.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)] p-4">
                    <Sparkles className="h-5 w-5 text-[color:var(--color-accent-red)]" />
                    <div className="mt-3 text-sm font-semibold text-[color:var(--color-text-dark)]">AI explanation</div>
                    <p className="mt-1 text-xs leading-6 text-[color:var(--color-text-muted)]">
                      Generates concept and real-world supply chain examples for each term.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)] p-4">
                    <FileSpreadsheet className="h-5 w-5 text-[color:var(--color-accent-red)]" />
                    <div className="mt-3 text-sm font-semibold text-[color:var(--color-text-dark)]">CSV-backed</div>
                    <p className="mt-1 text-xs leading-6 text-[color:var(--color-text-muted)]">
                      Loads the bundled SCM dictionary automatically and still supports CSV replacement.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-[color:var(--color-light)] bg-[color:var(--color-bg)] px-4 py-3 text-sm text-[color:var(--color-text-dark)]">
                  <span className="font-semibold">Database status:</span>{" "}
                  {status === "ready"
                    ? "Active and ready for search."
                    : status === "loading"
                    ? "Loading dictionary resources..."
                    : status === "empty"
                    ? "No bundled CSV was found. Tap the database button to load one."
                    : "There was a problem reading the CSV."}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl px-4 pb-6 pt-5 sm:px-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-6 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[92%] ${
                      message.role === "user"
                        ? "rounded-[24px] rounded-br-md bg-[color:var(--color-accent-red)] px-4 py-3 text-sm font-medium text-white shadow-[0_18px_32px_-24px_rgba(182,84,55,0.95)]"
                        : "w-full"
                    }`}
                  >
                    {message.content ? <div className="leading-7">{message.content}</div> : null}
                    {message.entry ? (
                      <div className="flex items-start gap-3">
                        <div className="mt-2 hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--color-accent-red)] text-white sm:inline-flex">
                          <Bot className="h-4 w-4" />
                        </div>
                        <SmartCard entry={message.entry} tts={tts} ai={ai} autoReadAi={autoReadAi} />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[color:var(--color-bg)] via-[color:var(--color-bg)]/94 to-transparent px-4 pt-8 sm:px-6"
          style={{ paddingBottom: composerBottomInset }}
        >
          <div className="pointer-events-auto mx-auto max-w-4xl">
            {suggestions.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-[24px] border border-[color:var(--color-light)] bg-white shadow-[0_24px_60px_-30px_rgba(44,37,34,0.45)]">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.term}
                    type="button"
                    onClick={() => handleSubmit(suggestion.term)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-[color:var(--color-light)] px-4 py-3 text-left last:border-b-0 ${
                      index === selectedSuggestion ? "bg-[color:var(--color-bg)]" : "bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[color:var(--color-text-dark)]">
                        {suggestion.term}
                      </div>
                      <div className="truncate text-xs text-[color:var(--color-text-muted)]">
                        {suggestion.definition}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--color-text-muted)]" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="rounded-[30px] border border-[color:var(--color-light)] bg-white p-2 shadow-[0_30px_80px_-36px_rgba(44,37,34,0.55)]">
              <div className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[24px] bg-[color:var(--color-bg)] px-4 py-2">
                  <Search className="h-4 w-4 shrink-0 text-[color:var(--color-text-muted)]" />
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={status !== "ready"}
                    placeholder={
                      status === "ready" ? "Search a supply chain term..." : "Loading dictionary resources..."
                    }
                    className="min-h-[44px] w-full border-0 bg-transparent px-0 text-[15px] text-[color:var(--color-text-dark)] outline-none placeholder:text-[color:var(--color-text-muted)]"
                    inputMode="search"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleSubmit(input)}
                  disabled={!input.trim()}
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition ${
                    input.trim()
                      ? "bg-[color:var(--color-accent-red)] text-white shadow-[0_18px_32px_-20px_rgba(182,84,55,0.95)]"
                      : "bg-[color:var(--color-light)] text-[color:var(--color-text-muted)]"
                  }`}
                  aria-label="Send search"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[11px] text-[color:var(--color-text-muted)]">
                <span>Powered by PanAvest AI</span>
                <span className="truncate">
                  {status === "ready"
                    ? "SCM dictionary active"
                    : status === "loading"
                    ? "Loading..."
                    : "Tap the database button if needed"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
