import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useBusiness } from "@/src/business-context";
import { colors } from "@/src/theme";

export default function Index() {
  const { isLoading, businesses, activeId } = useBusiness();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (businesses.length === 0) {
    return <Redirect href="/onboarding" />;
  }

  if (!activeId) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return <Redirect href="/(tabs)" />;
}
