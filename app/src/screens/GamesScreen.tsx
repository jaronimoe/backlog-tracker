import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C } from "../theme";
import { GameRow, Input, Section } from "../components/ui";
import { SessionLogModal } from "../components/SessionLogModal";
import { allGames, sessionsForDay, windowConfig } from "../db/repo";
import {
  fmtMinutes,
  isRecentlyPlayed,
  playDay,
  splitTag,
} from "../logic/derive";
import { GameWithMeta, StateGroup } from "../types";

const GROUPS: { key: StateGroup; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "backlog_started", label: "Backlog (started)" },
  { key: "backlog", label: "Backlog" },
  { key: "on_hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
];

export default function GamesScreen({ navigation }: any) {
  const [games, setGames] = useState<GameWithMeta[]>([]);
  const [todaySessions, setTodaySessions] = useState<
    ReturnType<typeof sessionsForDay>
  >([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [logGame, setLogGame] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const today = playDay();
  const cfg = windowConfig();
  const searching = query.trim().length > 0;

  const reload = useCallback(() => {
    setGames(allGames());
    setTodaySessions(sessionsForDay(today));
  }, [today]);

  useFocusEffect(reload);

  const genres = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) =>
      g.tags.filter((t) => t.startsWith("genre:")).forEach((t) => set.add(t))
    );
    return [...set].sort();
  }, [games]);

  const visible = useMemo(
    () =>
      games.filter(
        (g) =>
          (!searching ||
            g.title.toLowerCase().includes(query.trim().toLowerCase())) &&
          (!filter || g.tags.includes(filter))
      ),
    [games, query, searching, filter]
  );

  const recent = visible
    .filter((g) => isRecentlyPlayed(g.lastPlayed, cfg.recentDays))
    .sort((a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""));

  // Recently Played and Current are mutually exclusive:
  // a game shown in Recently Played is hidden from its group section.
  const recentIds = new Set(recent.map((g) => g.id));

  const byGroup = (key: StateGroup) =>
    visible
      .filter(
        (g) => g.group === key && !(key === "current" && recentIds.has(g.id))
      )
      .sort((a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""));

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        <View>
          <Text style={{ color: C.textPrimary, fontSize: 24, fontWeight: "700" }}>
            Games
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: 13 }}>{dateLabel}</Text>
        </View>
        <Pressable
          style={{
            backgroundColor: C.accent,
            borderRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
          onPress={() => navigation.navigate("AddGame")}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
            + Add Game
          </Text>
        </Pressable>
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search games..."
        style={{ marginBottom: 12 }}
      />

      {/* filter bar */}
      {genres.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            <FilterChip label="All" active={filter === null} onPress={() => setFilter(null)} />
            {genres.map((g) => (
              <FilterChip
                key={g}
                label={splitTag(g).value}
                active={filter === g}
                onPress={() => setFilter(filter === g ? null : g)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Played Today (hidden while searching) */}
      {!searching && (
        <View style={t.dropZone}>
          <Text style={t.dropTitle}>🎮 Played Today</Text>
          {todaySessions.length === 0 ? (
            <Text style={t.dropHint}>
              Nothing yet — tap ▶ on a game to log a session
            </Text>
          ) : (
            todaySessions.map((sess) => (
              <Pressable
                key={sess.id}
                style={t.todayGame}
                onPress={() => setLogGame(sess.game_id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.textPrimary, fontWeight: "600", fontSize: 14 }}>
                    {sess.title}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {fmtMinutes(sess.minutes)} today
                    {sess.note ? ` — ${sess.note}` : ""}
                  </Text>
                </View>
                <Text style={{ color: C.accent, fontSize: 12 }}>Edit</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Recently Played */}
      <Section
        title={`Recently Played (last ${cfg.recentDays} days)`}
        count={recent.length}
        open={searching || (open["recent"] ?? true)}
        onToggle={() => setOpen((o) => ({ ...o, recent: !(o.recent ?? true) }))}
      >
        {recent.map((g) => (
          <GameRow
            key={g.id}
            game={g}
            onPress={() => navigation.navigate("GameDetail", { id: g.id })}
            onPlayedToday={() => setLogGame(g.id)}
          />
        ))}
      </Section>

      {GROUPS.map(({ key, label }) => {
        const list = byGroup(key);
        return (
          <Section
            key={key}
            title={label}
            count={list.length}
            open={searching || (open[key] ?? false)}
            onToggle={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
          >
            {list.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                onPress={() => navigation.navigate("GameDetail", { id: g.id })}
                onPlayedToday={() => setLogGame(g.id)}
              />
            ))}
          </Section>
        );
      })}

      <SessionLogModal
        gameId={logGame}
        visible={logGame != null}
        onClose={(changed) => {
          setLogGame(null);
          if (changed) reload();
        }}
      />
    </ScrollView>
  );
}

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: active ? C.accent : C.bgCard,
      }}
    >
      <Text style={{ color: active ? "#fff" : C.textSecondary, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const t = {
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed" as const,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "rgba(233,69,96,0.03)",
  },
  dropTitle: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  dropHint: { color: C.textMuted, fontSize: 12 },
  todayGame: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: C.bgCard,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
};
