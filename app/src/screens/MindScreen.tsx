import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { C, themedStyles } from "../theme";
import { Cover } from "../components/ui";
import { allGames } from "../db/repo";
import { GameWithMeta } from "../types";

/** "On My Mind" — head with a thought cloud full of games. */
export default function MindScreen({ navigation }: any) {
  const [games, setGames] = useState<GameWithMeta[]>([]);
  useFocusEffect(
    useCallback(() => setGames(allGames().filter((g) => g.on_mind)), [])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: "center" }}
    >
      <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 4 }}>
        On My Mind
      </Text>
      <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 20 }}>
        {games.length === 0
          ? "Nothing on your mind. Peaceful."
          : `${games.length} game${games.length > 1 ? "s" : ""} occupying headspace`}
      </Text>

      {/* thought cloud */}
      <View style={cloud.cloud}>
        {games.length === 0 ? (
          <Text style={{ color: C.textMuted, fontSize: 24 }}>💤</Text>
        ) : (
          <View style={cloud.cloudInner}>
            {games.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => navigation.navigate("GameDetail", { id: g.id })}
                style={{ alignItems: "center", width: 72 }}
              >
                <Cover game={g} w={54} h={72} />
                <Text
                  style={{ color: C.textSecondary, fontSize: 9, marginTop: 4, textAlign: "center" }}
                  numberOfLines={2}
                >
                  {g.title}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* little thought bubbles + head */}
      <View style={{ alignItems: "center", marginTop: 6 }}>
        <View style={[cloud.bubble, { width: 18, height: 18, marginLeft: 40 }]} />
        <View style={[cloud.bubble, { width: 10, height: 10, marginLeft: 20, marginTop: 4 }]} />
        <Text style={{ fontSize: 64, marginTop: 8 }}>😶</Text>
      </View>

      <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 24, textAlign: "center" }}>
        Toggle 💭 on any game's detail page to add or remove it here.
      </Text>
    </ScrollView>
  );
}

const cloud = themedStyles(() => ({
  cloud: {
    backgroundColor: C.bgSecondary,
    borderRadius: 60,
    minHeight: 120,
    minWidth: 240,
    maxWidth: 340,
    padding: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: C.border,
  },
  cloudInner: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
    justifyContent: "center" as const,
  },
  bubble: {
    backgroundColor: C.bgSecondary,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C.border,
  },
}));
