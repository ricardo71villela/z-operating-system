"use client";

import { useEffect, useState } from "react";

interface Labels { monthlyTab: string; weeklyTab: string; workloadTab: string; working: string; vacation: string; sick: string; faltaJustificada: string; faltaInjustificada: string; off: string; extra: string; approved: string; noExtra: string; pendingValidation: string; validated: string; openMissions: string; inProgressCount: string; availableDays: string; highLoad: string; }
interface Props { locale: string; labels: Labels; }
type Tab = "monthly" | "weekly" | "workload";
const absenceLabelKey: Record<string, keyof Labels> = { vacation: "vacation", sick: "sick", falta_justificada: "faltaJustificada", falta_injustificada: "faltaInjustificada" };
function mondayOf(d: Date): Date { const date = new Date(d); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; date.setDate(date.getDate() + diff); date.setHours(0,0,0,0); return date; }

export function PersonnelTabs({ locale, labels }: Props) {
  const [tab, setTab] = useState<Tab>("monthly");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true); const now = new Date(); let url = "";
    if (tab === "monthly") url = `/api/desk/personnel/monthly-map?year=${now.getFullYear()}&month=${now.getMonth()+1}`;
    else { const weekStart = mondayOf(now).toISOString().slice(0,10); url = tab === "weekly" ? `/api/desk/personnel/weekly-view?weekStart=${weekStart}` : `/api/desk/personnel/workload-map?weekStart=${weekStart}`; }
    fetch(url,{ cache:"no-store" }).then((r) => r.ok ? r.json() : null).then(setData).finally(() => setLoading(false));
  }, [tab]);

  return <section>
    <nav className="tab-nav" aria-label="Personnel views">
      <button onClick={() => setTab("monthly")} aria-current={tab === "monthly"}>{labels.monthlyTab}</button>
      <button onClick={() => setTab("weekly")} aria-current={tab === "weekly"}>{labels.weeklyTab}</button>
      <button onClick={() => setTab("workload")} aria-current={tab === "workload"}>{labels.workloadTab}</button>
    </nav>
    {loading && <div className="panel empty-state" role="status">…</div>}
    {!loading && !data && <div className="panel empty-state">—</div>}

    {!loading && tab === "monthly" && data && <div className="data-table-wrap"><table><thead><tr><th></th>{data.days.map((d:any) => <th key={d.date}>{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</th>)}<th>{labels.extra}</th></tr></thead><tbody>{data.users.map((u:any) => <tr key={u.id}><td><strong>{u.displayName || u.email}</strong></td>{data.days.map((d:any) => { const cell = d.users.find((x:any) => x.userId === u.id); const label = cell?.status === "absent" ? labels[absenceLabelKey[cell.absenceType] ?? "vacation"] : cell?.status === "working" ? labels.working : labels.off; return <td key={d.date} title={label}><span className={`schedule-dot ${cell?.status || 'off'}`}>{cell?.status === "working" ? "●" : cell?.status === "absent" ? "▲" : "·"}</span></td>; })}<td>{data.overtimeTotals?.[u.id] ? `${data.overtimeTotals[u.id]}h ${labels.approved}` : labels.noExtra}</td></tr>)}</tbody></table></div>}

    {!loading && tab === "weekly" && data && <div className="data-table-wrap"><table><thead><tr><th></th>{data.weekDates.map((d:string) => <th key={d}>{new Date(`${d}T00:00:00Z`).toLocaleDateString(locale,{weekday:"short",day:"numeric"})}</th>)}<th></th></tr></thead><tbody>{data.users.map((u:any) => <tr key={u.userId}><td><strong>{u.displayName || u.email}</strong></td>{u.days.map((d:any) => { const label = d.status === "absent" ? labels[absenceLabelKey[d.absenceType] ?? "vacation"] : d.status === "working" ? labels.working : labels.off; return <td key={d.date}><span className={`badge ${d.status === 'absent' ? 'red' : d.status === 'working' ? 'green' : ''}`}>{label}</span></td>; })}<td><span className={`badge ${u.validation?.status === 'validated' ? 'green' : 'gold'}`}>{u.validation?.status === "validated" ? labels.validated : labels.pendingValidation}</span></td></tr>)}</tbody></table></div>}

    {!loading && tab === "workload" && data && <div className="data-table-wrap"><table><thead><tr><th></th><th>{labels.openMissions}</th><th>{labels.inProgressCount}</th><th>{labels.availableDays}</th><th></th></tr></thead><tbody>{data.workload.map((w:any) => { const high = w.tasksInProgress >= 2 && w.availableDaysThisWeek <= 2; return <tr key={w.userId}><td><strong>{w.displayName || w.email}</strong></td><td>{w.missionsOpen}</td><td>{w.tasksInProgress}</td><td>{w.availableDaysThisWeek}</td><td>{high ? <span className="badge red">{labels.highLoad}</span> : <span className="badge green">OK</span>}</td></tr>; })}</tbody></table></div>}
  </section>;
}
