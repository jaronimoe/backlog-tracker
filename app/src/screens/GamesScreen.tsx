import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C, themedStyles } from "../theme";
import { GameRow, Input, SectionHeader } from "../components/ui";
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

const DEFAULT_OPEN: Record<string, boolean> = { recent: true };

// The list is flattened (section headers + game rows) so a single
// virtualized FlatList renders it — only rows near the viewport mount.
type ListItem =
  | {
      type: "section";
      key: string;
      title: string;
      count: number;
      open: boolean;
      first: boolean;
    }
  | { type: "game"; section: string; game: GameWithMeta };

export default function GamesScreen({ navigation }: any) {
  const [games, setGames] = useState<GameWithMeta[]>([]);
  const [todaySessions, setTodaySessions] = useState<
    ReturnType<typeof sessionsForDay>
  >([]);
  const [cfg, setCfg] = useState(windowConfig);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [logGame, setLogGame] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState(false);

  const today = playDay();
  const searching = query.trim().length > 0;

  const reload = useCallback(() => {
    setGames(allGames());
    setTodaySessions(sessionsForDay(today));
    setCfg(windowConfig());
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesFilter = (g: GameWithMeta) => {
      if (!filter) return true;
      if (filter.startsWith("rating:"))
        return g.rating === parseInt(filter.slice(7), 10);
      return g.tags.includes(filter);
    };
    return games.filter(
      (g) =>
        (!searching || g.title.toLowerCase().includes(q)) && matchesFilter(g)
    );
  }, [games, query, searching, filter]);

  const items = useMemo<ListItem[]>(() => {
    const byRecency = (a: GameWithMeta, b: GameWithMeta) =>
      (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "");

    const recent = visible
      .filter((g) => isRecentlyPlayed(g.lastPlayed, cfg.recentDays))
      .sort(byRecency);
    // Recently Played and Current are mutually exclusive:
    // a game shown in Recently Played is hidden from its group section.
    const recentIds = new Set(recent.map((g) => g.id));

    const out: ListItem[] = [];
    const push = (key: string, title: string, list: GameWithMeta[]) => {
      const isOpen = searching || (open[key] ?? DEFAULT_OPEN[key] ?? false);
      out.push({
        type: "section",
        key,
        title,
        count: list.length,
        open: isOpen,
        first: out.length === 0,
      });
      if (isOpen)
        for (const g of list) out.push({ type: "game", section: key, game: g });
    };

    push(
      "recent",
      `Recently Played (last ${cfg.recentDays} days)`,
      recent
    );
    for (const { key, label } of GROUPS)
      push(
        key,
        label,
        visible
          .filter(
            (g) =>
              g.group === key && !(key === "current" && recentIds.has(g.id))
          )
          .sort(byRecency)
      );
    return out;
  }, [visible, open, searching, cfg.recentDays]);

  const toggleSection = useCallback((key: string) => {
    setOpen((o) => ({ ...o, [key]: !(o[key] ?? DEFAULT_OPEN[key] ?? false) }));
  }, []);

  const keyExtractor = useCallback(
    (item: ListItem) =>
      item.type === "section"
        ? `s:${item.key}`
        : `g:${item.section}:${item.game.id}`,
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "section")
        return (
          <SectionHeader
            title={item.title}
            count={item.count}
            open={item.open}
            onToggle={() => toggleSection(item.key)}
            style={item.first ? undefined : { marginTop: 8 }}
          />
        );
      return (
        <GameRow
          game={item.game}
          onPress={() => navigation.navigate("GameDetail", { id: item.game.id })}
          onPlayedToday={() => setLogGame(item.game.id)}
        />
      );
    },
    [navigation, toggleSection]
  );

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Passed as an element (not a component) so the search TextInput is
  // reconciled in place and keeps focus while typing.
  const header = (
    <View>
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
                ? `🔍 ${
                    filter.startsWith("rating:")
                      ? "★".repeat(parseInt(filter.slice(7), 10))
                      : splitTag(filter).value
                  }`
                : "🔍 Filter"
            }
            active={filter != null && !platforms.includes(filter)}
            onPress={() => setTagModal(true)}
          />
        </View>
      </ScrollView>

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
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={20}
        windowSize={9}
        removeClippedSubviews
      />

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
              <View style={{ marginTop: 14 }}>
                <Text style={ft.groupTitle}>RATING</Text>
                <View style={ft.chipWrap}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <FilterChip
                      key={n}
                      label={"★".repeat(n)}
                      active={filter === `rating:${n}`}
                      onPress={() => {
                        setFilter(filter === `rating:${n}` ? null : `rating:${n}`);
                        setTagModal(false);
                      }}
                    />
                  ))}
                </View>
              </View>
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

      <SessionLogModal
        gameId={logGame}
        visible={logGame != null}
        onClose={(changed) => {
          setLogGame(null);
          if (changed) reload();
        }}
      />
    </View>
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

const ft = themedStyles(() => ({
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
}));

const t = themedStyles(() => ({
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
}));
