import type { ReactNode } from "react";
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing } from "@/src/theme";

export function SearchBar({ value, onChangeText, placeholder, testID, style }: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.searchBar, style]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        testID={testID}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} testID={testID && `${testID}-clear`}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Horizontally scrolling row of chips that reaches the screen edges. */
export function FilterChips({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
      {children}
    </ScrollView>
  );
}

export function FilterChip({ id, label, active, onPress }: { id: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={`chip-${id}`}>
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, height: 46,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md, height: 36, borderRadius: radius.sm, justifyContent: "center", flexShrink: 0,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTxtActive: { color: colors.onBrandPrimary },
});
