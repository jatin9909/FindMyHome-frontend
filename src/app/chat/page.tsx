"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  clearToken,
  getStateCache,
  getThreadId,
  getToken,
  setStateCache,
  setThreadId as persistThreadId,
} from "@/lib/api";

type Property = {
  name: string;
  cityName?: string;
  beds?: number;
  baths?: number;
  price?: number;
  totalArea?: number;
  pricePerSqft?: number;
  room_type?: string;
  property_type?: string;
  hasBalcony?: boolean;
  description?: string;
};

type TurnLog = {
  question?: string;
  answer?: string;
  query_used?: string;
  recommended_properties?: Property[];
};

type Preferences = {
  min_price?: number | string | null;
  max_price?: number | string | null;
  min_area?: number | string | null;
  max_area?: number | string | null;
  preferred_cities?: string[] | null;
};

type ChatSession = {
  thread_id: string;
  title?: string | null;
  created_at: string;
  last_active: string;
};

type ConversationResponse = {
  thread_id: string;
  conversation_history: TurnLog[];
  user_queries: string[];
};

export default function ChatPage() {
  const router = useRouter();
  const [threadId, setThreadId] = useState("");
  const [turnLog, setTurnLog] = useState<TurnLog[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatCreateLoading, setChatCreateLoading] = useState(false);
  const [pendingReply, setPendingReply] = useState(false);
  const [activeTurn, setActiveTurn] = useState(-1);
  const [currentChatTitle, setCurrentChatTitle] = useState("Untitled chat");
  const [isNamingChat, setIsNamingChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [chatNameError, setChatNameError] = useState("");

  useEffect(() => {
    const token = getToken();
    const storedThread = getThreadId();
    if (!token) {
      router.replace("/");
      return;
    }
    if (!storedThread) {
      router.replace("/preferences");
      return;
    }
    setThreadId(storedThread);

    const cached = getStateCache<{ turn_log?: TurnLog[] }>();
    if (cached?.turn_log?.length) {
      setTurnLog(cached.turn_log);
      const last = cached.turn_log[cached.turn_log.length - 1];
      setProperties(last.recommended_properties || []);
    }

    apiFetch<ConversationResponse>(
      `/conversation/${storedThread}`,
      {},
      token
    )
      .then((data) => {
        const history = data.conversation_history || [];
        setTurnLog(history);
        const last = history[history.length - 1];
        const recs = Array.isArray(last?.recommended_properties)
          ? last?.recommended_properties
          : [];
        setProperties(recs);
        setStateCache({ turn_log: history });
      })
      .catch((error) => {
        setStatus(
          error instanceof Error
            ? error.message
            : "Failed to load conversation."
        );
      });

    apiFetch<{ preferences: Preferences | null }>(
      "/my-preferences",
      {},
      token
    )
      .then((data) => {
        if (data.preferences) {
          setPreferences({
            ...data.preferences,
            preferred_cities: data.preferences.preferred_cities || [],
          });
        }
      })
      .catch(() => null);

    apiFetch<ChatSession[]>("/my-chats", {}, token)
      .then((data) => {
        setChats(data);
        const current = data.find((chat) => chat.thread_id === storedThread);
        if (current) {
          setCurrentChatTitle(current.title?.trim() || "Untitled chat");
        }
      })
      .catch(() => null);
  }, [router]);

  useEffect(() => {
    if (!turnLog.length) {
      setActiveTurn(-1);
      return;
    }
    const lastTurn = turnLog[turnLog.length - 1];
    const hasProps =
      Array.isArray(lastTurn?.recommended_properties) &&
      lastTurn.recommended_properties.length > 0;
    setActiveTurn(hasProps ? turnLog.length - 1 : -1);
  }, [turnLog]);

  useEffect(() => {
    if (!panelOpen) {
      setIsNamingChat(false);
      setNewChatTitle("");
      setChatNameError("");
      return;
    }
    const token = getToken();
    if (!token) return;
    setChatsLoading(true);
    apiFetch<ChatSession[]>("/my-chats", {}, token)
      .then((data) => {
        setChats(data);
        const current = data.find((chat) => chat.thread_id === threadId);
        if (current) {
          setCurrentChatTitle(current.title?.trim() || "Untitled chat");
        }
      })
      .catch(() => null)
      .finally(() => setChatsLoading(false));
  }, [panelOpen, threadId]);

  const handleLogout = () => {
    clearToken();
    router.push("/");
  };

  const handleEditPreferences = () => {
    router.push("/preferences?edit=1");
  };

  const handleCreateChat = async () => {
    const token = getToken();
    if (!token) return;
    const title = newChatTitle.trim();
    if (!title) {
      setChatNameError("Enter a chat name.");
      return;
    }
    setChatCreateLoading(true);
    try {
      const data = await apiFetch<ChatSession>(
        "/create-chat",
        { method: "POST", body: JSON.stringify({ title }) },
        token
      );
      persistThreadId(data.thread_id);
      setThreadId(data.thread_id);
      setCurrentChatTitle(data.title?.trim() || title || "Untitled chat");
      setTurnLog([]);
      setProperties([]);
      setStateCache({ turn_log: [] });
      setChats((prev) => [data, ...prev]);
      setIsNamingChat(false);
      setNewChatTitle("");
      setChatNameError("");
      setPanelOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setChatCreateLoading(false);
    }
  };

  const handleSelectChat = (session: ChatSession) => {
    const token = getToken();
    if (!token) return;
    setStatus(null);
    persistThreadId(session.thread_id);
    setThreadId(session.thread_id);
    setCurrentChatTitle(session.title?.trim() || "Untitled chat");
    setTurnLog([]);
    setProperties([]);
    setStateCache({ turn_log: [] });
    apiFetch<ConversationResponse>(
      `/conversation/${session.thread_id}`,
      {},
      token
    )
      .then((data) => {
        const history = data.conversation_history || [];
        setTurnLog(history);
        const last = history[history.length - 1];
        const recs = Array.isArray(last?.recommended_properties)
          ? last?.recommended_properties
          : [];
        setProperties(recs);
        setStateCache({ turn_log: history });
      })
      .catch((error) => {
        setStatus(
          error instanceof Error
            ? error.message
            : "Failed to load conversation."
        );
      })
      .finally(() => setPanelOpen(false));
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const token = getToken();
    if (!message.trim()) return;
    if (!threadId) {
      setStatus("Start recommendations before chatting.");
      return;
    }
    setLoading(true);
    setPendingReply(true);
    const userMessage = message.trim();
    setMessage("");

    const optimistic: TurnLog = {
      question: userMessage,
      answer: "",
      recommended_properties: properties,
    };
    setTurnLog((prev) => [...prev, optimistic]);

    try {
      const data = await apiFetch<{ state: { turn_log?: TurnLog[] } }>(
        "/invoke",
        {
          method: "POST",
          body: JSON.stringify({
            user_query: userMessage,
            thread_id: threadId,
          }),
        },
        token
      );
      const newTurnLog = data.state?.turn_log || [];
      setTurnLog(newTurnLog);
      const last = newTurnLog[newTurnLog.length - 1];
      const recs = Array.isArray(last?.recommended_properties)
        ? last?.recommended_properties
        : [];
      setProperties(recs);
      setStateCache(data.state);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send.");
    } finally {
      setLoading(false);
      setPendingReply(false);
    }
  };

  const conversation = useMemo(() => {
    return turnLog.flatMap((turn) => {
      const items: { role: "user" | "assistant"; text: string }[] = [];
      if (turn.question || turn.query_used) {
        items.push({
          role: "user",
          text: turn.question || turn.query_used || "",
        });
      }
      if (turn.answer) {
        items.push({ role: "assistant", text: turn.answer });
      }
      return items;
    });
  }, [turnLog]);

  const formatNumber = (value?: number | string | null, fallback = "N/A") => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return numeric.toLocaleString("en-IN");
  };

  const renderChatText = (text: string) => {
    const normalized = text
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n");
    const tokens = normalized.split(/(<\/?b>|<br\s*\/?>|\n)/gi);
    const nodes: React.ReactNode[] = [];
    let bold = false;

    tokens.forEach((token, index) => {
      const lower = token.toLowerCase();
      if (lower === "<b>") {
        bold = true;
        return;
      }
      if (lower === "</b>") {
        bold = false;
        return;
      }
      if (lower === "<br>" || lower === "<br/>" || lower === "<br />" || token === "\n") {
        nodes.push(<br key={`br-${index}`} />);
        return;
      }
      if (!token) return;
      nodes.push(
        <span key={`txt-${index}`} className={bold ? "font-semibold" : undefined}>
          {token}
        </span>
      );
    });

    return nodes;
  };

  const preferredCities =
    preferences?.preferred_cities && preferences.preferred_cities.length
      ? preferences.preferred_cities
      : [];

  const sortedProperties = useMemo(() => {
    const raw =
      activeTurn >= 0 && activeTurn < turnLog.length
        ? turnLog[activeTurn]?.recommended_properties
        : [];
    const base = Array.isArray(raw) ? raw : [];
    if (sortBy === "relevance") return base;
    const list = [...base];
    const getValue = (p: Property, key: "price" | "totalArea") => {
      const num = Number(p[key]);
      return Number.isFinite(num) ? num : null;
    };
    if (sortBy === "price_asc") {
      list.sort((a, b) => (getValue(a, "price") ?? Infinity) - (getValue(b, "price") ?? Infinity));
    }
    if (sortBy === "price_desc") {
      list.sort((a, b) => (getValue(b, "price") ?? -Infinity) - (getValue(a, "price") ?? -Infinity));
    }
    if (sortBy === "area_asc") {
      list.sort((a, b) => (getValue(a, "totalArea") ?? Infinity) - (getValue(b, "totalArea") ?? Infinity));
    }
    if (sortBy === "area_desc") {
      list.sort((a, b) => (getValue(b, "totalArea") ?? -Infinity) - (getValue(a, "totalArea") ?? -Infinity));
    }
    return list;
  }, [activeTurn, sortBy, turnLog]);

  const chatSummaries = useMemo(
    () =>
      turnLog.map((turn, index) => {
        const raw =
          turn.question || turn.query_used || `Chat ${index + 1}`;
        const recs = Array.isArray(turn.recommended_properties)
          ? turn.recommended_properties
          : [];
        const title = raw
          .replace(/<[^>]+>/g, "")
          .replace(/\\n/g, " ")
          .replace(/\n/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return {
          index,
          title: title || `Chat ${index + 1}`,
          count: recs.length,
        };
      })
      .filter((summary) => summary.count > 0),
    [turnLog]
  );

  return (
    <div className="min-h-screen w-full px-6 py-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              FindMyHome
            </span>
            <h1 className="font-[var(--font-fraunces)] text-3xl text-[var(--ink)]">
              Personalised Recommendations
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Use the chat to refine the shortlist in real time.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(13,27,36,0.06)]"
            >
              Chat details
            </button>
            <button
              onClick={handleEditPreferences}
              className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(13,27,36,0.06)]"
            >
              Edit preferences
            </button>
            <button
              onClick={handleLogout}
              className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(13,27,36,0.06)]"
            >
              Log out
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-[22px] border border-[var(--line)] bg-white p-6 lg:flex lg:h-[calc(100vh-200px)] lg:flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto pr-2">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">Preferences</h2>
                <div className="mt-3 rounded-xl border border-dashed border-[rgba(13,27,36,0.2)] bg-[#fffaf4] p-4 text-sm text-[var(--muted)]">
                  {preferences ? (
                    <ul className="list-disc space-y-1 pl-5">
                      <li>
                        Price range: Rs. {formatNumber(preferences.min_price, "Not set")} - Rs.{" "}
                        {formatNumber(preferences.max_price, "Not set")}
                      </li>
                      <li>
                        Area range: {formatNumber(preferences.min_area, "Not set")} -{" "}
                        {formatNumber(preferences.max_area, "Not set")} sq ft
                      </li>
                      <li>
                        Preferred cities:{" "}
                        {preferredCities.length ? preferredCities.join(", ") : "Not set"}
                      </li>
                    </ul>
                  ) : (
                    "No preferences loaded."
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-[var(--ink)]">
                    Question & Answer
                  </h2>
                </div>
                <div className="mt-4 space-y-3">
                  {conversation.length ? (
                    conversation.map((item, index) => (
                      <div
                        key={`${item.role}-${index}`}
                        className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                          item.role === "user"
                            ? "border-[rgba(255,107,74,0.3)] bg-[rgba(255,107,74,0.12)]"
                            : "border-[rgba(214,200,184,0.7)] bg-[#f8f4ee]"
                        }`}
                      >
                        <p className="whitespace-pre-line">
                          {renderChatText(item.text)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      No conversation yet.
                    </p>
                  )}
                  {pendingReply && (
                    <div className="flex items-center gap-3 rounded-2xl border border-[rgba(214,200,184,0.7)] bg-[#f8f4ee] px-4 py-3 text-sm text-[var(--muted)]">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(13,27,36,0.2)] border-t-[var(--accent-2)]" />
                      Working on the answer…
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSend} className="mt-6 space-y-3">
              <label className="text-sm font-semibold text-[var(--ink)]">
                Ask a follow-up question
                <textarea
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(255,107,74,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,107,74,0.2)]"
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ask about budget, neighborhoods, or refine the shortlist."
                />
              </label>
              {status && <p className="text-xs text-[#7f1d1d]">{status}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-[var(--ink)] px-6 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,27,36,0.2)]"
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-[22px] border border-[var(--line)] bg-white p-6 lg:h-[calc(100vh-200px)] lg:overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--ink)]">Recommended properties</h2>
              <div className="flex items-center gap-3">
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-[var(--muted)]"
                >
                  <option value="relevance">Sort: Recommended</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="area_asc">Area: Low to High</option>
                  <option value="area_desc">Area: High to Low</option>
                </select>
                <span className="rounded-full bg-[rgba(13,27,36,0.05)] px-3 py-1 text-xs text-[var(--muted)]">
                  {sortedProperties.length} homes
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {chatSummaries.length ? (
                chatSummaries.map((summary) => {
                  const isActive = summary.index === activeTurn;
                  return (
                    <div
                      key={`rec-${summary.index}`}
                      className="rounded-2xl border border-[rgba(214,200,184,0.7)] bg-[#fbf7f2] p-4"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveTurn(summary.index)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-semibold text-[var(--ink)]"
                            title={summary.title}
                          >
                            {summary.title}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {summary.count} homes
                          </p>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {isActive ? "Collapse" : "View"}
                        </span>
                      </button>

                      {isActive && (
                        <div className="mt-4 space-y-4">
                          {sortedProperties.length ? (
                            sortedProperties.map((property, index) => (
                              <article
                                key={`${property.name}-${index}`}
                                className="rounded-2xl border border-[rgba(214,200,184,0.7)] bg-white p-4"
                              >
                                <h3 className="text-base font-semibold text-[var(--ink)]">
                                  {property.name}
                                </h3>
                                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                                  {[property.cityName, property.property_type, property.room_type]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                                  <div>
                                    <span className="block text-[0.65rem] uppercase">Price</span>
                                    <strong className="text-sm text-[var(--ink)]">
                                      Rs. {formatNumber(property.price)}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="block text-[0.65rem] uppercase">Area</span>
                                    <strong className="text-sm text-[var(--ink)]">
                                      {formatNumber(property.totalArea)} sq ft
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="block text-[0.65rem] uppercase">Beds</span>
                                    <strong className="text-sm text-[var(--ink)]">
                                      {property.beds ?? "N/A"}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="block text-[0.65rem] uppercase">Baths</span>
                                    <strong className="text-sm text-[var(--ink)]">
                                      {property.baths ?? "N/A"}
                                    </strong>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {property.hasBalcony !== undefined && (
                                    <span className="rounded-full bg-[rgba(42,141,140,0.12)] px-3 py-1 text-xs text-[#185a58]">
                                      {property.hasBalcony ? "Balcony" : "No balcony"}
                                    </span>
                                  )}
                                  {property.pricePerSqft && (
                                    <span className="rounded-full bg-[rgba(255,107,74,0.16)] px-3 py-1 text-xs text-[var(--accent)]">
                                      Rs. {formatNumber(property.pricePerSqft)} / sq ft
                                    </span>
                                  )}
                                </div>
                                {property.description && (
                                  <p className="mt-3 text-sm text-[var(--muted)]">
                                    {property.description}
                                  </p>
                                )}
                              </article>
                            ))
                          ) : (
                            <p className="text-sm text-[var(--muted)]">
                              No properties yet.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[var(--muted)]">No properties yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {panelOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setPanelOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_rgba(13,27,36,0.2)]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Chats</h3>
                <p className="text-sm text-[var(--muted)]">
                  Manage chats and start a new one.
                </p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--ink)]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-[var(--line)] bg-[#fffaf4] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Current Chat
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {currentChatTitle || "Untitled chat"}
                  </p>
                </div>
                <button
                  onClick={() => setIsNamingChat(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink)] text-lg font-semibold text-white"
                >
                  +
                </button>
              </div>
              {isNamingChat && (
                <div className="mt-4 space-y-2">
                  <label className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    New chat name
                  </label>
                  <input
                    className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                    value={newChatTitle}
                    onChange={(event) => {
                      setNewChatTitle(event.target.value);
                      setChatNameError("");
                    }}
                    placeholder="e.g. Mumbai shortlist"
                  />
                  {chatNameError && (
                    <p className="text-xs text-[#b45309]">{chatNameError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateChat}
                      disabled={chatCreateLoading}
                      className="flex-1 rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white"
                    >
                      {chatCreateLoading ? "Creating..." : "Create chat"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNamingChat(false);
                        setNewChatTitle("");
                        setChatNameError("");
                      }}
                      className="flex-1 rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--ink)]">
                  Your chats
                </h4>
              </div>
              {chatsLoading ? (
                <p className="text-sm text-[var(--muted)]">Loading chats…</p>
              ) : chats.length ? (
                <div className="space-y-2">
                  {chats.map((chat) => (
                    <button
                      key={chat.thread_id}
                      onClick={() => handleSelectChat(chat)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        chat.thread_id === threadId
                          ? "border-[rgba(42,141,140,0.5)] bg-[rgba(42,141,140,0.12)]"
                          : "border-[var(--line)] bg-white"
                      }`}
                    >
                      <p className="font-semibold text-[var(--ink)]">
                        {chat.title || "Untitled chat"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Chat ID: {chat.thread_id}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  No chats yet. Create one with the + button.
                </p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
