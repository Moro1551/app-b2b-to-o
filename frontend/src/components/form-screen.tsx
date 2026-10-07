import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SubHeader } from "@/src/components/top-header";
import { colors, radius, spacing } from "@/src/theme";

/**
 * Editable form state that is refilled from `data` each time it (re)loads, e.g. a record fetched
 * for an edit screen. Updating state while rendering avoids the extra render of an effect.
 */
export function useLoadedForm<T, F>(initial: F, data: T | undefined, toForm: (d: T) => F): [F, Dispatch<SetStateAction<F>>] {
  const [form, setForm] = useState<F>(initial);
  const [loaded, setLoaded] = useState<T | undefined>(undefined);
  if (data !== undefined && data !== loaded) {
    setLoaded(data);
    setForm(toForm(data));
  }
  return [form, setForm];
}

export function FormScreen({
  title, subtitle, onSave, saveLabel = "Guardar", onDelete, grouped, saving, summary, children,
}: {
  title: string;
  subtitle?: string;
  onSave: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  /** Gray background so white `formStyles.card` sections stand out. */
  grouped?: boolean;
  /** Disables the save button and shows a spinner, so a slow request can't be sent twice. */
  saving?: boolean;
  /** Shown in the fixed footer above the buttons, e.g. a total. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, grouped && styles.wrapGrouped]}>
      <SubHeader title={title} subtitle={subtitle} backTestID="form-back" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
          {summary}
          <View style={styles.buttons}>
            {onDelete && (
              <Pressable style={styles.deleteBtn} onPress={onDelete} testID="form-delete" accessibilityLabel="Eliminar">
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            )}
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving} testID="form-save">
              {saving
                ? <ActivityIndicator color={colors.onBrandPrimary} />
                : <Ionicons name="checkmark" size={20} color={colors.onBrandPrimary} />}
              <Text style={styles.saveTxt}>{saveLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** Section heading with an optional link on the right (e.g. "Vaciar"). */
export function SectionHead({ title, action, onAction, actionTestID }: {
  title: string;
  action?: string;
  onAction?: () => void;
  actionTestID?: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={[formStyles.section, { marginTop: 0, marginBottom: 0 }]}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={10} testID={actionTestID}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Label on the left, value or input on the right; stack several inside `formStyles.card`. */
export function CardRow({ label, children, muted, strong, last }: {
  label: string;
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.cardRow, !last && styles.cardRowDivider]}>
      <Text style={[styles.cardLabel, muted && { color: colors.muted }, strong && { fontWeight: "700" }]}>{label}</Text>
      {children}
    </View>
  );
}

/** Compact right-aligned numeric input, with an optional currency symbol. */
export function AmountInput({ symbol, value, onChangeText, placeholder, testID, strong, integer }: {
  symbol?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  testID?: string;
  strong?: boolean;
  integer?: boolean;
}) {
  return (
    <View style={styles.amount}>
      {!!symbol && <Text style={styles.amountSymbol}>{symbol}</Text>}
      <TextInput
        style={[styles.amountInput, strong && { fontWeight: "800" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={integer ? "number-pad" : "decimal-pad"}
        selectTextOnFocus
        testID={testID}
      />
    </View>
  );
}

/** Two or more mutually exclusive options. */
export function Segmented<T extends string>({ options, value, onChange, testIDPrefix }: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.segment}>
      {options.map(([v, label]) => (
        <Pressable
          key={v}
          style={[styles.segBtn, value === v && styles.segBtnOn]}
          onPress={() => onChange(v)}
          testID={testIDPrefix && `${testIDPrefix}-${v}`}
        >
          <Text style={[styles.segTxt, value === v && styles.segTxtOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  wrapGrouped: { backgroundColor: colors.surfaceSecondary },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginLeft: 2 },
  footer: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttons: { flexDirection: "row", gap: spacing.sm },
  deleteBtn: {
    width: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  saveBtn: {
    flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "center",
    backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md,
  },
  saveTxt: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 16 },
  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.sm, marginBottom: spacing.sm,
  },
  sectionAction: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary },
  cardRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md,
    paddingHorizontal: spacing.md, minHeight: 52,
  },
  cardRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  cardLabel: { fontSize: 14, color: colors.onSurface },
  amount: {
    flexDirection: "row", alignItems: "center", gap: 6,
    width: 130, height: 38, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, backgroundColor: colors.surface,
  },
  amountSymbol: { fontSize: 14, fontWeight: "600", color: colors.muted },
  // minWidth 0: on web an <input> has an intrinsic width and would overflow the box.
  amountInput: { flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.onSurface, padding: 0 },
  segment: {
    flexDirection: "row", gap: 4, padding: 4,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
  },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.sm },
  segBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segTxt: { fontSize: 14, fontWeight: "500", color: colors.muted },
  segTxtOn: { fontWeight: "700", color: colors.onSurface },
});

export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 15, color: colors.onSurface, minHeight: 46,
  },
  textarea: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 15, color: colors.onSurface, minHeight: 88, textAlignVertical: "top",
  },
  /** Uppercase heading between groups of fields. */
  section: {
    fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1,
    marginTop: spacing.sm, marginBottom: spacing.sm, marginLeft: 2,
  },
  /** White grouped block; pair with `grouped` on FormScreen. */
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", marginBottom: spacing.md,
  },
});
