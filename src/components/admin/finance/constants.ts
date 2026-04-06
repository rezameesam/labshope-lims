import {
  Landmark, CreditCard, Scale, TrendingUp, TrendingDown,
  type LucideIcon,
} from "lucide-react";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

export interface AccountTypeTheme {
  label: string;
  pluralLabel: string;
  icon: LucideIcon;
  /** Left accent bar on cards / ledger header */
  accent: string;
  /** Badge / pill */
  badge: string;
  /** Section header row in tables */
  sectionBg: string;
  /** Text color for amounts */
  text: string;
  /** Light tinted background for cards */
  cardBg: string;
  /** Border color */
  border: string;
  /** Dot / bullet color */
  dot: string;
  /** Print color (hex) */
  printColor: string;
}

export const ACCOUNT_THEME: Record<AccountType, AccountTypeTheme> = {
  asset: {
    label: "Asset",
    pluralLabel: "Assets",
    icon: Landmark,
    accent: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300",
    sectionBg: "bg-blue-50/80 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    cardBg: "bg-blue-50/50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
    printColor: "#2563eb",
  },
  liability: {
    label: "Liability",
    pluralLabel: "Liabilities",
    icon: CreditCard,
    accent: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300",
    sectionBg: "bg-rose-50/80 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
    border: "border-rose-200 dark:border-rose-800",
    dot: "bg-rose-500",
    printColor: "#e11d48",
  },
  equity: {
    label: "Equity",
    pluralLabel: "Equity",
    icon: Scale,
    accent: "bg-violet-500",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-300",
    sectionBg: "bg-violet-50/80 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    cardBg: "bg-violet-50/50 dark:bg-violet-950/20",
    border: "border-violet-200 dark:border-violet-800",
    dot: "bg-violet-500",
    printColor: "#7c3aed",
  },
  revenue: {
    label: "Revenue",
    pluralLabel: "Revenue",
    icon: TrendingUp,
    accent: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300",
    sectionBg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    printColor: "#059669",
  },
  expense: {
    label: "Expense",
    pluralLabel: "Expenses",
    icon: TrendingDown,
    accent: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
    sectionBg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    printColor: "#d97706",
  },
};

export const getTheme = (type: string): AccountTypeTheme =>
  ACCOUNT_THEME[type as AccountType] ?? ACCOUNT_THEME.asset;

/** Format number for display with INR locale */
export const fmt = (n: number): string =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
