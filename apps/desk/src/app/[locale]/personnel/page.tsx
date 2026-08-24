import { getTranslations, setRequestLocale } from "next-intl/server";
import { PersonnelTabs } from "./personnel-tabs";
import { PersonnelActions } from './personnel-actions';

export default async function PersonnelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Personnel");

  return (
    <main id="desk-main">
      <h1>{t("title")}</h1>
      <p>{t('subtitle')}</p>
      <PersonnelActions labels={{ selfService: t('selfService'), absence: t('absence'), type: t('type'), vacation: t('vacation'), sick: t('sick'), other: t('other'), start: t('start'), end: t('end'), note: t('note'), request: t('request'), overtime: t('extra'), date: t('date'), hours: t('hours'), submit: t('submit'), success: t('success'), error: t('error') }} />
      <PersonnelTabs locale={locale} labels={{
        monthlyTab: t("monthlyTab"), weeklyTab: t("weeklyTab"), workloadTab: t("workloadTab"), working: t("working"), vacation: t("vacation"), sick: t("sick"), faltaJustificada: t("faltaJustificada"), faltaInjustificada: t("faltaInjustificada"), off: t("off"), extra: t("extra"), approved: t("approved"), noExtra: t("noExtra"), pendingValidation: t("pendingValidation"), validated: t("validated"), openMissions: t("openMissions"), inProgressCount: t("inProgressCount"), availableDays: t("availableDays"), highLoad: t("highLoad"),
      }} />
    </main>
  );
}
