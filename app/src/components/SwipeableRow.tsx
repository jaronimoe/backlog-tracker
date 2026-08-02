import React, { useRef } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { C } from "../theme";

const REVEAL = 120; // max drag distance (px)
const TRIGGER = 72; // releasing beyond this fires the action

/**
 * Left-swipe row revealing a single action (e.g. "→ Backlog"). Built on core
 * PanResponder/Animated so no gesture-handler dependency is needed. The
 * responder only claims clearly-horizontal drags, so vertical FlatList
 * scrolling and taps on the row keep working.
 */
export function SwipeableRow({
  children,
  label,
  color = C.accent,
  onAction,
}: {
  children: React.ReactNode;
  label: string;
  color?: string;
  onAction: () => void;
}) {
  const tx = useRef(new Animated.Value(0)).current;
  // Keep the latest callback without recreating the PanResponder each render.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) =>
        tx.setValue(Math.max(-REVEAL, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -TRIGGER) onActionRef.current();
        Animated.spring(tx, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  const labelOpacity = tx.interpolate({
    inputRange: [-TRIGGER, -16, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={{ overflow: "hidden" }} {...responder.panHandlers}>
      <View style={[StyleSheet.absoluteFill, sw.action, { backgroundColor: color }]}>
        <Animated.Text style={[sw.actionText, { opacity: labelOpacity }]}>
          {label}
        </Animated.Text>
      </View>
      <Animated.View
        style={{
          transform: [{ translateX: tx }],
          backgroundColor: C.bgPrimary,
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const sw = StyleSheet.create({
  action: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 18,
  },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
