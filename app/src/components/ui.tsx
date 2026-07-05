import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, TAG_TYPE_COLORS } from "../theme";
import { GameWithMeta } from "../types";
import { fmtMinutes, isoDate, sortTags, splitTag } from "../logic/derive";

export function ProgressBar({
  percent,
  width = 100,
}: {
  percent: number;
  width?: number | "100%";
}) {
  const over = percent > 100;
  return (
    <View style={{ width }}>
      <View style={s.pbTrack}>
        <View
          style={[
            s.pbFill,
            {
              width: `${Math.min(100, percent)}%`,
              backgroundColor: over ? C.gold : C.progressFill,
            },
          ]}
        />
      </View>
      <Text style={s.pbLabel}>{Math.round(percent)}%</Text>
    </View>
  );
}

export function Tag({ tag, onLongPress }: { tag: string; onLongPress?: () => void }) {
  const { type, value } = splitTag(tag);
  const bg = type ? TAG_TYPE_COLORS[type] ?? C.accentSecondary : C.bgCard;
  return (
    <Pressable onLongPress={onLongPress}>
      <View style={[s.tag, { backgroundColor: bg }, !type && s.tagPlain]}>
        <Text style={s.tagText}>{value}</Text>
      </View>
    </Pressable>
  );
}

export function TagRow({
  tags,
  onLongPress,
}: {
  tags: string[];
  onLongPress?: (tag: string) => void;
}) {
  return (
    <View style={s.tagRow}>
      {sortTags(tags).map((t) => (
        <Tag key={t} tag={t} onLongPress={onLongPress ? () => onLongPress(t) : undefined} />
      ))}
    </View>
  );
}

/**
 * Five-star rating (1–5). Interactive when onRate is given:
 * tap a star to set the rating, tap the current rating again to clear it.
 */
export function Stars({
  rating,
  size = 13,
  onRate,
}: {
  rating: number | null;
  size?: number;
  onRate?: (r: number | null) => void;
}) {
  if (!onRate && !rating) return null;
  return (
    <View style={{ flexDirection: "row", gap: onRate ? 8 : 1 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = rating != null && n <= rating;
        const star = (
          <Text style={{ fontSize: size, color: filled ? C.gold : C.textMuted }}>
            {filled ? "★" : "☆"}
          </Text>
        );
        return onRate ? (
          <Pressable key={n} hitSlop={8} onPress={() => onRate(n === rating ? null : n)}>
            {star}
          </Pressable>
        ) : (
          <React.Fragment key={n}>{star}</React.Fragment>
        );
      })}
    </View>
  );
}

export function Cover({
  game,
  w = 36,
  h = 48,
}: {
  game: { title: string; cover_url: string | null };
  w?: number;
  h?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = game.title
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={[s.cover, { width: w, height: h }]}>
      {game.cover_url && !failed ? (
        <Image
          source={{ uri: game.cover_url }}
          style={{ width: w, height: h }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={s.coverText}>{initials}</Text>
      )}
    </View>
  );
}

export function GameRow({
  game,
  onPress,
  onPlayedToday,
  subtitle,
}: {
  game: GameWithMeta;
  onPress: () => void;
  onPlayedToday?: () => void;
  subtitle?: string;
}) {
  const meta =
    subtitle ??
    (game.lastPlayed
      ? `Last played: ${game.lastPlayed} • ${fmtMinutes(game.totalMinutes)} total`
      : game.totalMinutes > 0
      ? `${fmtMinutes(game.totalMinutes)} total`
      : "Not started");
  return (
    <Pressable style={s.row} onPress={onPress}>
      <Cover game={game} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {game.title}
          {game.streak > 1 ? `  🔥 ${game.streak}` : ""}
          {game.on_mind ? "  💭" : ""}
          {game.rating ? (
            <Text style={{ color: C.gold, fontSize: 11 }}>
              {"  " + "★".repeat(game.rating)}
            </Text>
          ) : null}
        </Text>
        <Text
          style={[s.rowMeta, game.on_hold ? { color: C.accent } : null]}
          numberOfLines={1}
        >
          {game.on_hold ? `On hold: "${game.on_hold_note}"` : meta}
        </Text>
      </View>
      {game.progress > 0 && <ProgressBar percent={game.progress} width={90} />}
      {onPlayedToday && (
        <Pressable style={s.playBtn} onPress={onPlayedToday}>
          <Text style={s.playBtnText}>▶</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable style={s.sectionHeader} onPress={onToggle}>
        <Text style={s.sectionArrow}>{open ? "▼" : "▶"}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionCount}>{count} games</Text>
      </Pressable>
      {open && <View>{children}</View>}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = "primary",
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  style?: object;
}) {
  return (
    <Pressable
      style={[kind === "primary" ? s.btnPrimary : s.btnSecondary, style]}
      onPress={onPress}
    >
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={C.textMuted}
      {...props}
      style={[s.input, props.style]}
    />
  );
}

/** Parse "YYYY", "YYYY-MM" or "YYYY-MM-DD" into a local Date (null if unparseable). */
function parseFlexibleDate(str: string): Date | null {
  const t = str.trim();
  let m;
  if ((m = t.match(/^(\d{4})$/))) return new Date(+m[1], 0, 1);
  if ((m = t.match(/^(\d{4})-(\d{2})$/))) return new Date(+m[1], +m[2] - 1, 1);
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
    return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

/**
 * A date entry field: a text input (so fuzzy values like "2021" still work)
 * paired with a native calendar picker button and a clear button.
 */
export function DateField({
  value,
  onChange,
  placeholder,
  maximumDate,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maximumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const current = parseFlexibleDate(value) ?? new Date();

  const handleChange = (_: unknown, d?: Date) => {
    if (Platform.OS !== "ios") setShow(false);
    if (d) onChange(isoDate(d));
  };

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Input
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          autoCapitalize="none"
          style={{ flex: 1 }}
        />
        <Pressable onPress={() => setShow((v) => !v)} style={s.dateIconBtn}>
          <Text style={{ fontSize: 18 }}>📅</Text>
        </Pressable>
        {value.trim() !== "" && (
          <Pressable onPress={() => onChange("")} style={s.dateIconBtn}>
            <Text style={{ color: C.textMuted, fontSize: 16 }}>✕</Text>
          </Pressable>
        )}
      </View>
      {show && (
        <DateTimePicker
          value={current}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "calendar"}
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

export const s = StyleSheet.create({
  pbTrack: {
    height: 6,
    backgroundColor: C.progressBg,
    borderRadius: 3,
    overflow: "hidden",
  },
  pbFill: { height: "100%", borderRadius: 3 },
  pbLabel: {
    fontSize: 10,
    color: C.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tagPlain: { borderWidth: 1, borderColor: C.border },
  tagText: { color: C.textPrimary, fontSize: 11 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cover: {
    borderRadius: 4,
    backgroundColor: C.bgCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverText: { fontSize: 10, color: C.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rowTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "500" },
  rowMeta: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnText: { color: C.progressFill, fontSize: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bgSecondary,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  sectionArrow: { color: C.textMuted, fontSize: 11 },
  sectionTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  sectionCount: { color: C.textMuted, fontSize: 12 },
  btnPrimary: {
    backgroundColor: C.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  btnSecondary: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  fieldLabel: { color: C.textMuted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    color: C.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dateIconBtn: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
