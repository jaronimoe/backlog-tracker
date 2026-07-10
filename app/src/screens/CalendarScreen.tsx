import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { C, themedStyles } from "../theme";
import {
  sessionsInRange,
  sessionsForDay,
  startedCompletedInRange,
  RangeGameSummary,
} from "../db/repo";
import { fmtMinutes, isoDate, playDay } from "../logic/derive";
import { MonthGrid } from "../components/MonthGrid";
import { DayEvent, eventsByDay } from "../services/deviceCalendar";

type Scope = "day" | "month" | "year";

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const [selected, setSelected] = useState<string>(playDay());
  const [scope, setScope] = useState<Scope>("month");
  const [dayTotals, setDayTotals] = useState<Record<string, number>>({});
  const [daySessions, setDaySessions] = useState<
    ReturnType<typeof sessionsForDay>
  >([]);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [gameTotals, setGameTotals] = useState<
    { id: number; title: string; minutes: number }[]
  >([]);
  const [summary, setSummary] = useState<RangeGameSummary>({
    started: [],
    completed: [],
  });
  const [dayEvents, setDayEvents] = useState<Record<string, DayEvent[]>>({});

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // Range for the summary stats, driven by the active scope.
  const range = (): { from: string; to: string; label: string } => {
    if (scope === "day")
      return { from: selected, to: selected, label: selected };
    if (scope === "year")
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        label: String(year),
      };
    return {
      from: isoDate(first),
      to: isoDate(last),
      label: first.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    };
  };

  const reload = useCallback(() => {
    const rows = sessionsInRange(isoDate(first), isoDate(last));
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.date] = (totals[r.date] ?? 0) + r.minutes;
    setDayTotals(totals);
    const r = range();
    if (scope === "day") {
      const s = sessionsForDay(selected);
      setDaySessions(s);
      setGameTotals([]);
      setPeriodTotal(s.reduce((a, x) => a + x.minutes, 0));
    } else {
      const periodRows =
        scope === "month" ? rows : sessionsInRange(r.from, r.to);
      const byGame = new Map<
        number,
        { id: number; title: string; minutes: number }
      >();
      for (const s of periodRows) {
        const e = byGame.get(s.game_id);
        if (e) e.minutes += s.minutes;
        else
          byGame.set(s.game_id, {
            id: s.game_id,
            title: s.title,
            minutes: s.minutes,
          });
      }
      setDaySessions([]);
      setGameTotals(
        [...byGame.values()].sort((a, b) => b.minutes - a.minutes)
      );
      setPeriodTotal(periodRows.reduce((a, x) => a + x.minutes, 0));
    }
    setSummary(startedCompletedInRange(r.from, r.to));
    // Device calendar overlay — async, fails soft to {} when not linked.
    let cancelled = false;
    eventsByDay(isoDate(first), isoDate(last)).then((ev) => {
      if (!cancelled) setDayEvents(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [year, month, selected, scope]);

  useFocusEffect(reload);

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
          {range().label}
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
        <Text style={cal.summaryTitle}>Summary — {range().label}</Text>
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
