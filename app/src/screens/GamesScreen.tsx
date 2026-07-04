import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
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
  const [tagModal, setTagModal] = useState(false);

  const today = playDay();
  const cfg = windowConfig();
  const searching = query.trim().length > 0;

  const reload = useCallback(() => {
    setGames(allGames());
    setTodaySessions(sessionsForDay(today));
  }, [today]);

  useFocusEffect(reload);

  // Top 6 platforms ranked by number of games carrying that platform tag.
  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    games.forEach((g) =>
      g.tags
        .filter((t) => t.startsWith("platform:"))
        .forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [games]);

  // Every tag present in the library, grouped by type, for the filter modal.
  const tagGroups = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    games.forEach((g) =>
      g.tags.forEach((t) => {
        const type = splitTag(t).type ?? "other";
        if (!groups.has(type)) groups.set(type, new Set());
        groups.get(type)!.add(t);
      })
    );
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, set]) => ({ type, tags: [...set].sort() }));
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <FilterChip label="All" active={filter === null} onPress={() => setFilter(null)} />
          {platforms.map((p) => (
            <FilterChip
              key={p}
              label={splitTag(p).value}
              active={filter === p}
              onPress={() => setFilter(filter === p ? null : p)}
            />
          ))}
          <FilterChip
            label={
              filter && !platforms.includes(filter)
                ? `🔍 ${splitTag(filter).value}`
                : "🔍 Filter"
            }
            active={filter != null && !platforms.includes(filter)}
            onPress={() => setTagModal(true)}
          />
        </View>
      </ScrollView>

      {/* all-tags filter modal */}
      <Modal
        visible={tagModal}
        transparent
        animationType="fade"
        onRequestClose={() => setTagModal(false)}
      >
        <Pressable style={ft.overlay} onPress={() => setTagModal(false)}>
          <Pressable style={ft.sheet} onPress={() => {}}>
            <View style={ft.sheetHeader}>
              <Text style={ft.sheetTitle}>Filter by tag</Text>
              <Pressable onPress={() => setTagModal(false)}>
                <Text style={{ color: C.accent, fontSize: 14 }}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 440 }}>
              <FilterChip
                label="Clear filter"
                active={filter === null}
                onPress={() => {
                  setFilter(null);
                  setTagModal(false);
                }}
              />
              {tagGroups.map(({ type, tags }) => (
                <View key={type} style={{ marginTop: 14 }}>
                  <Text style={ft.groupTitle}>{type.toUpperCase()}</Text>
                  <View style={ft.chipWrap}>
                    {tags.map((tag) => (
                      <FilterChip
                        key={tag}
                        label={splitTag(tag).value}
                        active={filter === tag}
                        onPress={() => {
                          setFilter(filter === tag ? null : tag);
                          setTagModal(false);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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

const ft = {
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end" as const,
  },
  sheet: {
    backgroundColor: C.bgSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  sheetTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "700" as const,
  },
  groupTitle: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
};

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
