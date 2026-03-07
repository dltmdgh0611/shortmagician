import axios, { type AxiosInstance } from "axios";
import { auth } from "./firebase";
import { type User } from "firebase/auth";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 120_000, // 2 min — covers long GPT translation calls
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  async (config) => {
    const user: User | null = auth?.currentUser ?? null;
    if (user) {
      try {
        const token = await user.getIdToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch (_) {}
    }
    return config;
  },
  (e) => Promise.reject(e)
);
