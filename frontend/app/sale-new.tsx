import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, formStyles } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

type Item = { product_id: string; name: string; quantity: number; unit_price: number; stock: number };

export default function SaleNew() {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();

  const { data: products = [] } = useQuery({
    queryKey: ["products", activeId],
    queryFn: () => api.listProducts(activeId!),
    enabled: !!activeId,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", activeId],
    queryFn: () => api.listCustomers(activeId!),
    enabled: !!activeId,
  });

  const [items, setItems] = useState<Item[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");

  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const currency = activeBusiness?.currency || "L";

  const filteredProducts = useMemo(() => {
    if (!query) return products.slice(0, 20);
    const q = query.toLowerCase();
    return products.filter((p: any) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)).slice(0, 20);
  }, [products, query]);

  const addItem = (p: any) => {
    const existing = items.find((i) => i.product_id === p.id);
    if (existing) {
      setItems(items.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { product_id: p.id, name: p.name, quantity: 1, unit_price: p.sale_price || 0, stock: p.stock || 0 }]);
    }
  };
  const updateQty = (pid: string, qty: number) => {
    if (qty <= 0) setItems(items.filter((i) => i.product_id !== pid));
    else setItems(items.map((i) => i.product_id === pid ? { ...i, quantity: qty } : i));
  };

  const createSale = useMutation({
    mutationFn: () => api.createSale(activeId!, {
      customer_id: customerId, customer_name: customerName,
      items: items.map(({ product_id, name, quantity, unit_price }) => ({ product_id, name, quantity, unit_price })),
      paid: parseFloat(paid || "0") || total,
      note,
    }),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });

  const save = () => {
    if (items.length === 0) { Alert.alert("Agrega al menos un producto"); return; }
    createSale.mutate();
  };

  return (
    <FormScreen title="Nueva venta" onSave={save} saveLabel="Registrar venta">
      <Field label="Cliente">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Pressable
            style={[styles.customerChip, !customerId && styles.customerChipActive]}
            onPress={() => { setCustomerId(""); setCustomerName(""); }}
          >
            <Text style={[styles.customerChipTxt, !customerId && { color: colors.onBrandPrimary }]}>Sin cliente</Text>
          </Pressable>
          {customers.map((c: any) => (
            <Pressable
              key={c.id}
              style={[styles.customerChip, customerId === c.id && styles.customerChipActive]}
              onPress={() => { setCustomerId(c.id); setCustomerName(c.name); }}
              testID={`sale-customer-${c.id}`}
            >
              <Text style={[styles.customerChipTxt, customerId === c.id && { color: colors.onBrandPrimary }]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Field>

      <Field label="Productos">
        <TextInput style={formStyles.input} placeholder="Buscar producto para añadir..." placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} testID="sale-product-search" />
      </Field>

      <ScrollView style={{ maxHeight: 180 }}>
        {filteredProducts.map((p: any) => (
          <Pressable key={p.id} style={styles.productRow} onPress={() => addItem(p)} testID={`sale-add-${p.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{p.name}</Text>
              <Text style={styles.productSub}>Stock: {p.stock} · {formatMoney(p.sale_price || 0, currency)}</Text>
            </View>
            <Ionicons name="add-circle" size={24} color={colors.brandPrimary} />
          </Pressable>
        ))}
        {filteredProducts.length === 0 && (
          <Text style={styles.empty}>Sin productos</Text>
        )}
      </ScrollView>

      {items.length > 0 && (
        <>
          <Text style={styles.section}>Carrito</Text>
          {items.map((it) => (
            <View key={it.product_id} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartName}>{it.name}</Text>
                <Text style={styles.cartSub}>{formatMoney(it.unit_price, currency)} c/u</Text>
              </View>
              <View style={styles.qtyWrap}>
                <Pressable onPress={() => updateQty(it.product_id, it.quantity - 1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={colors.onSurface} /></Pressable>
                <Text style={styles.qtyTxt}>{it.quantity}</Text>
                <Pressable onPress={() => updateQty(it.product_id, it.quantity + 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={colors.onSurface} /></Pressable>
              </View>
            </View>
          ))}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
          </View>
          <Field label="Monto pagado (dejar vacío = pagado total)">
            <TextInput style={formStyles.input} value={paid} onChangeText={setPaid} keyboardType="decimal-pad" placeholder={total.toFixed(2)} placeholderTextColor={colors.muted} testID="sale-paid" />
          </Field>
          <Field label="Nota">
            <TextInput style={formStyles.input} value={note} onChangeText={setNote} placeholderTextColor={colors.muted} />
          </Field>
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  customerChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, flexShrink: 0,
  },
  customerChipActive: { backgroundColor: colors.brandPrimary },
  customerChipTxt: { color: colors.onSurface, fontWeight: "500" },
  productRow: {
    flexDirection: "row", alignItems: "center", padding: spacing.sm, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, marginBottom: spacing.xs,
  },
  productName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  productSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { fontSize: 13, color: colors.muted, textAlign: "center", padding: spacing.md },
  section: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  cartRow: {
    flexDirection: "row", alignItems: "center", padding: spacing.sm, backgroundColor: colors.brandTertiary,
    borderRadius: radius.md, marginBottom: spacing.xs,
  },
  cartName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  cartSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  qtyWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface,
    justifyContent: "center", alignItems: "center",
  },
  qtyTxt: { fontSize: 15, fontWeight: "600", color: colors.onSurface, minWidth: 20, textAlign: "center" },
  totalCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: spacing.md, backgroundColor: colors.brandPrimary, borderRadius: radius.md, marginVertical: spacing.md,
  },
  totalLabel: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "600" },
  totalValue: { color: colors.onBrandPrimary, fontSize: 20, fontWeight: "700" },
});
