"use client";

import { useEffect, useState } from "react";

interface Labels {
  monthlyTab: string; weeklyTab: string; workloadTab: string;
  working: string; vacation: string; sick: string;
  faltaJustificada: string; faltaInjustificada: string; off: string;
  extra: string; approved: string; noExtra: string;
  pendingValidation: string; validated: string;
  openMissions: string; inProgressCount: string; availableDays: string; highLoad: string;
}

interface Props {
  apiUrl: string;
  tenantId: string;
  locale: string;
  labels: Labels;
}

type Tab = "monthly" | "weekly" | "workload";

const absenceLabelKey: Record<string, keyof Labels> = {
  vacation: "vacation",
  sick: "sick",
  falta_justificada: "faltaJustificada",
  falta_injustificada: "faltaInjustificada",
};

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function PersonnelTabs({ apiUrl, tenantId, locale, labels }: Props) {
  const [tab, setTab] = useState<Tab>("monthly");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiUrl || !tenantId) return;
    setLoading(true);
    const now = new Date();

    let url = "";
    if (tab === "monthly") {
      url = `${apiUrl}/personnel/monthly-map?tenantId=${tenantId}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
    } else if (tab === "weekly") {
      const weekStart = mondayOf(now).toISOString().slice(0, 10);
      url = `${apiUrl}/personnel/weekly-view?tenantId=${tenantId}&weekStart=${weekStart}`;
    } else {
      const weekStart = mondayOf(now).toISOString().slice(0, 10);
      url = `${apiUrl}/personnel/workload-map?tenantId=${tenantId}&weekStart=${weekStart}`;
    }

    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [tab, apiUrl, tenantId]);

  return (
    <div>
      <nav>
        <button onClick={() => setTab("monthly")} aria-current={tab === "monthly"}>
          {labels.monthlyTab}
        </button>{" "}
        <button onClick={() => setTab("weekly")} aria-current={tab === "weekly"}>
          {labels.weeklyTab}
        </button>{" "}
        <button onClick={() => setTab("workload")} aria-current={tab === "workload"}>
          {labels.workloadTab}
        </button>
      </nav>

      {loading && <p>…</p>}

      {!loading && tab === "monthly" && data && (
        <table>
          <thead>
            <tr>
              <th></th>
              {data.days.map((d: any) => (
                <th key={d.date}>{new Date(d.date).getDate()}</th>
              ))}
              <th>{labels.extra}</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                {data.days.map((d: any) => {
                  const cell = d.users.find((x: any) => x.userId === u.id);
                  const label =
                    cell?.status === "absent"
                      ? labels[absenceLabelKey[cell.absenceType] ?? "vacation"]
                      : cell?.status === "working"
                        ? labels.working
                        : labels.off;
                  return <td key={d.date} title={label}>{cell?.status === "working" ? "●" : cell?.status === "absent" ? "▲" : "·"}</td>;
                })}
                <td>
                  {data.overtimeTotals?.[u.id] ? `${data.overtimeTotals[u.id]}h ${labels.approved}` : labels.noExtra}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && tab === "weekly" && data && (
        <table>
          <thead>
            <tr>
              <th></th>
              {data.weekDates.map((d: string) => (
                <th key={d}>{new Date(d + "T00:00:00Z").toLocaleDateString(locale, { weekday: "short", day: "numeric" })}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u: any) => (
              <tr key={u.userId}>
                <td>{u.email}</td>
                {u.days.map((d: any) => {
                  const label =
                    d.status === "absent"
                      ? labels[absenceLabelKey[d.absenceType] ?? "vacation"]
                      : d.status === "working"
                        ? labels.working
                        : labels.off;
                  return <td key={d.date}>{label}</td>;
                })}
                <td>{u.validation?.status === "validated" ? labels.validated : labels.pendingValidation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && tab === "workload" && data && (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{labels.openMissions}</th>
              <th>{labels.inProgressCount}</th>
              <th>{labels.availableDays}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.workload.map((w: any) => (
              <tr key={w.userId}>
                <td>{w.email}</td>
                <td>{w.missionsOpen}</td>
                <td>{w.tasksInProgress}</td>
                <td>{w.availableDaysThisWeek}</td>
                <td>{w.tasksInProgress >= 2 && w.availableDaysThisWeek <= 2 ? labels.highLoad : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !data && <p>—</p>}
    </div>
  );
}
