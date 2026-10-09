import { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { sameCategory, useCategories } from "@/src/categories";
import { formStyles } from "@/src/components/form-screen";
import { colors, radius, spacing } from "@/src/theme";

/** Category field that drops down the business' categories, with a shortcut to add a new one. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId } = useBusiness();
  const { data: categories = [], isLoading } = useCategories();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const createMut = useMutation({
    mutationFn: (name: string) => api.createCategory(activeId!, name),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["categories", activeId] });
      pick(c.name);
    },
    onError: (e: any) => Alert.alert("No se pudo crear la categoría", e?.message || "Inténtalo de nuevo."),
  });
  const submitting = useRef(false);
  const create = () => {
    if (submitting.current || !newName.trim()) return;
    // Picking an existing one is friendlier than the server's "ya existe".
    const existing = categories.find((c) => sameCategory(c.name, newName));
    if (existing) { pick(existing.name); return; }
    submitting.current = true;
    createMut.mutate(newName, { onSettled: () => { submitting.current = false; } });
  };

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setCreating(false);
    setNewName("");
  }

  // A product saved with a category that isn't in the list yet still shows as chosen.
  const listed = categories.some((c) => sameCategory(c.name, value));
  const options = value && !listed ? [{ id: "current", name: value, count: 0 }, ...categories] : categories;

  return (
    <View>
      <Pressable
        style={[formStyles.input, styles.field, open && styles.fieldOpen]}
        onPress={() => setOpen(!open)}
        testID="product-category"
        role="combobox"
        aria-expanded={open}
        aria-label="Categoría"
      >
        <Ionicons name="pricetag-outline" size={16} color={value ? colors.onBrandSecondary : colors.muted} />
        <Text style={[styles.value, !value && { color: colors.muted }]} numberOfLines={1}>
          {value || "Elegir categoría"}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.menu} testID="category-menu">
          {isLoading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /></View>
          ) : (
            <>
              <Option label="Sin categoría" selected={!value} onPress={() => pick("")} muted />
              {options.map((c, i) => (
                <Option
                  key={c.id}
                  label={c.name}
                  meta={c.count ? String(c.count) : undefined}
                  selected={!!value && sameCategory(c.name, value)}
                  onPress={() => pick(c.name)}
                  testID={`category-option-${i}`}
                />
              ))}
            </>
          )}

          {creating ? (
            <View style={styles.newRow}>
              <TextInput
                style={[formStyles.input, styles.newInput]}
                value={newName}
                onChangeText={setNewName}
                placeholder="Nombre de la categoría"
                placeholderTextColor={colors.muted}
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={create}
                testID="category-new-inline"
              />
              <Pressable
                style={[styles.createBtn, (!newName.trim() || createMut.isPending) && { opacity: 0.5 }]}
                onPress={create}
                disabled={!newName.trim() || createMut.isPending}
                testID="category-create-inline"
              >
                {createMut.isPending
                  ? <ActivityIndicator size="small" color={colors.onBrandPrimary} />
                  : <Text style={styles.createTxt}>Crear</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable style={styles.footerBtn} onPress={() => setCreating(true)} testID="category-new-btn">
                <Ionicons name="add" size={18} color={colors.onBrandSecondary} />
                <Text style={styles.footerTxt}>Nueva categoría</Text>
              </Pressable>
              <Pressable style={styles.footerBtn} onPress={() => { setOpen(false); router.push("/categories"); }} testID="category-manage">
                <Ionicons name="settings-outline" size={16} color={colors.muted} />
                <Text style={[styles.footerTxt, { color: colors.muted }]}>Administrar</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Option({ label, meta, selected, onPress, muted, testID }: {
  label: string; meta?: string; selected: boolean; onPress: () => void; muted?: boolean; testID?: string;
}) {
  return (
    <Pressable style={[styles.option, selected && styles.optionOn]} onPress={onPress} testID={testID} role="option" aria-selected={selected}>
      <Text style={[styles.optionTxt, muted && { color: colors.muted }, selected && styles.optionTxtOn]} numberOfLines={1}>{label}</Text>
      {!!meta && <Text style={styles.optionMeta}>{meta}</Text>}
      {selected && <Ionicons name="checkmark" size={18} color={colors.brand} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fieldOpen: { borderColor: colors.brandPrimary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  value: { flex: 1, fontSize: 15, color: colors.onSurface },
  menu: {
    borderWidth: 1, borderTopWidth: 0, borderColor: colors.brandPrimary, backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, overflow: "hidden",
  },
  loading: { padding: spacing.lg, alignItems: "center" },
  option: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 46,
    paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionOn: { backgroundColor: colors.brandTertiary },
  optionTxt: { flex: 1, fontSize: 15, color: colors.onSurface },
  optionTxtOn: { fontWeight: "700" },
  optionMeta: {
    fontSize: 12, fontWeight: "600", color: colors.muted, backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, overflow: "hidden",
  },
  footer: { flexDirection: "row", justifyContent: "space-between" },
  footerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, minHeight: 46 },
  footerTxt: { fontSize: 14, fontWeight: "700", color: colors.onBrandSecondary },
  newRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  newInput: { flex: 1, minHeight: 40, paddingVertical: 6 },
  createBtn: {
    justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg,
    borderRadius: radius.md, backgroundColor: colors.brandPrimary, minWidth: 76,
  },
  createTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
});
