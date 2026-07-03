import React from "react";
import { Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { migrate } from "./src/db/database";
import { C } from "./src/theme";
import GamesScreen from "./src/screens/GamesScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import StatsScreen from "./src/screens/StatsScreen";
import MindScreen from "./src/screens/MindScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import GameDetailScreen from "./src/screens/GameDetailScreen";
import AddGameScreen from "./src/screens/AddGameScreen";

migrate();

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bgPrimary,
    card: C.bgSecondary,
    text: C.textPrimary,
    primary: C.accent,
    border: C.border,
  },
};

const ICONS: Record<string, string> = {
  Games: "🎮",
  Calendar: "📅",
  Stats: "📊",
  Mind: "💭",
  Settings: "⚙️",
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: { backgroundColor: C.bgSecondary, borderTopColor: C.border },
        tabBarIcon: () => <Text style={{ fontSize: 16 }}>{ICONS[route.name]}</Text>,
      })}
    >
      <Tab.Screen name="Games" component={GamesScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Mind" component={MindScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.bgSecondary },
          headerTintColor: C.textPrimary,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="GameDetail" component={GameDetailScreen} options={{ title: "" }} />
        <Stack.Screen name="AddGame" component={AddGameScreen} options={{ title: "Add Game", presentation: "modal" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
