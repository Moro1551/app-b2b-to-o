import { format, isToday, isYesterday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hoy", "Ayer", "Lunes 5 de octubre", or "5 de octubre 2025" for other years. */
export function dayLabel(d: Date) {
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return capitalize(format(d, isThisYear(d) ? "EEEE d 'de' MMMM" : "d 'de' MMMM yyyy", { locale: es }));
}

/** "1:51 p.m." */
export function timeLabel(d: Date) {
  return format(d, "h:mm aaaa", { locale: es });
}

/** Local calendar day, for grouping. */
export function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}
