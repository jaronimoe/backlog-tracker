import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C, themedStyles } from "../theme";
import { ProgressBar, Stars } from "../components/ui";
import { FilterChip } from "./GamesScreen";
import {
  allTimeFaves,
  favesByYear,
  genreDistribution,
  longestToComplete,
  Range,
  ranking,
  totalPlaytime,
  wrapItUp,
} from "../db/stats";
import { fmtMinutes } from "../logic/derive";
import { allGames } from "../db/repo";

const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All Time" },
];

const GENRE_COLORS = ["#e94560", "#4ecca3", "#533483", "#ffd700", "#00b4d8", "#6a6a7a"];

export default function StatsScreen({ navigation }: any) {
  const [tick, setTick] = useState(0);
  const [playRange, setPlayRange] = useState<Range>("all");
  const [sessRange, setSessRange] = useState<Range>("all");
  const [genreRange, setGenreRange] = useState<Range>("all");

  useFocusEffect(useCallback(() => setTick((t) => t + 1), []));

  // Fetch the enriched game list once per focus and derive everything from
  // it; memoized so tapping a range chip doesn't recompute unrelated cards.
  const games = useMemo(() => allGames(), [tick]);
  const totals = useMemo(
    () => ({
      week: totalPlaytime("week"),
      month: totalPlaytime("month"),
      year: totalPlaytime("year"),
      all: totalPlaytime("all"),
    }),
    [tick]
  );
  const byTime = useMemo(() => ranking(playRange), [tick, playRange]);
  const bySessions = useMemo(
    () => [...ranking(sessRange)].sort((a, b) => b.sessions - a.sessions),
    [tick, sessRange]
  );
  const genres = useMemo(
    () => genreDistribution(genreRange),
    [tick, genreRange]
  );
  const longest = useMemo(() => longestToComplete(games), [games]);
  const wrap = useMemo(() => wrapItUp(games).slice(0, 10), [games]);
  const faves = useMemo(() => allTimeFaves(games).slice(0, 10), [games]);
  const yearFaves = useMemo(() => favesByYear(3, games), [games]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 16 }}>
        Stats
      </Text>

      {/* playtime overview */}
      <Card title="Playtime Overview">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {RANGES.map((r) => (
            <View key={r.key} style={st.statCard}>
              <Text style={st.statValue}>{fmtMinutes(totals[r.key])}</Text>
              <Text style={st.statLabel}>{r.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* all-time favourites */}
      <Card title="🌟 All-Time Favourites">
        {faves.length === 0 ? (
          <EmptyFaves />
        ) : (
          faves.map((g, i) => (
            <Pressable
              key={g.id}
              style={st.rankRow}
              onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            >
              <Text style={[st.rankNum, i < 3 && { color: [C.gold, C.silver, C.bronze][i] }]}>
                {i + 1}
              </Text>
              <Text style={st.rankGame} numberOfLines={1}>{g.title}</Text>
              <Stars rating={g.rating} />
              <Text style={st.rankMeta}>{fmtMinutes(g.totalMinutes)}</Text>
            </Pressable>
          ))
        )}
      </Card>

      {/* favourites per year */}
      <Card title="🗓 Favourites by Year">
        {yearFaves.length === 0 ? (
          <EmptyFaves />
        ) : (
          yearFaves.map(({ year, games }) => (
            <View key={year} style={{ marginBottom: 8 }}>
              <Text style={st.yearLabel}>{year}</Text>
              {games.map((g) => (
                <Pressable
                  key={g.id}
                  style={st.rankRow}
                  onPress={() => navigation.navigate("GameDetail", { id: g.id })}
                >
                  <Text style={st.rankGame} numberOfLines={1}>{g.title}</Text>
                  <Stars rating={g.rating} />
                </Pressable>
              ))}
            </View>
          ))
        )}
      </Card>

      {/* wrap it up */}
      <Card title="🏁 Wrap It Up — closest to done">
        {wrap.length === 0 ? (
          <Empty />
        ) : (
          wrap.map((g) => (
            <Pressable
              key={g.id}
              style={st.rankRow}
              onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            >
              <Text style={st.rankGame} numberOfLines={1}>{g.title}</Text>
              <ProgressBar percent={g.progress} width={90} />
              <Text style={st.rankMeta}>{g.lastPlayed ?? "never"}</Text>
            </Pressable>
          ))
        )}
      </Card>

      {/* rankings: playtime */}
      <Card title="Game Rankings — Playtime">
        <RangePicker value={playRange} onChange={setPlayRange} />
        {byTime.length === 0 ? <Empty /> : byTime.slice(0, 10).map((r, i) => (
          <View key={r.game_id} style={st.rankRow}>
            <Text style={[st.rankNum, i < 3 && { color: [C.gold, C.silver, C.bronze][i] }]}>
              {i + 1}
            </Text>
            <Text style={st.rankGame} numberOfLines={1}>{r.title}</Text>
            <Text style={st.rankValue}>{fmtMinutes(r.minutes)}</Text>
            <Text style={st.rankMeta}>{r.sessions} sessions</Text>
          </View>
        ))}
      </Card>

      {/* rankings: sessions */}
      <Card title="Game Rankings — Times Played">
        <RangePicker value={sessRange} onChange={setSessRange} />
        {bySessions.length === 0 ? <Empty /> : bySessions.slice(0, 10).map((r, i) => (
          <View key={r.game_id} style={st.rankRow}>
            <Text style={[st.rankNum, i < 3 && { color: [C.gold, C.silver, C.bronze][i] }]}>
              {i + 1}
            </Text>
            <Text style={st.rankGame} numberOfLines={1}>{r.title}</Text>
            <Text style={st.rankValue}>{r.sessions}</Text>
            <Text style={st.rankMeta}>sessions</Text>
          </View>
        ))}
      </Card>

      {/* genre distribution */}
      <Card title="Genre Distribution">
        <RangePicker value={genreRange} onChange={setGenreRange} />
        {genres.length === 0 ? <Empty /> : genres.map((g, i) => (
          <View key={g.genre} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={{ color: C.textSecondary, fontSize: 12, width: 100 }} numberOfLines={1}>
              {g.genre}
            </Text>
            <View style={{ flex: 1, height: 8, backgroundColor: C.progressBg, borderRadius: 4 }}>
              <View style={{
                width: `${g.pct}%`,
                height: "100%",
                borderRadius: 4,
                backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length],
              }} />
            </View>
            <Text style={{ color: C.textMuted, fontSize: 11, width: 34, textAlign: "right" }}>
              {g.pct}%
            </Text>
          </View>
        ))}
      </Card>

      {/* longest to complete */}
      <Card title="⏳ Longest to Complete (calendar days)">
        {longest.length === 0 ? <Empty /> : longest.slice(0, 10).map((e, i) => (
          <View key={e.game.id} style={st.rankRow}>
            <Text style={st.rankNum}>{i + 1}</Text>
            <Text style={st.rankGame} numberOfLines={1}>{e.game.title}</Text>
            <Text style={st.rankValue}>
              {e.fuzzy ? "~" : ""}{e.days}d
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <Text style={{ color: C.textPrimary, fontSize: 15, fontWeight: "600", marginBottom: 12 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
      {RANGES.map((r) => (
        <FilterChip key={r.key} label={r.label} active={value === r.key} onPress={() => onChange(r.key)} />
      ))}
    </View>
  );
}

function Empty() {
  return <Text style={{ color: C.textMuted, fontSize: 12 }}>No data yet.</Text>;
}

function EmptyFaves() {
  return (
    <Text style={{ color: C.textMuted, fontSize: 12 }}>
      Rate games with ★ on their page to see favourites here.
    </Text>
  );
}

const st = themedStyles(() => ({
  statCard: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderRadius: 8,
    padding: 10,
    alignItems: "center" as const,
  },
  statValue: { color: C.progressFill, fontSize: 15, fontWeight: "700" as const },
  statLabel: { color: C.textMuted, fontSize: 9, marginTop: 3 },
  rankRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 7,
  },
  rankNum: { color: C.textMuted, fontSize: 14, fontWeight: "700" as const, width: 20 },
  rankGame: { color: C.textPrimary, fontSize: 13, flex: 1 },
  rankValue: { color: C.progressFill, fontSize: 13, fontWeight: "600" as const },
  rankMeta: { color: C.textMuted, fontSize: 10 },
  yearLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    marginTop: 2,
  },
}));
