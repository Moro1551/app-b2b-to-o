import { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import type { Category } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { useCategories } from "@/src/categories";
import { SubHeader } from "@/src/components/top-header";
import { SectionHead, formStyles } from "@/src/components/form-screen";
import { colors, radius, spacing } from "@/src/theme";

const productsLabel = (n: number) => (n === 0 ? "Sin productos" : `${n} ${n === 1 ? "producto" : "productos"}`);

export default function Categories() {
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const { data: categories = [], isLoading } = useCategories();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  // Renaming or deleting also changes products, so refresh everything that shows them.
  const done = () => qc.invalidateQueries();
  const fail = (title: string) => (e: any) => Alert.alert(title, e?.message || "Inténtalo de nuevo.");

  const createMut = useMutation({
    mutationFn: (n: string) => api.createCategory(activeId!, n),
    onSuccess: () => { setName(""); done(); },
    onError: fail("No se pudo crear la categoría"),
  });
  const renameMut = useMutation({
    mutationFn: (c: { id: string; name: string }) => api.renameCategory(activeId!, c.id, c.name),
    onSuccess: () => { setEditing(null); done(); },
    onError: fail("No se pudo cambiar el nombre"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCategory(activeId!, id),
    onSuccess: done,
    onError: fail("No se pudo eliminar la categoría"),
  });

  // isPending only updates on the next render, so two quick taps could both get through.
  const busy = useRef(false);
  const run = <T,>(mut: { mutate: (v: T, o: { onSettled: () => void }) => void }, value: T) => {
    if (busy.current) return;
    busy.current = true;
    mut.mutate(value, { onSettled: () => { busy.current = false; } });
  };

  const add = () => {
    if (!name.trim()) return;
    run(createMut, name);
  };
  const saveRename = () => {
    if (!editing || !editing.name.trim()) return;
    run(renameMut, editing);
  };
  const confirmDelete = (c: Category) =>
    Alert.alert(
      `Eliminar «${c.name}»`,
      c.count > 0
        ? `${productsLabel(c.count)} ${c.count === 1 ? "quedará" : "quedarán"} sin categoría. No se borra ningún producto.`
        : "Esta categoría no tiene productos.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => run(deleteMut, c.id) },
      ],
    );

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Categorías"
        subtitle={isLoading ? activeBusiness?.name : `${categories.length} ${categories.length === 1 ? "categoría" : "categorías"}`}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <SectionHead title="Nueva categoría" />
        <View style={styles.addRow}>
          <TextInput
            style={[formStyles.input, { flex: 1 }]}
            value={name}
            onChangeText={setName}
            placeholder="Ej. Anillos, Collares, Pulseras"
            placeholderTextColor={colors.muted}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={add}
            testID="category-new-name"
          />
          <Pressable
            style={[styles.addBtn, (!name.trim() || createMut.isPending) && { opacity: 0.5 }]}
            onPress={add}
            disabled={!name.trim() || createMut.isPending}
            testID="category-add"
          >
            {createMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <>
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.addTxt}>Agregar</Text>
            </>}
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Las categorías ordenan tus productos: aparecen como filtros en Inventario, al crear un producto y en tus catálogos.
        </Text>

        <SectionHead title="Tus categorías" />
        <View style={formStyles.card}>
          {isLoading ? (
            <View style={styles.empty}><ActivityIndicator color={colors.brandPrimary} /></View>
          ) : categories.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={26} color={colors.muted} />
              <Text style={styles.emptyTxt}>Aún no tienes categorías. Crea la primera arriba.</Text>
            </View>
          ) : categories.map((c, i) => {
            const last = i === categories.length - 1;
            if (editing?.id === c.id) {
              return (
                <View key={c.id} style={[styles.row, !last && styles.divider]}>
                  <TextInput
                    style={[formStyles.input, styles.editInput]}
                    value={editing.name}
                    onChangeText={(v) => setEditing({ id: c.id, name: v })}
                    autoFocus
                    maxLength={40}
                    returnKeyType="done"
                    onSubmitEditing={saveRename}
                    testID={`category-edit-input-${i}`}
                  />
                  <Pressable style={[styles.iconBtn, styles.iconBtnOk]} onPress={saveRename} testID={`category-save-${i}`} accessibilityLabel="Guardar">
                    {renameMut.isPending
                      ? <ActivityIndicator size="small" color={colors.onBrand} />
                      : <Ionicons name="checkmark" size={18} color={colors.onBrand} />}
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => setEditing(null)} accessibilityLabel="Cancelar">
                    <Ionicons name="close" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              );
            }
            return (
              <View key={c.id} style={[styles.row, !last && styles.divider]} testID={`category-row-${i}`}>
                <View style={styles.tag}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.onBrandSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.meta}>{productsLabel(c.count)}</Text>
                </View>
                <Pressable style={styles.iconBtn} onPress={() => setEditing({ id: c.id, name: c.name })} testID={`category-rename-${i}`} accessibilityLabel={`Cambiar nombre de ${c.name}`}>
                  <Ionicons name="pencil-outline" size={17} color={colors.onSurface} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmDelete(c)} testID={`category-delete-${i}`} accessibilityLabel={`Eliminar ${c.name}`}>
                  <Ionicons name="trash-outline" size={17} color={colors.error} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  addRow: { flexDirection: "row", gap: spacing.sm },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minWidth: 108,
    paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
  },
  addTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.lg, marginLeft: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 60 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tag: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center", marginRight: spacing.xs,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  iconBtn: {
    width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center", backgroundColor: colors.surface,
  },
  iconBtnOk: { backgroundColor: colors.brand, borderColor: colors.brand },
  editInput: { flex: 1, minHeight: 40, paddingVertical: 6 },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTxt: { fontSize: 13, color: colors.muted, textAlign: "center" },
});
