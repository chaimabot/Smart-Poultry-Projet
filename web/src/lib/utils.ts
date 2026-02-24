// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Merge de classes Tailwind avec gestion intelligente des conflits
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatte une date en français de manière lisible
 */
export function formatDate(
  date: string | Date | number,
  options: {
    withTime?: boolean;
    short?: boolean;
    relative?: boolean;
  } = {},
) {
  if (!date) return "—";

  const d = typeof date === "string" ? parseISO(date) : date;

  if (options.relative) {
    return formatDistanceToNow(d, {
      addSuffix: true,
      locale: fr,
    });
  }

  if (options.short) {
    return format(d, "dd/MM/yyyy", { locale: fr });
  }

  if (options.withTime) {
    return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
  }

  return format(d, "dd MMMM yyyy", { locale: fr });
}

/**
 * Formatte le temps écoulé depuis une date (spécialement pour "dernier ping", "dernière mesure", etc.)
 * Exemples : "il y a 2 min", "il y a 1 h", "il y a 3 jours"
 */
export function formatLastCheck(
  dateInput: string | Date | null | undefined,
): string {
  if (!dateInput) return "—";

  try {
    const date =
      typeof dateInput === "string" ? parseISO(dateInput) : dateInput;
    return formatDistanceToNow(date, {
      addSuffix: true,
      locale: fr,
    });
  } catch (err) {
    console.warn("Date invalide pour formatLastCheck:", dateInput);
    return "—";
  }
}

/**
 * Formatte un pourcentage avec 1 décimale si nécessaire
 */
export function formatPercent(
  value: number | string | null | undefined,
): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return num.toLocaleString("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/**
 * Formatte une température avec °C
 */
export function formatTemperature(
  value: string | number | null | undefined,
): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return `${num.toFixed(1)} °C`;
}

/**
 * Retourne des classes de couleur selon le statut
 */
export function getStatusColor(status: string): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (status?.toUpperCase()) {
    case "ONLINE":
    case "CONNECTE":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-600 dark:text-emerald-400",
        dot: "bg-emerald-500",
      };
    case "WARNING":
    case "ALERTE":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-600 dark:text-amber-400",
        dot: "bg-amber-500",
      };
    case "CRITICAL":
      return {
        bg: "bg-red-500/10",
        text: "text-red-600 dark:text-red-400",
        dot: "bg-red-500",
      };
    case "OFFLINE":
    case "HORS_LIGNE":
      return {
        bg: "bg-slate-500/10",
        text: "text-slate-600 dark:text-slate-400",
        dot: "bg-slate-400",
      };
    case "EN_ATTENTE":
      return {
        bg: "bg-yellow-500/10",
        text: "text-yellow-600 dark:text-yellow-400",
        dot: "bg-yellow-500",
      };
    default:
      return {
        bg: "bg-slate-400/10",
        text: "text-slate-500",
        dot: "bg-slate-400",
      };
  }
}

/**
 * Formate un nombre avec séparateur de milliers français
 */
export function formatNumber(
  value: number | string | null | undefined,
): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return num.toLocaleString("fr-FR");
}

/**
 * Tronque une chaîne et ajoute ... si trop longue
 */
export function truncate(str: string, length: number = 28): string {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + "...";
}
