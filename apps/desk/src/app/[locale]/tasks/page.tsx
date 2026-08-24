import { getTranslations, setRequestLocale } from "next-intl/server";
import { deskApiFetch } from "@/lib/desk-api";
import { TasksBoard } from './tasks-board';

interface DeskTask { id: string; title: string; description: string | null; assigned_to: string; task_type: "personal" | "mission"; status: "todo" | "in_progress" | "done"; due_date: string | null; }
interface Board { todo: DeskTask[]; in_progress: DeskTask[]; done: DeskTask[]; }

async function getBoard(): Promise<Board | null> {
  const res = await deskApiFetch("tasks");
  if (!res?.ok) return null;
  return res.json();
}

export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Tasks");
  const board = await getBoard();
  return (
    <main id="desk-main">
      <h1>{t("title")}</h1>
      <p>{t('subtitle')}</p>
      {board === null ? <p className="notice error">{t("noTasks")}</p> : <TasksBoard initialBoard={board} locale={locale} labels={{ todo: t('todo'), inProgress: t('inProgress'), done: t('done'), personal: t('personal'), mission: t('mission'), assignedTo: t('assignedTo'), noTasks: t('noTasks'), newTask: t('newTask'), title: t('taskTitle'), due: t('due'), create: t('create'), creating: t('creating'), moveBack: t('moveBack'), moveNext: t('moveNext') }} />}
    </main>
  );
}
