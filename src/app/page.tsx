"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken, setThreadId } from "@/lib/api";

type Panel = "request" | "signup" | "login";

type StatusType = "success" | "info" | "warning" | "error";

type Status = { type: StatusType; message: string } | null;
type LoadingAction = "request" | "check" | "signup" | "login" | null;

export default function Home() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("request");
  const [status, setStatus] = useState<Status>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [showCheckStatus, setShowCheckStatus] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch<{ thread_id: string; last_active: string }[]>(
      "/my-chats",
      {},
      token
    )
      .then((chats) => {
        if (chats.length) {
          const latest = chats
            .slice()
            .sort(
              (a, b) =>
                new Date(b.last_active).getTime() -
                new Date(a.last_active).getTime()
            )[0];
          setThreadId(latest.thread_id);
          router.push("/chat");
        } else {
          router.push("/preferences");
        }
      })
      .catch(() => {
        router.push("/preferences");
      });
  }, [router]);

  const statusClass = (type: StatusType) => {
    switch (type) {
      case "success":
        return "border-[rgba(42,141,140,0.4)] bg-[rgba(42,141,140,0.12)] text-[#185a58]";
      case "info":
        return "border-[rgba(58,125,255,0.3)] bg-[rgba(58,125,255,0.1)] text-[#1d3d75]";
      case "warning":
        return "border-[rgba(255,180,62,0.4)] bg-[rgba(255,180,62,0.16)] text-[#8a4c0f]";
      default:
        return "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.12)] text-[#7f1d1d]";
    }
  };

  const handleApprovalError = (detail: string) => {
    const text = detail.toLowerCase();

    if (text.includes("approved")) {
      setStatus({
        type: "success",
        message: "You are approved. Create a password to continue.",
      });
      setPanel("signup");
      return;
    }

    if (text.includes("log in")) {
      setStatus({
        type: "success",
        message: "You already have access. Log in to continue.",
      });
      setPanel("login");
      return;
    }

    if (text.includes("submitted for approval")) {
      setStatus({
        type: "info",
        message: "Your request is still under review. Check again later.",
      });
      setShowCheckStatus(true);
      return;
    }

    if (text.includes("rejected")) {
      setStatus({
        type: "warning",
        message: "Your request was not approved. Contact the admin.",
      });
      return;
    }

    setStatus({ type: "error", message: detail });
  };

  const handleRequest = async (
    event: React.SyntheticEvent,
    action: LoadingAction = "request"
  ) => {
    event.preventDefault();
    setStatus(null);
    if (!email.trim()) {
      setStatus({ type: "error", message: "Please enter your email." });
      return;
    }
    setLoading(true);
    setLoadingAction(action);
    try {
      const payload: { email: string; reason?: string } = { email: email.trim() };
      if (reason.trim()) {
        payload.reason = reason.trim();
      }
      const data = await apiFetch<{ message: string }>("/request-approval", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus({
        type: "success",
        message: `${data.message}. We will notify you after approval.`,
      });
      setShowCheckStatus(true);
    } catch (error) {
      handleApprovalError(
        error instanceof Error ? error.message : "Request failed."
      );
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!email.trim()) {
      setStatus({ type: "error", message: "Missing email for signup." });
      return;
    }
    if (password.length < 8) {
      setStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }
    setLoading(true);
    setLoadingAction("signup");
    try {
      const data = await apiFetch<{ message: string }>("/signup", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setStatus({ type: "success", message: `${data.message}. Please log in to continue.` });
      setPanel("login");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Signup failed.",
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!email.trim()) {
      setStatus({ type: "error", message: "Please enter your email." });
      return;
    }
    if (!password) {
      setStatus({ type: "error", message: "Please enter your password." });
      return;
    }
    setLoading(true);
    setLoadingAction("login");
    try {
      const data = await apiFetch<{ access_token: string }>("/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(data.access_token);
      try {
        const chats = await apiFetch<
          { thread_id: string; last_active: string }[]
        >("/my-chats", {}, data.access_token);
        if (chats.length) {
          const latest = chats
            .slice()
            .sort(
              (a, b) =>
                new Date(b.last_active).getTime() -
                new Date(a.last_active).getTime()
            )[0];
          setThreadId(latest.thread_id);
          router.push("/chat");
          return;
        }
      } catch {
        // ignore chat lookup errors; fall back to preferences
      }
      router.push("/preferences");
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Login failed.",
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center rounded-full bg-[rgba(255,107,74,0.16)] px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            FindMyHome Early access
          </span>
          <h1 className="font-[var(--font-fraunces)] text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
            Find your next home faster without endless searching.
          </h1>
          <p className="text-lg text-[var(--muted)]">
            Tell us what you’re looking for. We shortlist homes based on your preferences
            and refine recommendations as you explore.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Human-first recommendations",
                text: "We keep the shortlist focused, clear, and easy to compare.",
              },
              {
                title: "Built for real decisions",
                text: "Share preferences once and let the system refine the search.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_30px_rgba(13,27,36,0.08)]"
              >
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--muted)]">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-[var(--muted)]">
            Need help? Email the admin after you request access.
          </p>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/85 p-8 shadow-[0_28px_60px_rgba(13,27,36,0.16)] backdrop-blur">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Authorization</h2>
            <p className="text-sm text-[var(--muted)]">
              Start with your email. We will guide you through approval, signup, and login.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
            {["request", "signup", "login"].map((step, index) => (
              <div
                key={step}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${
                  panel === step
                    ? "border-[var(--accent-2)] bg-[rgba(42,141,140,0.12)] text-[var(--ink)]"
                    : "border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink)]">
                  {index + 1}
                </span>
                {step}
              </div>
            ))}
          </div>

          {status && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${statusClass(status.type)}`}>
              {status.message}
            </div>
          )}

          {panel === "request" && (
            <form className="mt-6 space-y-4" onSubmit={handleRequest}>
              <label className="block text-sm text-[var(--muted)]">
                Email
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  required
                />
              </label>
              <label className="block text-sm text-[var(--muted)]">
                Reason (optional)
                <textarea
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={loading}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  className="flex-1 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,27,36,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
                  type="submit"
                  disabled={loading}
                  aria-busy={loadingAction === "request"}
                >
                  <span className="flex items-center justify-center gap-2">
                    {loadingAction === "request" && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    )}
                    {loadingAction === "request" ? "Requesting..." : "Request access"}
                  </span>
                </button>
                {showCheckStatus && (
                  <button
                    type="button"
                    onClick={(event) => handleRequest(event, "check")}
                    className="flex-1 rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loading}
                    aria-busy={loadingAction === "check"}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loadingAction === "check" && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(13,27,36,0.25)] border-t-[var(--ink)]" />
                      )}
                      {loadingAction === "check" ? "Checking..." : "Check status"}
                    </span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPanel("login")}
                className="text-left text-sm text-[var(--accent-2)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:no-underline"
                disabled={loading}
              >
                Already have access? Go to login
              </button>
            </form>
          )}

          {panel === "signup" && (
            <form className="mt-6 space-y-4" onSubmit={handleSignup}>
              <label className="block text-sm text-[var(--muted)]">
                Approved email
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)]"
                  type="email"
                  value={email}
                  readOnly
                  disabled={loading}
                />
              </label>
              <label className="block text-sm text-[var(--muted)]">
                Create password
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  required
                />
              </label>
              <label className="block text-sm text-[var(--muted)]">
                Confirm password
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={loading}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  className="flex-1 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,27,36,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
                  type="submit"
                  disabled={loading}
                  aria-busy={loadingAction === "signup"}
                >
                  <span className="flex items-center justify-center gap-2">
                    {loadingAction === "signup" && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    )}
                    {loadingAction === "signup" ? "Creating..." : "Create account"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("request")}
                  className="flex-1 rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  Change email
                </button>
              </div>
            </form>
          )}

          {panel === "login" && (
            <form className="mt-6 space-y-4" onSubmit={handleLogin}>
              <label className="block text-sm text-[var(--muted)]">
                Email
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  required
                />
              </label>
              <label className="block text-sm text-[var(--muted)]">
                Password
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] focus:border-[rgba(42,141,140,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(42,141,140,0.2)]"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  className="flex-1 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,27,36,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
                  type="submit"
                  disabled={loading}
                  aria-busy={loadingAction === "login"}
                >
                  <span className="flex items-center justify-center gap-2">
                    {loadingAction === "login" && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    )}
                    {loadingAction === "login" ? "Logging in..." : "Log in"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("request")}
                  className="flex-1 rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  Change email
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
