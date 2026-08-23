import { getTranslations, setRequestLocale } from "next-intl/server";
import { deskApiFetch } from "@/lib/desk-api";

interface DeskEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  source: "manual" | "ai_suggested" | "external_sync";
  status: "draft" | "confirmed" | "cancelled";
  event_type: "meeting" | "follow_up_block";
  confidence_score: number | null;
}

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getWeekEvents(weekStart: Date): Promise<DeskEvent[] | null> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const res = await deskApiFetch(`events?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(weekEnd.toISOString())}`);
  if (!res?.ok) return null;
  return res.json();
}

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Calendar");

  const weekStart = mondayOf(new Date());
  const events = await getWeekEvents(weekStart);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>
        {t("weekOf")} {weekStart.toLocaleDateString(locale)}
      </p>

      {events === null ? (
        <p>{t("noEvents")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {weekDays.map((d) => (
                <th key={d.toISOString()}>{d.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {weekDays.map((day) => {
                const dayEvents = events.filter(
                  (e) => new Date(e.starts_at).toDateString() === day.toDateString(),
                );
                return (
                  <td key={day.toISOString()} style={{ verticalAlign: "top" }}>
                    {dayEvents.length === 0 && <span>—</span>}
                    {dayEvents.map((e) => (
                      <div key={e.id}>
                        <strong>{e.title}</strong>
                        <br />
                        {new Date(e.starts_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                        {" — "}
                        {e.source === "external_sync"
                          ? t("external")
                          : e.status === "confirmed"
                            ? t("confirmed")
                            : t("suggested")}
                        {e.confidence_score !== null && ` (${t("confidence")}: ${Math.round(e.confidence_score * 100)}%)`}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      )}
    </main>
  );
}
