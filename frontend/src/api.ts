import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getAuthToken } from "./auth-context";

const envUrl =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL;

export const API_BASE = `${envUrl?.replace(/\/$/, "")}/api`;

export const ACTIVE_BIZ_KEY = "@mn:active_business_id";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  listBusinesses: () => request<any[]>("/businesses"),
  createBusiness: (data: any) => request<any>("/businesses", { method: "POST", body: JSON.stringify(data) }),
  updateBusiness: (id: string, data: any) => request<any>(`/businesses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBusiness: (id: string) => request<any>(`/businesses/${id}`, { method: "DELETE" }),

  listProducts: (bid: string) => request<any[]>(`/businesses/${bid}/products`),
  getProduct: (bid: string, pid: string) => request<any>(`/businesses/${bid}/products/${pid}`),
  createProduct: (bid: string, data: any) => request<any>(`/businesses/${bid}/products`, { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (bid: string, pid: string, data: any) => request<any>(`/businesses/${bid}/products/${pid}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (bid: string, pid: string) => request<any>(`/businesses/${bid}/products/${pid}`, { method: "DELETE" }),

  createStockEntry: (bid: string, data: any) => request<any>(`/businesses/${bid}/stock-entries`, { method: "POST", body: JSON.stringify(data) }),

  listCustomers: (bid: string) => request<any[]>(`/businesses/${bid}/customers`),
  getCustomer: (bid: string, cid: string) => request<any>(`/businesses/${bid}/customers/${cid}`),
  createCustomer: (bid: string, data: any) => request<any>(`/businesses/${bid}/customers`, { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (bid: string, cid: string, data: any) => request<any>(`/businesses/${bid}/customers/${cid}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomer: (bid: string, cid: string) => request<any>(`/businesses/${bid}/customers/${cid}`, { method: "DELETE" }),
  customerSales: (bid: string, cid: string) => request<any[]>(`/businesses/${bid}/customers/${cid}/sales`),

  listSales: (bid: string) => request<any[]>(`/businesses/${bid}/sales`),
  createSale: (bid: string, data: any) => request<any>(`/businesses/${bid}/sales`, { method: "POST", body: JSON.stringify(data) }),
  deleteSale: (bid: string, sid: string) => request<any>(`/businesses/${bid}/sales/${sid}`, { method: "DELETE" }),

  listTransactions: (bid: string) => request<any[]>(`/businesses/${bid}/transactions`),
  createTransaction: (bid: string, data: any) => request<any>(`/businesses/${bid}/transactions`, { method: "POST", body: JSON.stringify(data) }),
  deleteTransaction: (bid: string, tid: string) => request<any>(`/businesses/${bid}/transactions/${tid}`, { method: "DELETE" }),

  fxUsdHnl: () => request<{ rate: number; source: string; fetched_at: string }>("/fx/usd-to-hnl"),

  dashboard: (bid: string) => request<any>(`/businesses/${bid}/dashboard`),
};

export async function getActiveBusinessId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_BIZ_KEY);
}

export async function setActiveBusinessId(id: string | null) {
  if (!id) await AsyncStorage.removeItem(ACTIVE_BIZ_KEY);
  else await AsyncStorage.setItem(ACTIVE_BIZ_KEY, id);
}
