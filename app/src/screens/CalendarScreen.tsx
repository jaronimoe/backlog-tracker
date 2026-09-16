import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { C, themedStyles } from "../theme";
import {
  sessionsInRange,
  startedCompletedInRange,
  RangeGameSummary,
} from "../db/repo";
import { fmtMinutes, isoDate, playDay } from "../logic/derive";
import { MonthGrid } from "../components/MonthGrid";
import { DayEvent, eventsByDay } from "../services/deviceCalendar";

type Scope = "day" | "month" | "year";
type SessionRow = ReturnType<typeof sessionsInRange>[number];
type GameTotal = { id: number; title: string; minutes: number };

const EMPTY_SUMMARY: RangeGameSummary = { started: [], completed: [] };

/** Sum a period's sessions into one row per game, biggest first. */
function totalsByGame(rows: SessionRow[]): GameTotal[] {
  const byGame = new Map<number, GameTotal>();
  for (const s of rows) {
    const e = byGame.get(s.game_id);
    if (e) e.minutes += s.minutes;
    else byGame.set(s.game_id, { id: s.game_id, title: s.title, minutes: s.minutes });
  }
  return [...byGame.values()].sort((a, b) => b.minutes - a.minutes);
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const [selected, setSelected] = useState<string>(playDay());
  const [scope, setScope] = useState<Scope>("month");

  // Sessions change on other screens, so every focus bumps this counter and
  // the query effects below re-run. In-screen changes are handled by their own
  // dependencies — tapping a day must not re-query the month.
  const [tick, setTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const [monthRows, setMonthRows] = useState<SessionRow[]>([]);
  const [monthSummary, setMonthSummary] =
    useState<RangeGameSummary>(EMPTY_SUMMARY);
  const [yearRows, setYearRows] = useState<SessionRow[]>([]);
  const [yearSummary, setYearSummary] =
    useState<RangeGameSummary>(EMPTY_SUMMARY);
  const [daySummary, setDaySummary] =
    useState<RangeGameSummary>(EMPTY_SUMMARY);
  const [dayEvents, setDayEvents] = useState<Record<string, DayEvent[]>>({});

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const monthFrom = isoDate(first);
  const monthTo = isoDate(last);
  const yearFrom = `${year}-01-01`;
  const yearTo = `${year}-12-31`;

  // 1. Month data — feeds the grid always, and the lists while scope is month.
  //    Re-runs on month/year navigation and on focus only.
  useEffect(() => {
    setMonthRows(sessionsInRange(monthFrom, monthTo));
    setMonthSummary(startedCompletedInRange(monthFrom, monthTo));
    // Device calendar overlay — async, fails soft to {} when not linked.
    let cancelled = false;
    eventsByDay(monthFrom, monthTo).then((ev) => {
      if (!cancelled) setDayEvents(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [monthFrom, monthTo, tick]);

  // 2. Year data — only fetched while the year scope is showing.
  useEffect(() => {
    if (scope !== "year") return;
    setYearRows(sessionsInRange(yearFrom, yearTo));
    setYearSummary(startedCompletedInRange(yearFrom, yearTo));
  }, [yearFrom, yearTo, scope, tick]);

  // 3. Day data — the only query a day tap costs. The day's sessions
  //    themselves are filtered out of monthRows below.
  useEffect(() => {
    if (scope !== "day") return;
    setDaySummary(startedCompletedInRange(selected, selected));
  }, [selected, scope, tick]);

  // ---- derived from the state above; no queries ----

  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of monthRows) totals[r.date] = (totals[r.date] ?? 0) + r.minutes;
    return totals;
  }, [monthRows]);

  // While scope is "day", `selected` is always inside the displayed month:
  // the arrows leave day scope and Today moves the month with the selection.
  const daySessions = useMemo(
    () =>
      monthRows
        .filter((r) => r.date === selected)
        .sort((a, b) => b.minutes - a.minutes),
    [monthRows, selected]
  );

  const periodRows = scope === "year" ? yearRows : monthRows;

  const gameTotals = useMemo<GameTotal[]>(
    () => (scope === "day" ? [] : totalsByGame(periodRows)),
    [periodRows, scope]
  );

  const periodTotal = useMemo(
    () =>
      (scope === "day" ? daySessions : periodRows).reduce(
        (a, x) => a + x.minutes,
        0
      ),
    [scope, daySessions, periodRows]
  );

  const summary =
    scope === "day" ? daySummary : scope === "year" ? yearSummary : monthSummary;

  // Heading for the active scope.
  const rangeLabel =
    scope === "day"
      ? selected
      : scope === "year"
      ? String(year)
      : first.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });

  const nav = (delta: number) => {
    // Arrows only navigate months/years; from day mode they jump to month mode.
    const effScope = scope === "day" ? "month" : scope;
    if (scope === "day") setScope("month");
    const step = effScope === "year" ? delta * 12 : delta;
    const d = new Date(year, month + step, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const jumpToToday = () => {
    const t = playDay();
    setYear(Number(t.slice(0, 4)));
    setMonth(Number(t.slice(5, 7)) - 1);
    setSelected(t);
  };

  // Games both started and completed within the current range.
  const completedIds = new Set(summary.completed.map((g) => g.id));
  const wrappedIds = new Set(
    summary.started.filter((g) => completedIds.has(g.id)).map((g) => g.id)
  );

  const monthName = first.toLocaleDateString(undefined, { month: "long" });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View style={cal.nav}>
        <Pressable style={cal.navBtn} onPress={() => nav(-1)}>
          <Text style={{ color: C.textPrimary }}>←</Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => setScope("month")} hitSlop={6}>
            <Text style={[cal.hdrLabel, scope === "month" && cal.hdrActive]}>
              {monthName}
            </Text>
          </Pressable>
          <Text style={cal.hdrLabel}> </Text>
          <Pressable onPress={() => setScope("year")} hitSlop={6}>
            <Text style={[cal.hdrLabel, scope === "year" && cal.hdrActive]}>
              {year}
            </Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={cal.navBtn} onPress={jumpToToday}>
            <Text style={{ color: C.textPrimary, fontSize: 12 }}>Today</Text>
          </Pressable>
          <Pressable style={cal.navBtn} onPress={() => nav(1)}>
            <Text style={{ color: C.textPrimary }}>→</Text>
          </Pressable>
        </View>
      </View>

      <MonthGrid
        year={year}
        month={month}
        dayTotals={dayTotals}
        selected={selected}
        onSelectDay={(date) => {
          setSelected(date);
          setScope("day");
        }}
        dayEvents={dayEvents}
      />

      <View style={cal.detail}>
        <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 10 }}>
          {rangeLabel}
          {periodTotal > 0 ? ` — ${fmtMinutes(periodTotal)} total` : ""}
        </Text>
        {scope === "day" && (dayEvents[selected]?.length ?? 0) > 0 && (
          <View style={{ marginBottom: 8 }}>
            {dayEvents[selected].map((ev, i) => (
              <Text
                key={i}
                style={{
                  color: C.textMuted,
                  fontSize: 11,
                  fontStyle: "italic",
                  opacity: 0.8,
                }}
              >
                📅 {ev.title}
                {ev.allDay ? "" : " (timed)"}
              </Text>
            ))}
          </View>
        )}
        {scope === "day" ? (
          daySessions.length === 0 ? (
            <Text style={{ color: C.textMuted, fontSize: 12 }}>No sessions.</Text>
          ) : (
            daySessions.map((sess) => (
              <View key={sess.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: C.textPrimary, fontSize: 13 }}>{sess.title}</Text>
                  <Text style={{ color: C.progressFill, fontSize: 13, fontWeight: "600" }}>
                    {fmtMinutes(sess.minutes)}
                  </Text>
                </View>
                {sess.note && (
                  <Text style={{ color: C.textSecondary, fontSize: 11 }}>{sess.note}</Text>
                )}
              </View>
            ))
          )
        ) : gameTotals.length === 0 ? (
          <Text style={{ color: C.textMuted, fontSize: 12 }}>No sessions.</Text>
        ) : (
          gameTotals.map((g) => (
            <Pressable
              key={g.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
              onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            >
              <Text style={{ color: C.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>
                {g.title}
              </Text>
              <Text style={{ color: C.progressFill, fontSize: 13, fontWeight: "600" }}>
                {fmtMinutes(g.minutes)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={cal.detail}>
        <Text style={cal.summaryTitle}>Summary — {rangeLabel}</Text>
        <View style={cal.summaryRow}>
          <Text style={cal.statNum}>{summary.started.length}</Text>
          <Text style={cal.statLabel}>started</Text>
          <View style={{ width: 20 }} />
          <Text style={cal.statNum}>{summary.completed.length}</Text>
          <Text style={cal.statLabel}>completed</Text>
        </View>

        <Text style={cal.subhead}>Started</Text>
        {summary.started.length === 0 ? (
          <Text style={cal.empty}>None in this period.</Text>
        ) : (
          summary.started.map((g) => (
            <Pressable
              key={`s${g.id}`}
              style={cal.gameRow}
              onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            >
              <Text
                style={[cal.gameTitle, wrappedIds.has(g.id) && cal.wrapped]}
              >
                {g.title}
              </Text>
              <Text
                style={[
                  cal.gameDate,
                  wrappedIds.has(g.id) && { color: C.gold },
                ]}
              >
                {g.date.slice(0, 10)}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={cal.subhead}>Completed</Text>
        {summary.completed.length === 0 ? (
          <Text style={cal.empty}>None in this period.</Text>
        ) : (
          summary.completed.map((g) => (
            <Pressable
              key={`c${g.id}`}
              style={cal.gameRow}
              onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            >
              <Text
                style={[cal.gameTitle, wrappedIds.has(g.id) && cal.wrapped]}
              >
                {g.title}
              </Text>
              <Text
                style={[
                  cal.gameDate,
                  { color: wrappedIds.has(g.id) ? C.gold : C.progressFill },
                ]}
              >
                {g.date.slice(0, 10)}
              </Text>
            </Pressable>
          ))
        )}
        {wrappedIds.size > 0 && (
          <Text style={cal.legend}>
            ★ gold = started & completed in this period
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const cal = themedStyles(() => ({
  nav: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 14,
  },
  navBtn: {
    backgroundColor: C.bgCard,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  detail: {
    backgroundColor: C.bgSecondary,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  hdrLabel: {
    color: C.textMuted,
    fontSize: 17,
    fontWeight: "600" as const,
  },
  hdrActive: {
    color: C.textPrimary,
    textDecorationLine: "underline" as const,
  },
  summaryTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    marginBottom: 12,
  },
  statNum: {
    color: C.progressFill,
    fontSize: 20,
    fontWeight: "700" as const,
    marginRight: 5,
  },
  statLabel: {
    color: C.textSecondary,
    fontSize: 12,
  },
  subhead: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    marginTop: 8,
    marginBottom: 4,
  },
  empty: {
    color: C.textMuted,
    fontSize: 12,
  },
  gameRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 4,
  },
  gameTitle: {
    color: C.textPrimary,
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  gameDate: {
    color: C.textMuted,
    fontSize: 11,
  },
  wrapped: {
    color: C.gold,
    fontWeight: "600" as const,
  },
  legend: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 10,
    fontStyle: "italic" as const,
  },
}));
