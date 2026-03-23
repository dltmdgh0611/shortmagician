export interface UserCreate {
  email: string;
  display_name: string;
  uid: string;
}

export interface UserResponse {
  uid: string;
  email: string;
  display_name: string;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  plan: string; // "free" | "earlybird"
  subscription_status: string; // "none" | "active"
  quota: Record<string, unknown>;
}

export interface UserUpdateRequest {
  display_name?: string;
}

export interface CreditResponse {
  daily_limit: number; // 10
  used_today: number;
  remaining: number;
  reset_date: string; // "YYYY-MM-DD"
  plan: string;
}

export interface EarlybirdRedeemRequest {
  code: string;
}

export interface EarlybirdRedeemResponse {
  success: boolean;
  plan: string;
  message: string;
}
