import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useBusiness } from "@/src/business-context";
import { EmptyState } from "@/src/components/empty-state";
import { colors } from "@/src/theme";

export default function Index() {
  const { isLoading, isError, businesses, activeId, refresh } = useBusiness();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  // Without this, a failed request looks like "no businesses yet" and sends the user to onboarding.
  if (isError && businesses.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.surface }}>
        <EmptyState
          icon="cloud-offline-outline"
          title="No se pudo cargar tu información"
          message="El servidor no respondió. Revisa tu conexión a internet e inténtalo de nuevo."
          action={refresh}
          actionLabel="Reintentar"
        />
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
