import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C } from "../theme";
import { sessionsInRange, sessionsForDay } from "../db/repo";
import { fmtMinutes, isoDate, playDay } from "../logic/derive";

export default function CalendarScreen() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const [selected, setSelected] = useState<string>(playDay());
  const [dayTotals, setDayTotals] = useState<Record<string, number>>({});
  const [daySessions, setDaySessions] = useState<
    ReturnType<typeof sessionsForDay>
  >([]);

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const reload = useCallback(() => {
    const rows = sessionsInRange(isoDate(first), isoDate(last));
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.date] = (totals[r.date] ?? 0) + r.minutes;
    setDayTotals(totals);
    setDaySessions(sessionsForDay(selected));
  }, [year, month, selected]);

  useFocusEffect(reload);

  const nav = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
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
        <Text style={{ color: C.textPrimary, fontSize: 17, fontWeight: "600" }}>
          {monthLabel}
        </Text>
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
              onPress={() => setSelected(date)}
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
  },
};
