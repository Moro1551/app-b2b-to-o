import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, SectionHead, CardRow, AmountInput, Segmented, formStyles } from "@/src/components/form-screen";
import { SearchBar } from "@/src/components/list-tools";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

type Item = { product_id: string; name: string; quantity: number; unit_price: number; stock: number; photo?: string };
type PayMode = "completo" | "parcial";

// Short lists keep the cart visible without scrolling; searching narrows the rest.
const PRODUCTS_SHOWN = 5;
const PRODUCTS_SHOWN_SEARCHING = 10;
const CUSTOMERS_SHOWN = 6;

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
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("completo");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");

  const currency = activeBusiness?.currency || "L";
  const symbol = currency === "USD" ? "$" : "L";
  const customer = customers.find((c: any) => c.id === customerId);
  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const paidAmount = payMode === "completo" ? total : Math.min(total, Math.max(0, parseFloat(paid || "0") || 0));
  const pending = total - paidAmount;

  const filteredProducts = useMemo(() => {
    if (!query) return products.slice(0, PRODUCTS_SHOWN);
    const q = query.toLowerCase();
    return products
      .filter((p: any) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, PRODUCTS_SHOWN_SEARCHING);
  }, [products, query]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase();
    const list = q
      ? customers.filter((c: any) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
      : customers;
    return list.slice(0, CUSTOMERS_SHOWN);
  }, [customers, customerQuery]);

  const addItem = (p: any) => {
    const existing = items.find((i) => i.product_id === p.id);
    if (existing) {
      setItems(items.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { product_id: p.id, name: p.name, quantity: 1, unit_price: p.sale_price || 0, stock: p.stock || 0, photo: p.photos?.[0] }]);
    }
  };
  const updateQty = (pid: string, qty: number) => {
    if (qty <= 0) setItems(items.filter((i) => i.product_id !== pid));
    else setItems(items.map((i) => i.product_id === pid ? { ...i, quantity: qty } : i));
  };
  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    setPickingCustomer(false);
    setCustomerQuery("");
  };

  const createSale = useMutation({
    mutationFn: () => api.createSale(activeId!, {
      customer_id: customerId, customer_name: customer?.name || "",
      items: items.map(({ product_id, name, quantity, unit_price }) => ({ product_id, name, quantity, unit_price })),
      paid: paidAmount,
      note,
    }),
    // Opens the new sale, where the receipt can be sent. It goes into the cached list first so the
    // screen doesn't show "Venta no encontrada" while the list reloads.
    onSuccess: (sale: any) => {
      qc.setQueryData(["sales", activeId], (old: any[] | undefined) => [sale, ...(old || [])]);
      qc.invalidateQueries();
      router.replace({ pathname: "/sale-pay", params: { id: sale.id, nuevo: "1" } });
    },
    onError: (e: any) => Alert.alert("No se pudo registrar la venta", e?.message || "Inténtalo de nuevo."),
  });

  // isPending only updates on the next render, so two quick taps could both get through.
  const submitting = useRef(false);
  const save = () => {
    if (submitting.current) return;
    if (items.length === 0) { Alert.alert("Agrega al menos un producto"); return; }
    submitting.current = true;
    createSale.mutate(undefined, { onSettled: () => { submitting.current = false; } });
  };

  return (
    <FormScreen
      title="Nueva venta"
      subtitle={activeBusiness?.name}
      onSave={save}
      saveLabel="Registrar venta"
      saving={createSale.isPending}
      grouped
      summary={items.length > 0 && (
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Total a cobrar</Text>
            <Text style={styles.summaryValue}>{formatMoney(total, currency)}</Text>
          </View>
          {payMode === "parcial" && (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.summaryLabel}>Pagado {formatMoney(paidAmount, currency)}</Text>
              <Text style={styles.summaryPending}>Pendiente {formatMoney(pending, currency)}</Text>
            </View>
          )}
        </View>
      )}
    >
      <SectionHead
        title="Cliente"
        action={pickingCustomer ? "Cerrar" : customer ? "Cambiar" : "Elegir"}
        onAction={() => setPickingCustomer(!pickingCustomer)}
        actionTestID="sale-customer-toggle"
      />
      {pickingCustomer ? (
        <View style={formStyles.card}>
          <SearchBar
            value={customerQuery}
            onChangeText={setCustomerQuery}
            placeholder="Buscar cliente"
            testID="sale-customer-search"
            style={styles.pickerSearch}
          />
          <PickerRow label="Venta sin cliente" selected={!customerId} onPress={() => chooseCustomer("")} testID="sale-customer-none" />
          {filteredCustomers.map((c: any, i: number) => (
            <PickerRow
              key={c.id}
              label={c.name}
              sub={c.phone}
              initial={c.name.charAt(0).toUpperCase()}
              selected={customerId === c.id}
              onPress={() => chooseCustomer(c.id)}
              last={i === filteredCustomers.length - 1}
              testID={`sale-customer-${c.id}`}
            />
          ))}
        </View>
      ) : (
        <Pressable
          style={[styles.customerCard, customer && styles.customerCardOn]}
          onPress={() => setPickingCustomer(true)}
          testID="sale-customer-card"
        >
          <View style={[styles.avatar, !customer && styles.avatarEmpty]}>
            {customer
              ? <Text style={styles.avatarTxt}>{customer.name.charAt(0).toUpperCase()}</Text>
              : <Ionicons name="person-outline" size={18} color={colors.muted} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{customer ? customer.name : "Venta sin cliente"}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {customer ? customer.phone || customer.city || "Cliente" : "Toca para elegir un cliente"}
            </Text>
          </View>
          <Ionicons
            name={customer ? "checkmark-circle" : "chevron-forward"}
            size={customer ? 22 : 18}
            color={customer ? colors.brand : colors.muted}
          />
        </Pressable>
      )}

      <SectionHead title="Añadir productos" />
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar producto para añadir"
        testID="sale-product-search"
      />
      <View style={styles.productList}>
        {filteredProducts.map((p: any, i: number) => {
          const inCart = items.find((it) => it.product_id === p.id)?.quantity ?? 0;
          const noStock = (p.stock ?? 0) <= 0;
          return (
            <Pressable
              key={p.id}
              style={[styles.productRow, i < filteredProducts.length - 1 && styles.divider]}
              onPress={() => addItem(p)}
              testID={`sale-add-${p.id}`}
            >
              <Thumb uri={p.photos?.[0]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.rowSub, noStock && { color: colors.error }]}>
                  {formatMoney(p.sale_price || 0, currency)} · {noStock ? "sin stock" : `${p.stock} disponibles`}
                </Text>
              </View>
              {inCart > 0 ? (
                <View style={styles.inCartBadge}><Text style={styles.inCartTxt}>{inCart}</Text></View>
              ) : (
                <View style={styles.addBtn}><Ionicons name="add" size={18} color={colors.onSurface} /></View>
              )}
            </Pressable>
          );
        })}
        {filteredProducts.length === 0 && (
          <Text style={styles.empty}>{query ? "Ningún producto coincide con la búsqueda." : "Este negocio aún no tiene productos."}</Text>
        )}
      </View>

      {items.length > 0 && (
        <>
          <SectionHead
            title={`Carrito · ${units} ${units === 1 ? "artículo" : "artículos"}`}
            action="Vaciar"
            onAction={() => setItems([])}
            actionTestID="sale-cart-clear"
          />
          <View style={formStyles.card}>
            {items.map((it, i) => (
              <View key={it.product_id} style={[styles.cartRow, i < items.length - 1 && styles.divider]}>
                <Thumb uri={it.photo} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.rowSub}>{formatMoney(it.unit_price, currency)} c/u</Text>
                  {it.quantity > it.stock && (
                    <Text style={styles.stockWarn}>Solo hay {Math.max(0, it.stock)} en stock</Text>
                  )}
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => updateQty(it.product_id, it.quantity - 1)} style={styles.stepBtn} testID={`sale-qty-minus-${it.product_id}`}>
                    <Ionicons name="remove" size={16} color={colors.onSurface} />
                  </Pressable>
                  <Text style={styles.stepQty}>{it.quantity}</Text>
                  <Pressable onPress={() => updateQty(it.product_id, it.quantity + 1)} style={styles.stepBtn} testID={`sale-qty-plus-${it.product_id}`}>
                    <Ionicons name="add" size={16} color={colors.onSurface} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <SectionHead title="Pago" />
          <Segmented
            options={[["completo", "Pago completo"], ["parcial", "Pago parcial"]]}
            value={payMode}
            onChange={setPayMode}
            testIDPrefix="sale-pay"
          />
          {payMode === "parcial" && (
            <View style={[formStyles.card, { marginTop: spacing.md }]}>
              <CardRow label="Monto pagado">
                <AmountInput symbol={symbol} value={paid} onChangeText={setPaid} placeholder="0.00" testID="sale-paid" />
              </CardRow>
              <CardRow label="Queda pendiente" muted last>
                <Text style={styles.pendingValue}>{formatMoney(pending, currency)}</Text>
              </CardRow>
            </View>
          )}
          <View style={{ marginTop: spacing.md }}>
            <Field label="Nota (opcional)">
              <TextInput style={formStyles.input} value={note} onChangeText={setNote} placeholderTextColor={colors.muted} testID="sale-note" />
            </Field>
          </View>
        </>
      )}
    </FormScreen>
  );
}

function Thumb({ uri }: { uri?: string }) {
  return uri ? (
    <Image source={{ uri: toRemoteUrl(uri) }} style={styles.thumb} contentFit="cover" />
  ) : (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      <Ionicons name="image-outline" size={16} color={colors.muted} />
    </View>
  );
}

function PickerRow({ label, sub, initial, selected, onPress, last, testID }: {
  label: string;
  sub?: string;
  initial?: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
  testID: string;
}) {
  return (
    <Pressable style={[styles.pickerRow, !last && styles.divider]} onPress={onPress} testID={testID}>
      <View style={[styles.avatarSm, !initial && styles.avatarEmpty]}>
        {initial
          ? <Text style={styles.avatarSmTxt}>{initial}</Text>
          : <Ionicons name="person-outline" size={15} color={colors.muted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {selected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  customerCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  customerCardOn: { borderColor: colors.brand, borderWidth: 1.5 },
  avatar: {
    width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center",
  },
  avatarEmpty: { backgroundColor: colors.surfaceTertiary },
  avatarTxt: { color: colors.onBrandSecondary, fontSize: 15, fontWeight: "700" },
  avatarSm: {
    width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center",
  },
  avatarSmTxt: { color: colors.onBrandSecondary, fontSize: 13, fontWeight: "700" },
  pickerSearch: { margin: spacing.sm },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  productList: { marginTop: spacing.sm, marginBottom: spacing.md },
  productRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10 },
  thumb: { width: 40, height: 40, borderRadius: radius.sm },
  thumbEmpty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  addBtn: {
    width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
  },
  inCartBadge: {
    width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandPrimary,
    justifyContent: "center", alignItems: "center",
  },
  inCartTxt: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "700" },
  empty: { fontSize: 13, color: colors.muted, textAlign: "center", padding: spacing.md },
  cartRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  stockWarn: { fontSize: 12, color: colors.warning, fontWeight: "600", marginTop: 2 },
  stepper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
  },
  stepBtn: { width: 30, height: 30, justifyContent: "center", alignItems: "center" },
  stepQty: { minWidth: 24, textAlign: "center", fontSize: 14, fontWeight: "700", color: colors.onSurface },
  pendingValue: { fontSize: 14, fontWeight: "700", color: colors.warning },
  summary: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, color: colors.muted },
  summaryValue: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  summaryPending: { fontSize: 13, fontWeight: "700", color: colors.warning, marginTop: 2 },
});
