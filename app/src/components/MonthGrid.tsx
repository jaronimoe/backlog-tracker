import React from "react";
import { Pressable, Text, View } from "react-native";
import { C, themedStyles } from "../theme";
import { fmtMinutes, playDay } from "../logic/derive";

/**
 * Month calendar grid (Monday-first) with playtime heat shading.
 * Shared by the global Calendar screen and the per-game session calendar.
 */
export function MonthGrid({
  year,
  month,
  dayTotals,
  selected,
  onSelectDay,
}: {
  year: number;
  month: number; // 0-based
  dayTotals: Record<string, number>;
  selected: string | null;
  onSelectDay: (date: string) => void;
}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
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
    <View style={g.grid}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <Text key={d} style={g.header}>
          {d}
        </Text>
      ))}
      {cells.map((day, i) => {
        if (day == null) return <View key={i} style={g.cell} />;
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`;
        const minutes = dayTotals[date] ?? 0;
        const intensity =
          minutes > 0 ? 0.08 + 0.5 * (minutes / maxMinutes) : 0;
        return (
          <Pressable
            key={i}
            style={[
              g.cell,
              {
                backgroundColor:
                  intensity > 0
                    ? `rgba(78,204,163,${intensity.toFixed(2)})`
                    : C.bgSecondary,
                borderWidth: date === today ? 2 : selected === date ? 1 : 0,
                borderColor: date === today ? C.accent : C.progressFill,
              },
            ]}
            onPress={() => onSelectDay(date)}
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
  );
}

const g = themedStyles(() => ({
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
}));
