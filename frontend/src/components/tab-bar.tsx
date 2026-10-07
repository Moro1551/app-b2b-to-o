import type { ComponentProps } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { colors, spacing } from "@/src/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

// [inactive, active] icon per tab route; the active one is the filled variant.
const ICONS: Record<string, [IconName, IconName]> = {
  index: ["home-outline", "home"],
  inventory: ["cube-outline", "cube"],
  customers: ["people-outline", "people"],
  more: ["grid-outline", "grid"],
};

/** Bottom tab bar with a teal line above the active tab. */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = typeof options.title === "string" ? options.title : route.name;
        const [icon, iconOn] = ICONS[route.name] ?? ["ellipse-outline", "ellipse"];

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            role="tab"
            aria-selected={focused}
            aria-label={label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            style={styles.item}
            testID={`tab-${route.name}`}
          >
            <View style={[styles.indicator, focused && styles.indicatorOn]} />
            <Ionicons name={focused ? iconOn : icon} size={23} color={focused ? colors.brandPrimary : colors.muted} />
            <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row", paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  item: { flex: 1, alignItems: "center", gap: 3, paddingBottom: 2 },
  // Sits flush with the bar's top border; transparent on inactive tabs so icons don't shift.
  indicator: { width: 28, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginBottom: 6 },
  indicatorOn: { backgroundColor: colors.brand },
  label: { fontSize: 11, fontWeight: "600", color: colors.muted },
  labelOn: { color: colors.brandPrimary, fontWeight: "700" },
});
