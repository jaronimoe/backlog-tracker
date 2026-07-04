import React from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { C } from "../theme";
import { Btn, ProgressBar } from "../components/ui";
import {
  dismissImport,
  QueueItem,
  useImportState,
} from "../services/importQueue";

const STATUS_ICON: Record<QueueItem["status"], string> = {
  pending: "⏳",
  added: "✓",
  merged: "🔗",
  duplicate: "⏭",
  invalid: "⚠",
};

const STATUS_COLOR: Record<QueueItem["status"], string> = {
  pending: C.textMuted,
  added: C.progressFill,
  merged: C.gold,
  duplicate: C.textMuted,
  invalid: C.accent,
};

export default function ImportScreen() {
  const st = useImportState();
  const total = st.items.length;
  const percent = total > 0 ? (st.processed / total) * 100 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: C.textPrimary, fontSize: 24, fontWeight: "700" }}>
          Import
        </Text>
        {st.running && <ActivityIndicator color={C.accent} />}
      </View>
      <Text style={{ color: C.textSecondary, fontSize: 12, marginBottom: 12 }}>
        {st.label ?? "Import"}
      </Text>

      {st.error ? (
        <Text style={{ color: C.accent, fontSize: 13, marginBottom: 12 }}>
          Import failed: {st.error}
        </Text>
      ) : (
        <>
          <ProgressBar percent={percent} width="100%" />
          <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 6, marginBottom: 12 }}>
            {st.processed}/{total} processed — {st.added} added, {st.merged}{" "}
            merged, {st.skippedDuplicates} duplicates, {st.skippedInvalid} invalid
            {!st.running && total > 0 ? "  ·  done, tab closes shortly" : ""}
          </Text>
        </>
      )}

      <FlatList
        data={st.items}
        keyExtractor={(_, i) => String(i)}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
              opacity: item.status === "pending" ? 0.45 : 1,
            }}
          >
            <Text style={{ color: STATUS_COLOR[item.status], fontSize: 13, width: 20 }}>
              {STATUS_ICON[item.status]}
            </Text>
            <Text
              style={{ color: C.textPrimary, fontSize: 13, flex: 1 }}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.detail ? (
              <Text style={{ color: C.textMuted, fontSize: 11 }}>{item.detail}</Text>
            ) : null}
          </View>
        )}
      />

      {!st.running && (
        <Btn label="Close" kind="secondary" onPress={dismissImport} style={{ marginTop: 12 }} />
      )}
    </View>
  );
}
