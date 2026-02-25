"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  clearToken,
  getToken,
  setStateCache,
  setThreadId,
} from "@/lib/api";

type Preferences = {
  min_price: number;
  max_price: number;
  min_area: number;
  max_area: number;
  preferred_cities: string[];
};

type FormState = {
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  preferredCities: string[];
};

type Status = { type: "success" | "error" | "info"; message: string } | null;

type NumericField = "minPrice" | "maxPrice" | "minArea" | "maxArea";

const CITY_OPTIONS = [
  "Thane",
  "Bangalore",
  "Mumbai",
  "New Delhi",
  "Kolkata",
  "Chennai",
  "Pune",
  "Hyderabad",
];

const PRICE_MIN = 55000;
const PRICE_MAX = 840000000;
const AREA_MIN = 70;
const AREA_MAX = 35000;

export default function PreferencesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    minPrice: String(PRICE_MIN),
    maxPrice: "2000000",
    minArea: "200",
    maxArea: "1000",
    preferredCities: [],
  });

  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const isEdit = searchParams.get("edit") === "1";

    const loadPreferences = () =>
      apiFetch<{ preferences: Preferences | null }>(
        "/my-preferences",
        {},
        token
      )
        .then((data) => {
          if (data.preferences) {
            setForm({
              minPrice: Number.isFinite(data.preferences.min_price)
                ? String(data.preferences.min_price)
                : String(PRICE_MIN),
              maxPrice: Number.isFinite(data.preferences.max_price)
                ? String(data.preferences.max_price)
                : "2000000",
              minArea: Number.isFinite(data.preferences.min_area)
                ? String(data.preferences.min_area)
                : "200",
              maxArea: Number.isFinite(data.preferences.max_area)
                ? String(data.preferences.max_area)
                : "1000",
              preferredCities: data.preferences.preferred_cities || [],
            });
          }
        })
        .catch(() => {
          setStatus({
            type: "info",
            message: "No saved preferences yet.",
          });
        });

    if (isEdit) {
      loadPreferences();
      return;
    }

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
          router.replace("/chat");
          return;
        }
        return loadPreferences();
      })
      .catch(() => {
        setStatus({
          type: "info",
          message: "No saved preferences yet.",
        });
      });
  }, [router, searchParams]);

  const toggleCity = (city: string) => {
    setForm((prev) => {
      const exists = prev.preferredCities.includes(city);
      return {
        ...prev,
        preferredCities: exists
          ? prev.preferredCities.filter((c) => c !== city)
          : [...prev.preferredCities, city],
      };
    });
  };

  const parseValue = (value: string) =>
    value.trim() === "" ? null : Number(value);

  const validate = () => {
    const minPrice = parseValue(form.minPrice);
    const maxPrice = parseValue(form.maxPrice);
    const minArea = parseValue(form.minArea);
    const maxArea = parseValue(form.maxArea);

    if (minPrice === null || maxPrice === null) {
      return "Price range is required.";
    }
    if (minArea === null || maxArea === null) {
      return "Area range is required.";
    }
    if (minPrice < PRICE_MIN || minPrice > PRICE_MAX) {
      return `Min price must be between ${PRICE_MIN} and ${PRICE_MAX}.`;
    }
    if (maxPrice < PRICE_MIN || maxPrice > PRICE_MAX) {
      return `Max price must be between ${PRICE_MIN} and ${PRICE_MAX}.`;
    }
    if (minPrice > maxPrice) {
      return "Min price cannot exceed max price.";
    }
    if (minArea < AREA_MIN || minArea > AREA_MAX) {
      return `Min area must be between ${AREA_MIN} and ${AREA_MAX}.`;
    }
    if (maxArea < AREA_MIN || maxArea > AREA_MAX) {
      return `Max area must be between ${AREA_MIN} and ${AREA_MAX}.`;
    }
    if (minArea > maxArea) {
      return "Min area cannot exceed max area.";
    }
    if (!form.preferredCities.length) {
      return "Select at least one preferred city.";
    }
    return "";
  };

  const updateFieldWarning = (name: NumericField, value: string) => {
    const numeric = parseValue(value);
    let warning = "";
    if (numeric === null) {
      warning = "Required";
    } else {
      if (name === "minPrice" || name === "maxPrice") {
        if (numeric < PRICE_MIN || numeric > PRICE_MAX) {
          warning = `Must be ${PRICE_MIN} - ${PRICE_MAX}`;
        }
      }
      if (name === "minArea" || name === "maxArea") {
        if (numeric < AREA_MIN || numeric > AREA_MAX) {
          warning = `Must be ${AREA_MIN} - ${AREA_MAX}`;
        }
      }
    }
    setFieldWarnings((prev) => ({ ...prev, [name]: warning }));
  };

  const clampValue = (name: NumericField, value: string) => {
    const numeric = parseValue(value);
    if (numeric === null) return value;
    if (name === "minPrice" || name === "maxPrice") {
      const clamped = Math.min(Math.max(numeric, PRICE_MIN), PRICE_MAX);
      return String(clamped);
    }
    if (name === "minArea" || name === "maxArea") {
      const clamped = Math.min(Math.max(numeric, AREA_MIN), AREA_MAX);
      return String(clamped);
    }
    return value;
  };

  const handleNumberChange = (name: NumericField) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      if (!/^[0-9]*$/.test(raw)) return;
      setForm((prev) => ({ ...prev, [name]: raw }));
      updateFieldWarning(name, raw);
    };
  };

  const handleNumberBlur = (name: NumericField) => {
    return () => {
      setForm((prev) => {
        const next = clampValue(name, prev[name]);
        updateFieldWarning(name, next);
        return { ...prev, [name]: next };
      });
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const error = validate();
    if (error) {
      setStatus({ type: "error", message: error });
      return;
    }
    setLoading(true);
    setStatus({ type: "info", message: "Saving preferences and starting chat..." });
    const token = getToken();
    try {
      const minPrice = Number(form.minPrice);
      const maxPrice = Number(form.maxPrice);
      const minArea = Number(form.minArea);
      const maxArea = Number(form.maxArea);
      const payload: Preferences = {
        min_price: minPrice,
        max_price: maxPrice,
        min_area: minArea,
        max_area: maxArea,
        preferred_cities: form.preferredCities,
      };

      await apiFetch(
        "/save-preferences",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token
      );

      const data = await apiFetch<{ state: unknown; thread_id: string }>(
        "/initial-preferences",
        { method: "POST", body: JSON.stringify({}) },
        token
      );
      setStateCache(data.state);
      setThreadId(data.thread_id);
      router.push("/chat");
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save preferences.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    router.push("/");
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-col gap-4 rounded-[26px] border border-white/70 bg-white/80 p-8 shadow-[0_24px_56px_rgba(13,27,36,0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Preferences
            </span>
            <h1 className="font-[var(--font-fraunces)] text-3xl text-[var(--ink)]">
              Personalize your recommendations
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Share your budget, area range, and preferred cities to seed your
              first shortlist.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(13,27,36,0.06)]"
          >
            Log out
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-[26px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_56px_rgba(13,27,36,0.12)] backdrop-blur"
        >
          {status && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-[rgba(42,141,140,0.4)] bg-[rgba(42,141,140,0.12)] text-[#185a58]"
                  : status.type === "info"
                  ? "border-[rgba(58,125,255,0.3)] bg-[rgba(58,125,255,0.1)] text-[#1d3d75]"
                  : "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.12)] text-[#7f1d1d]"
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-[var(--muted)]">
              Min price (Rs.)
              <input
                className="mt-2 w-full rounded-xl border border-[var(--line)] px-4 py-3 text-base"
                inputMode="numeric"
                type="text"
                value={form.minPrice}
                onChange={handleNumberChange("minPrice")}
                onBlur={handleNumberBlur("minPrice")}
              />
              {fieldWarnings.minPrice && (
                <span className="mt-2 block text-xs text-[#b45309]">
                  {fieldWarnings.minPrice}
                </span>
              )}
            </label>
            <label className="text-sm text-[var(--muted)]">
              Max price (Rs.)
              <input
                className="mt-2 w-full rounded-xl border border-[var(--line)] px-4 py-3 text-base"
                inputMode="numeric"
                type="text"
                value={form.maxPrice}
                onChange={handleNumberChange("maxPrice")}
                onBlur={handleNumberBlur("maxPrice")}
              />
              {fieldWarnings.maxPrice && (
                <span className="mt-2 block text-xs text-[#b45309]">
                  {fieldWarnings.maxPrice}
                </span>
              )}
            </label>
            <label className="text-sm text-[var(--muted)]">
              Min area (sq ft)
              <input
                className="mt-2 w-full rounded-xl border border-[var(--line)] px-4 py-3 text-base"
                inputMode="numeric"
                type="text"
                value={form.minArea}
                onChange={handleNumberChange("minArea")}
                onBlur={handleNumberBlur("minArea")}
              />
              {fieldWarnings.minArea && (
                <span className="mt-2 block text-xs text-[#b45309]">
                  {fieldWarnings.minArea}
                </span>
              )}
            </label>
            <label className="text-sm text-[var(--muted)]">
              Max area (sq ft)
              <input
                className="mt-2 w-full rounded-xl border border-[var(--line)] px-4 py-3 text-base"
                inputMode="numeric"
                type="text"
                value={form.maxArea}
                onChange={handleNumberChange("maxArea")}
                onBlur={handleNumberBlur("maxArea")}
              />
              {fieldWarnings.maxArea && (
                <span className="mt-2 block text-xs text-[#b45309]">
                  {fieldWarnings.maxArea}
                </span>
              )}
            </label>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Price range: 55,000 to 840,000,000. Area range: 70 to 35,000 sq ft.
          </p>

          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Preferred cities</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CITY_OPTIONS.map((city) => (
                <label
                  key={city}
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted)]"
                >
                  <input
                    type="checkbox"
                    checked={form.preferredCities.includes(city)}
                    onChange={() => toggleCity(city)}
                    className="h-4 w-4 accent-[var(--accent-2)]"
                  />
                  {city}
                </label>
              ))}
            </div>
          </div>

          <button
            className="w-full rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,27,36,0.2)] transition hover:translate-y-[-1px]"
            type="submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save preferences & start chat"}
          </button>
        </form>
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--line)] bg-white px-8 py-6 shadow-[0_24px_56px_rgba(13,27,36,0.12)]">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[rgba(42,141,140,0.2)] border-t-[var(--accent-2)]" />
            <p className="text-sm font-semibold text-[var(--ink)]">
              Saving preferences and starting chat…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
