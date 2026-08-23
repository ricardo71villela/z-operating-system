import { getTranslations, setRequestLocale } from "next-intl/server";
import { deskApiFetch } from "@/lib/desk-api";

interface DeskTask {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  task_type: "personal" | "mission";
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
}

interface TasksBoard {
  todo: DeskTask[];
  in_progress: DeskTask[];
  done: DeskTask[];
}

async function getBoard(): Promise<TasksBoard | null> {
  const res = await deskApiFetch("tasks");
  if (!res?.ok) return null;
  return res.json();
}

export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Tasks");

  const board = await getBoard();

  const columns: { key: keyof TasksBoard; label: string }[] = [
    { key: "todo", label: t("todo") },
    { key: "in_progress", label: t("inProgress") },
    { key: "done", label: t("done") },
  ];

  return (
    <main>
      <h1>{t("title")}</h1>

      {board === null ? (
        <p>{t("noTasks")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((c) => (
                <td key={c.key} style={{ verticalAlign: "top" }}>
                  {board[c.key].length === 0 && <span>{t("noTasks")}</span>}
                  {board[c.key].map((task) => (
                    <div key={task.id}>
                      <span>{task.task_type === "mission" ? t("mission") : t("personal")}</span>
                      <br />
                      <strong>{task.title}</strong>
                      <br />
                      {t("assignedTo")}: {task.assigned_to}
                      {task.due_date && <> — {new Date(task.due_date).toLocaleDateString(locale)}</>}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </main>
  );
}
