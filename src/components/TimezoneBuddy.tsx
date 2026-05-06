import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, GripVertical, RotateCcw, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { CITIES, type City } from "@/data/cities";
import { localParts, formatUTC } from "@/lib/tz";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tzbuddy.cities.v1";
const MAX_CITIES = 20;

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function dayLabel(previewKey: string, refKey: string) {
  if (previewKey === refKey) return "Today";
  // compare dates lexicographically (YYYY-MM-DD)
  return previewKey < refKey ? "Yesterday" : "Tomorrow";
}

export function TimezoneBuddy() {
  const now = useNow();
  const [cities, setCities] = useState<City[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [scrubMin, setScrubMin] = useState<number | null>(null); // minutes from local midnight; null = follow now
  const [dragId, setDragId] = useState<string | null>(null);
  const [use12h, setUse12h] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tzbuddy.use12h") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("tzbuddy.use12h", use12h ? "1" : "0");
    } catch {}
  }, [use12h]);
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        const map = new Map(CITIES.map((c) => [c.id, c]));
        setCities(ids.map((id) => map.get(id)).filter(Boolean) as City[]);
      }
    } catch {}
  }, []);

  // Save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cities.map((c) => c.id)));
    } catch {}
  }, [cities]);

  const dayStart = useMemo(() => startOfLocalDay(now), [now]);
  const nowMin =
    (now.getTime() - dayStart.getTime()) / 60000; // 0..1440

  const previewMin = scrubMin ?? nowMin;
  const previewedAt = new Date(dayStart.getTime() + previewMin * 60000);
  const refKeyForUser = localParts(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    now,
  ).dateKey;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  function addCity(c: City) {
    if (cities.some((x) => x.id === c.id)) {
      setQuery("");
      setOpen(false);
      return;
    }
    if (cities.length >= MAX_CITIES) {
      toast("Whoa! That's a lot of clocks. Remove one to add another.");
      return;
    }
    setCities((cur) => [...cur, c]);
    setQuery("");
    setOpen(false);
    setActiveIdx(0);
  }

  function removeCity(id: string) {
    setCities((cur) => cur.filter((c) => c.id !== id));
  }

  // Keyboard: arrows scrub
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      )
        return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.shiftKey ? 120 : 30;
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      setScrubMin((m) => {
        const base = m ?? nowMin;
        return Math.max(0, Math.min(1440, base + dir * step));
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowMin]);

  // Timeline scrubbing
  function pointerToMin(clientX: number) {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return ratio * 1440;
  }
  function startScrub(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setScrubMin(pointerToMin(e.clientX));
  }
  function moveScrub(e: React.PointerEvent) {
    if (e.buttons === 0) return;
    setScrubMin(pointerToMin(e.clientX));
  }

  // Drag-and-drop reorder
  function onCardDragStart(id: string) {
    setDragId(id);
  }
  function onCardDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setCities((cur) => {
      const from = cur.findIndex((c) => c.id === dragId);
      const to = cur.findIndex((c) => c.id === overId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="bg-header text-header-foreground shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-3">
          <Globe2 className="w-7 h-7 text-accent-blue" />
          <h1 className="text-xl font-semibold tracking-tight">
            Time-Zone Buddy
          </h1>
          <span className="ml-auto text-xs text-header-foreground/60 hidden sm:block">
            Compare local times across cities, instantly.
          </span>
          <div className="ml-auto sm:ml-4 flex items-center gap-1 text-xs bg-white/10 rounded-full p-1">
            <button
              onClick={() => setUse12h(false)}
              className={cn(
                "px-2.5 py-1 rounded-full transition",
                !use12h ? "bg-accent-blue text-white" : "text-header-foreground/70 hover:text-header-foreground",
              )}
              aria-pressed={!use12h}
            >
              24h
            </button>
            <button
              onClick={() => setUse12h(true)}
              className={cn(
                "px-2.5 py-1 rounded-full transition",
                use12h ? "bg-accent-blue text-white" : "text-header-foreground/70 hover:text-header-foreground",
              )}
              aria-pressed={use12h}
            >
              12h
            </button>
          </div>
        </div>
      </header>

      {/* Search */}
      <section className="bg-header/95 text-header-foreground pb-6">
        <div className="max-w-2xl mx-auto px-6 -mt-1 relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-header-foreground/50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActiveIdx(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter" && suggestions[activeIdx]) {
                  addCity(suggestions[activeIdx]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search a city (e.g. Tokyo, Berlin, São Paulo)…"
              className="w-full rounded-2xl pl-12 pr-4 py-4 bg-white/10 backdrop-blur placeholder:text-header-foreground/50 text-header-foreground border border-white/10 focus:outline-none focus:ring-2 focus:ring-accent-blue transition"
            />
          </div>
          {open && suggestions.length > 0 && (
            <ul className="absolute left-6 right-6 mt-2 z-30 bg-card text-card-foreground rounded-xl shadow-xl border border-border overflow-hidden animate-fade-in">
              {suggestions.map((c, i) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addCity(c);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer",
                    i === activeIdx && "bg-muted",
                  )}
                >
                  <span className="text-xl leading-none">{c.flag}</span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {c.country}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {c.timezone}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Main */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {cities.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Timeline */}
            <div className="bg-card text-card-foreground rounded-2xl shadow-soft border border-border p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  Previewing →{" "}
                  <span className="font-medium text-foreground font-mono">
                    {formatUTC(previewedAt)}
                  </span>
                </div>
                <button
                  onClick={() => setScrubMin(null)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition"
                  aria-label="Reset to now"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Now
                </button>
              </div>

              <div
                ref={trackRef}
                onPointerDown={startScrub}
                onPointerMove={moveScrub}
                className="relative h-16 rounded-xl bg-track cursor-pointer touch-none select-none"
                role="slider"
                aria-label="Time scrubber"
                aria-valuemin={0}
                aria-valuemax={1440}
                aria-valuenow={Math.round(previewMin)}
                tabIndex={0}
              >
                {/* hour ticks */}
                {hours.map((h) => {
                  const major = h % 3 === 0;
                  return (
                    <div
                      key={h}
                      className={cn(
                        "absolute top-0 bottom-0 w-px",
                        major ? "bg-foreground/20" : "bg-foreground/10",
                      )}
                      style={{ left: `${(h / 24) * 100}%` }}
                    >
                      {major && (
                        <span className="absolute -top-5 -translate-x-1/2 text-[10px] font-mono text-muted-foreground">
                          {String(h).padStart(2, "0")}:00
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* now marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground/40 pointer-events-none"
                  style={{ left: `${(nowMin / 1440) * 100}%` }}
                  title="Now"
                />
                {/* scrubber */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `${(previewMin / 1440) * 100}%` }}
                >
                  <div className="absolute top-0 bottom-0 -translate-x-1/2 w-1 bg-accent-blue rounded-full shadow-glow" />
                  <div className="absolute -top-2 -translate-x-1/2 w-4 h-4 rounded-full bg-accent-blue shadow-glow" />
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Drag the timeline to scrub. Use ← / → to nudge 30 min, Shift +
                ← / → for 2 h.
              </p>
            </div>

            {/* City cards */}
            <ul className="space-y-3">
              {cities.map((c) => (
                <CityCard
                  key={c.id}
                  city={c}
                  previewedAt={previewedAt}
                  refKey={refKeyForUser}
                  use12h={use12h}
                  onRemove={() => removeCity(c.id)}
                  onDragStart={() => onCardDragStart(c.id)}
                  onDragOver={(e) => onCardDragOver(e, c.id)}
                  onDragEnd={() => setDragId(null)}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground">
        Built with the IANA timezone database · Daylight saving handled
        automatically.
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="relative w-40 h-40 mb-6">
        <div className="absolute inset-0 rounded-full bg-accent-blue/10 animate-pulse" />
        <div className="absolute inset-4 rounded-full border-4 border-accent-blue/40 border-t-accent-blue animate-spin-slow" />
        <Globe2 className="absolute inset-0 m-auto w-16 h-16 text-accent-blue" />
      </div>
      <h2 className="text-xl font-semibold mb-2">
        Add your first city to start comparing time
      </h2>
      <p className="text-muted-foreground max-w-md">
        Search above for any major city in the world. Pin as many as you like
        and scrub through the day to find the perfect meeting time.
      </p>
    </div>
  );
}

function CityCard({
  city,
  previewedAt,
  refKey,
  use12h,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  city: City;
  previewedAt: Date;
  refKey: string;
  use12h: boolean;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const lp = localParts(city.timezone, previewedAt);
  const display12 = ((lp.hour + 11) % 12) + 1;
  const ampm = lp.hour < 12 ? "AM" : "PM";
  const hh = use12h ? String(display12) : String(lp.hour).padStart(2, "0");
  const mm = String(lp.minute).padStart(2, "0");
  const isWork = lp.hour >= 9 && lp.hour < 17;
  const isNight = lp.hour >= 22 || lp.hour < 7;
  const day = dayLabel(lp.dateKey, refKey);

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      aria-label={`${city.name}, ${city.country}: ${hh}:${mm}${use12h ? ` ${ampm}` : ""} (${day})`}
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border border-border bg-card text-card-foreground px-5 py-4 shadow-soft transition-colors duration-300 animate-slide-in",
        isWork && "bg-work",
        isNight && "bg-night text-foreground/70",
      )}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="text-3xl leading-none">{city.flag}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{city.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {city.country} · {city.timezone}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-3xl tabular-nums tracking-tight">
          {hh}:{mm}
          {use12h && <span className="text-sm ml-1 text-muted-foreground">{ampm}</span>}
        </div>
        <div
          className={cn(
            "text-[10px] uppercase tracking-wider mt-0.5",
            day === "Today"
              ? "text-muted-foreground"
              : day === "Tomorrow"
                ? "text-accent-blue"
                : "text-orange-500",
          )}
        >
          {lp.weekday} · {day}
        </div>
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove ${city.name}`}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition flex items-center justify-center"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
