import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { C } from "../theme";
import {
  sessionsInRange,
  sessionsForDay,
  startedCompletedInRange,
  RangeGameSummary,
} from "../db/repo";
import { fmtMinutes, isoDate, playDay } from "../logic/derive";

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
  const [summary, setSummary] = useState<RangeGameSummary>({
    started: [],
    completed: [],
  });

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
    setDaySessions(sessionsForDay(selected));
    const r = range();
    setSummary(startedCompletedInRange(r.from, r.to));
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

  const monthName = first.toLocaleDateString(undefined, { month: "long" });
  const startPad = (first.getDay() + 6) % 7; // Monday first
  const days = last.getDate();
  const maxMinutes = Math.max(60, ...Object.values(dayTotals));
  const today = playDay();

  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

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
        <Pressable style={cal.navBtn} onPress={() => nav(1)}>
          <Text style={{ color: C.textPrimary }}>→</Text>
        </Pressable>
      </View>

      <View style={cal.grid}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <Text key={d} style={cal.header}>
            {d}
          </Text>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <View key={i} style={cal.cell} />;
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(
            day
          ).padStart(2, "0")}`;
          const minutes = dayTotals[date] ?? 0;
          const intensity = minutes > 0 ? 0.08 + 0.5 * (minutes / maxMinutes) : 0;
          return (
            <Pressable
              key={i}
              style={[
                cal.cell,
                {
                  backgroundColor:
                    intensity > 0
                      ? `rgba(78,204,163,${intensity.toFixed(2)})`
                      : C.bgSecondary,
                  borderWidth: date === today ? 2 : selected === date ? 1 : 0,
                  borderColor: date === today ? C.accent : C.progressFill,
                },
              ]}
              onPress={() => {
                setSelected(date);
                setScope("day");
              }}
            >
              <Text style={{ color: C.textPrimary, fontSize: 10 }}>{day}</Text>
              {minutes > 0 && (
                <Text style={{ color: C.textMuted, fontSize: 8 }}>
                  {fmtMinutes(minutes)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={cal.detail}>
        <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 10 }}>
          {selected}
          {daySessions.length > 0
            ? ` — ${fmtMinutes(daySessions.reduce((a, x) => a + x.minutes, 0))} total`
            : ""}
        </Text>
        {daySessions.length === 0 ? (
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
              <Text style={cal.gameTitle}>{g.title}</Text>
              <Text style={cal.gameDate}>{g.date.slice(0, 10)}</Text>
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
              <Text style={cal.gameTitle}>{g.title}</Text>
              <Text style={[cal.gameDate, { color: C.progressFill }]}>
                {g.date.slice(0, 10)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const cal = {
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
  grid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  },
  header: {
    width: `${100 / 7}%` as any,
    textAlign: "center" as const,
    color: C.textMuted,
    fontSize: 10,
    paddingVertical: 6,
  },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
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
};
