import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getApiBaseUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim() ?? "";
  if (!value) return "";
  if (value.includes("://apis:")) return "";
  return value.replace(/\/+$/, "");
}
