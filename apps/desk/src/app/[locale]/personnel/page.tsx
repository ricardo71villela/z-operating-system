import { getTranslations, setRequestLocale } from "next-intl/server";
import { PersonnelTabs } from "./personnel-tabs";

export default async function PersonnelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Personnel");

  return (
    <main>
      <h1>{t("title")}</h1>
      <PersonnelTabs
        locale={locale}
        labels={{
          monthlyTab: t("monthlyTab"),
          weeklyTab: t("weeklyTab"),
          workloadTab: t("workloadTab"),
          working: t("working"),
          vacation: t("vacation"),
          sick: t("sick"),
          faltaJustificada: t("faltaJustificada"),
          faltaInjustificada: t("faltaInjustificada"),
          off: t("off"),
          extra: t("extra"),
          approved: t("approved"),
          noExtra: t("noExtra"),
          pendingValidation: t("pendingValidation"),
          validated: t("validated"),
          openMissions: t("openMissions"),
          inProgressCount: t("inProgressCount"),
          availableDays: t("availableDays"),
          highLoad: t("highLoad"),
        }}
      />
    </main>
  );
}
