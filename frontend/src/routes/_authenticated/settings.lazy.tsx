import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  Copy,
  Database,
  Download,
  Fingerprint,
  Globe,
  History,
  Info,
  Key,
  Keyboard,
  Link,
  Loader2,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Rss,
  ScanFace,
  Settings2,
  Shield,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  CalendarResponse,
  DomainResponse,
  PasskeyInfo,
  PreferencesResponse,
  SnapshotInfo,
} from "@/api/model";
import { useGetUserActivityApiV1ActivityGet } from "@/api/queries/activity/activity";
import {
  getGetCalendarsApiV1CalendarsGetQueryKey,
  useGetCalendarsApiV1CalendarsGet,
  useSetCalendarSelectionsApiV1CalendarsSelectionsPost,
} from "@/api/queries/api/api";
import { useDisconnectTodoistAuthTodoistDisconnectPost } from "@/api/queries/auth/auth";
import {
  getListSnapshotsApiV1BackupSnapshotsGetQueryKey,
  useCreateManualSnapshotApiV1BackupSnapshotsPost,
  useDeleteSnapshotApiV1BackupSnapshotsSnapshotIdDelete,
  useListSnapshotsApiV1BackupSnapshotsGet,
  useRestoreSnapshotApiV1BackupSnapshotsSnapshotIdRestorePost,
  useToggleSnapshotsApiV1BackupSnapshotsEnabledPut,
} from "@/api/queries/backup/backup";
import { useGetBuildInfoApiV1BuildInfoGet } from "@/api/queries/build/build";
import {
  getGetFeedStatusApiV1CalendarFeedStatusGetQueryKey,
  useDisableFeedApiV1CalendarFeedDisablePost,
  useEnableFeedApiV1CalendarFeedEnablePost,
  useGetFeedStatusApiV1CalendarFeedStatusGet,
  useRegenerateFeedApiV1CalendarFeedRegeneratePost,
} from "@/api/queries/calendar-feed/calendar-feed";
import {
  getListDomainsApiV1DomainsGetQueryKey,
  useBatchUpdateDomainsApiV1DomainsBatchUpdatePost,
  useCreateDomainApiV1DomainsPost,
  useDeleteDomainApiV1DomainsDomainIdDelete,
  useListDomainsApiV1DomainsGet,
  useUpdateDomainApiV1DomainsDomainIdPut,
} from "@/api/queries/domains/domains";
import {
  getGetSyncStatusApiV1GcalSyncStatusGetQueryKey,
  useDisableSyncApiV1GcalSyncDisablePost,
  useEnableSyncApiV1GcalSyncEnablePost,
  useFullSyncApiV1GcalSyncFullSyncPost,
  useGetSyncStatusApiV1GcalSyncStatusGet,
} from "@/api/queries/gcal-sync/gcal-sync";
import {
  useImportFromTodoistApiV1ImportTodoistPost,
  usePreviewTodoistImportApiV1ImportTodoistPreviewGet,
  useWipeUserDataApiV1ImportWipePost,
} from "@/api/queries/import/import";
import {
  getListPasskeysApiV1PasskeysGetQueryKey,
  useDeletePasskeyApiV1PasskeysPasskeyIdDelete,
  useListPasskeysApiV1PasskeysGet,
} from "@/api/queries/passkeys/passkeys";
import {
  getGetEncryptionStatusApiV1PreferencesEncryptionGetQueryKey,
  getGetPreferencesApiV1PreferencesGetQueryKey,
  useDisableEncryptionApiV1PreferencesEncryptionDisablePost,
  useGetEncryptionStatusApiV1PreferencesEncryptionGet,
  useGetPreferencesApiV1PreferencesGet,
  useSetupEncryptionApiV1PreferencesEncryptionSetupPost,
  useUpdatePreferencesApiV1PreferencesPut,
} from "@/api/queries/preferences/preferences";
import {
  getGetAllContentApiV1TasksAllContentGetQueryKey,
  getListTasksApiV1TasksGetQueryKey,
  useBatchUpdateTasksApiV1TasksBatchUpdatePost,
  useGetAllContentApiV1TasksAllContentGet,
} from "@/api/queries/tasks/tasks";
import {
  getGetWizardStatusApiV1WizardStatusGetQueryKey,
  useResetWizardApiV1WizardResetPost,
} from "@/api/queries/wizard/wizard";
import { ActivityList } from "@/components/activity/activity-list";
import { TimezonePicker } from "@/components/timezone-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useCrypto } from "@/hooks/use-crypto";
import { isTauri } from "@/hooks/use-device";
import {
  type DomainContentData,
  decryptAllData,
  encryptAllData,
  setupEncryption,
  type TaskContentData,
} from "@/lib/crypto";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { isSupported as isPasskeySupported, registerPasskey } from "@/lib/passkey";
import { biometryLabel } from "@/lib/tauri-biometric";
import { useCryptoStore } from "@/stores/crypto-store";
import { useUIStore } from "@/stores/ui-store";

export const Route = createLazyFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

// ============================================================================
// Main Settings Page
// ============================================================================

function SettingsPage() {
  const { t } = useTranslation();
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8 pb-nav-safe md:pb-8">
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <ThemeSection />
        <Separator />
        <LanguageSection />
        <Separator />
        <TimezoneSection />
        <Separator />
        <GoogleCalendarSection />
        <Separator />
        <GCalSyncSection />
        <Separator />
        <CalendarFeedSection />
        <Separator />
        <TodoistSection />
        <Separator />
        <EncryptionSection />
        <Separator />
        <DomainsSection />
        <Separator />
        <DataSection />
        <Separator />
        <ActivitySection />
        <Separator />
        <ShortcutsSection />
        <Separator />
        <SetupSection />
        <Separator />
        <AboutSection />
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// Theme Section
// ============================================================================

function ThemeSection() {
  const { t } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <SettingsCard title={t("settings.display.title")} icon={<Sun className="h-4 w-4" />}>
      <Label className="text-sm text-muted-foreground">{t("settings.display.theme")}</Label>
      <div className="flex gap-2">
        {[
          {
            value: "light" as const,
            label: t("settings.display.light"),
            icon: <Sun className="h-4 w-4" />,
          },
          {
            value: "dark" as const,
            label: t("settings.display.dark"),
            icon: <Moon className="h-4 w-4" />,
          },
          {
            value: "system" as const,
            label: t("settings.display.system"),
            icon: <Monitor className="h-4 w-4" />,
          },
        ].map((opt) => (
          <Button
            key={opt.value}
            variant={theme === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme(opt.value)}
            className="flex items-center gap-1.5"
          >
            {opt.icon}
            {opt.label}
          </Button>
        ))}
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Language Section
// ============================================================================

function LanguageSection() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);

  return (
    <SettingsCard title={t("settings.language.title")} icon={<Globe className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">{t("settings.language.description")}</p>
      <div className="grid grid-cols-2 gap-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Button
            key={lang.code}
            variant={locale === lang.code ? "default" : "outline"}
            size="sm"
            className="justify-start"
            onClick={() => useUIStore.getState().setLocale(lang.code)}
          >
            {lang.nativeName} ({lang.name})
          </Button>
        ))}
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Timezone Section
// ============================================================================

function SecondaryTimezoneToggle() {
  const { t } = useTranslation();
  const show = useUIStore((s) => s.showSecondaryTimezone);
  const setShow = useUIStore((s) => s.setShowSecondaryTimezone);
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">{t("settings.timezone.showOnCalendar")}</p>
      <Switch size="sm" checked={show} onCheckedChange={setShow} />
    </div>
  );
}

function TimezoneSection() {
  const { t } = useTranslation();
  const prefsQuery = useGetPreferencesApiV1PreferencesGet();
  const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();
  const queryClient = useQueryClient();

  const currentTz = prefsQuery.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const secondaryTz = prefsQuery.data?.secondary_timezone ?? null;

  return (
    <SettingsCard title={t("settings.timezone.title")} icon={<Calendar className="h-4 w-4" />}>
      <TimezonePicker
        value={currentTz}
        onChange={(tz) => {
          if (!tz) return;
          queryClient.setQueryData<PreferencesResponse>(
            getGetPreferencesApiV1PreferencesGetQueryKey(),
            (old) => (old ? { ...old, timezone: tz } : old),
          );
          updatePrefs.mutate(
            { data: { timezone: tz } },
            {
              onSettled: () => {
                queryClient.invalidateQueries({
                  queryKey: getGetPreferencesApiV1PreferencesGetQueryKey(),
                });
              },
              onSuccess: () => toast.success(t("settings.timezone.updated")),
              onError: () => toast.error(t("settings.timezone.failedToUpdate")),
            },
          );
        }}
      />
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs text-muted-foreground">{t("settings.timezone.secondaryHint")}</p>
        <TimezonePicker
          value={secondaryTz}
          onChange={(tz) => {
            queryClient.setQueryData<PreferencesResponse>(
              getGetPreferencesApiV1PreferencesGetQueryKey(),
              (old) => (old ? { ...old, secondary_timezone: tz ?? null } : old),
            );
            updatePrefs.mutate(
              { data: { secondary_timezone: tz ?? "" } },
              {
                onSettled: () => {
                  queryClient.invalidateQueries({
                    queryKey: getGetPreferencesApiV1PreferencesGetQueryKey(),
                  });
                },
                onSuccess: () =>
                  toast.success(
                    tz
                      ? t("settings.timezone.secondaryUpdated")
                      : t("settings.timezone.secondaryCleared"),
                  ),
                onError: () => toast.error(t("settings.timezone.failedToUpdateSecondary")),
              },
            );
          }}
          allowClear
          placeholder={t("settings.timezone.secondaryPlaceholder")}
        />
        {secondaryTz && <SecondaryTimezoneToggle />}
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Google Calendar Section
// ============================================================================

function GoogleCalendarSection() {
  const { t } = useTranslation();
  const calendarsQuery = useGetCalendarsApiV1CalendarsGet();
  const saveSelections = useSetCalendarSelectionsApiV1CalendarsSelectionsPost();
  const queryClient = useQueryClient();

  const calendars = calendarsQuery.data as CalendarResponse[] | undefined;
  const isConnected = calendars && calendars.length > 0;

  const toggleCalendar = (calId: string, enabled: boolean) => {
    if (!calendars) return;
    const enabledIds = calendars
      .map((c) => ({ ...c, enabled: c.id === calId ? enabled : c.enabled }))
      .filter((c) => c.enabled)
      .map((c) => c.id);
    saveSelections.mutate(
      { data: { calendar_ids: enabledIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCalendarsApiV1CalendarsGetQueryKey() });
          toast.success(t("settings.gcal.calendarUpdated"));
        },
        onError: () => toast.error(t("settings.gcal.failedToUpdateCalendar")),
      },
    );
  };

  return (
    <SettingsCard title={t("settings.gcal.title")} icon={<Calendar className="h-4 w-4" />}>
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{t("common.connected")}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/auth/google";
              }}
            >
              {t("settings.gcal.reconnect")}
            </Button>
          </div>
          <div className="space-y-2">
            {calendars.map((cal) => (
              <div
                key={cal.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cal.background_color }}
                  />
                  <span className="text-sm">{cal.summary}</span>
                  {cal.primary && (
                    <Badge variant="outline" className="text-xs">
                      {t("common.primary")}
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={cal.enabled}
                  onCheckedChange={(checked) => toggleCalendar(cal.id, checked)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("settings.gcal.connectDescription")}</p>
          <Button
            onClick={() => {
              window.location.href = "/auth/google";
            }}
          >
            <Link className="mr-2 h-4 w-4" />
            {t("settings.gcal.connectButton")}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

// ============================================================================
// GCal Sync Section
// ============================================================================

function GCalSyncSection() {
  const { t } = useTranslation();
  const syncQuery = useGetSyncStatusApiV1GcalSyncStatusGet();
  const enableSync = useEnableSyncApiV1GcalSyncEnablePost();
  const disableSync = useDisableSyncApiV1GcalSyncDisablePost();
  const fullSync = useFullSyncApiV1GcalSyncFullSyncPost();
  const queryClient = useQueryClient();
  const autoEnableTriggered = useRef(false);

  const syncStatus = syncQuery.data;

  // Auto-enable sync after returning from Google OAuth write scope upgrade.
  // The OAuth callback redirects here with ?gcal_auto_enable=true.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_auto_enable") === "true" && !autoEnableTriggered.current) {
      autoEnableTriggered.current = true;
      // Clean URL without triggering navigation
      window.history.replaceState({}, "", window.location.pathname);
      enableSync.mutate(undefined, {
        onSuccess: (data) => {
          if (!data.reauth_url) {
            queryClient.invalidateQueries({
              queryKey: getGetSyncStatusApiV1GcalSyncStatusGetQueryKey(),
            });
            toast.success(t("settings.gcalSync.enabled"));
          }
        },
        onError: () => toast.error(t("settings.gcalSync.failedToEnable")),
      });
    }
  }, []);

  const handleToggle = (checked: boolean) => {
    if (checked) {
      enableSync.mutate(undefined, {
        onSuccess: (data) => {
          if (data.reauth_url) {
            window.location.href = data.reauth_url;
          } else {
            queryClient.invalidateQueries({
              queryKey: getGetSyncStatusApiV1GcalSyncStatusGetQueryKey(),
            });
            toast.success(t("settings.gcalSync.enabled"));
          }
        },
        onError: () => toast.error(t("settings.gcalSync.failedToEnable")),
      });
    } else {
      disableSync.mutate(
        { data: { delete_events: false } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getGetSyncStatusApiV1GcalSyncStatusGetQueryKey(),
            });
            toast.success(t("settings.gcalSync.disabled"));
          },
          onError: () => toast.error(t("settings.gcalSync.failedToDisable")),
        },
      );
    }
  };

  return (
    <SettingsCard title={t("settings.gcalSync.title")} icon={<RotateCcw className="h-4 w-4" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("settings.gcalSync.oneWay")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.gcalSync.description")}</p>
        </div>
        <Switch
          checked={syncStatus?.enabled ?? false}
          onCheckedChange={handleToggle}
          disabled={enableSync.isPending || disableSync.isPending}
        />
      </div>
      {syncStatus?.enabled && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {syncStatus.synced_count != null &&
              t("settings.gcalSync.tasksSynced", { count: syncStatus.synced_count })}
            {syncStatus.sync_error && (
              <span className="text-destructive ml-2">{syncStatus.sync_error}</span>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              fullSync.mutate(undefined, {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getGetSyncStatusApiV1GcalSyncStatusGetQueryKey(),
                  });
                  toast.success(t("settings.gcalSync.fullSyncStarted"));
                },
                onError: () => toast.error(t("settings.gcalSync.failedToStartSync")),
              });
            }}
            disabled={fullSync.isPending}
          >
            {fullSync.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            {t("settings.gcalSync.resync")}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

// ============================================================================
// Calendar Feed Section
// ============================================================================

function CalendarFeedSection() {
  const { t } = useTranslation();
  const feedQuery = useGetFeedStatusApiV1CalendarFeedStatusGet();
  const enableFeed = useEnableFeedApiV1CalendarFeedEnablePost();
  const disableFeed = useDisableFeedApiV1CalendarFeedDisablePost();
  const regenerateFeed = useRegenerateFeedApiV1CalendarFeedRegeneratePost();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const feedStatus = feedQuery.data;
  const isBlocked = feedStatus?.encryption_enabled ?? false;

  const invalidateFeedStatus = () => {
    queryClient.invalidateQueries({
      queryKey: getGetFeedStatusApiV1CalendarFeedStatusGetQueryKey(),
    });
  };

  const handleToggle = (checked: boolean) => {
    if (checked) {
      enableFeed.mutate(undefined, {
        onSuccess: () => {
          invalidateFeedStatus();
          toast.success(t("settings.calendarFeed.enabled"));
        },
        onError: () => toast.error(t("settings.calendarFeed.failedToEnable")),
      });
    } else {
      disableFeed.mutate(undefined, {
        onSuccess: () => {
          invalidateFeedStatus();
          toast.success(t("settings.calendarFeed.disabled"));
        },
        onError: () => toast.error(t("settings.calendarFeed.failedToDisable")),
      });
    }
  };

  const handleCopy = async () => {
    if (!feedStatus?.feed_url) return;
    try {
      await navigator.clipboard.writeText(feedStatus.feed_url);
      setCopied(true);
      toast.success(t("settings.calendarFeed.urlCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("settings.calendarFeed.failedToCopy"));
    }
  };

  const handleRegenerate = () => {
    regenerateFeed.mutate(undefined, {
      onSuccess: () => {
        invalidateFeedStatus();
        setShowRegenConfirm(false);
        toast.success(t("settings.calendarFeed.urlRegenerated"));
      },
      onError: () => toast.error(t("settings.calendarFeed.failedToRegenerate")),
    });
  };

  return (
    <SettingsCard title={t("settings.calendarFeed.title")} icon={<Rss className="h-4 w-4" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("settings.calendarFeed.icalFeed")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.calendarFeed.description")}</p>
        </div>
        <Switch
          checked={feedStatus?.enabled ?? false}
          onCheckedChange={handleToggle}
          disabled={isBlocked || enableFeed.isPending || disableFeed.isPending}
        />
      </div>

      {isBlocked && (
        <p className="text-xs text-muted-foreground">
          {t("settings.calendarFeed.encryptionBlocked")}
        </p>
      )}

      {feedStatus?.enabled && feedStatus.feed_url && (
        <div className="space-y-3">
          {/* Feed URL */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("settings.calendarFeed.feedUrl")}
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={feedStatus.feed_url}
                className="font-mono text-xs h-8"
                onFocus={(e) => e.target.select()}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.calendarFeed.pasteHint")}</p>
          </div>

          {/* GCal sync overlap warning */}
          {feedStatus.gcal_sync_enabled && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("settings.calendarFeed.gcalSyncWarning")}
              </p>
            </div>
          )}

          {/* Regenerate */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("settings.calendarFeed.regenerateHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowRegenConfirm(true)}
            >
              <RefreshCw className="h-3 w-3" />
              {t("settings.calendarFeed.regenerateUrl")}
            </Button>
          </div>
        </div>
      )}

      {/* Regenerate confirmation dialog */}
      <Dialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.calendarFeed.regenerateTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.calendarFeed.regenerateDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleRegenerate} disabled={regenerateFeed.isPending}>
              {regenerateFeed.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("settings.calendarFeed.regenerate")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

// ============================================================================
// Todoist Section
// ============================================================================

function TodoistSection() {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = usePreviewTodoistImportApiV1ImportTodoistPreviewGet({
    query: { enabled: showPreview },
  });
  const importMutation = useImportFromTodoistApiV1ImportTodoistPost();
  const disconnectTodoist = useDisconnectTodoistAuthTodoistDisconnectPost();
  const queryClient = useQueryClient();

  return (
    <SettingsCard title={t("settings.todoist.title")} icon={<Download className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">{t("settings.todoist.description")}</p>
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/auth/todoist";
          }}
        >
          <Link className="mr-2 h-4 w-4" />
          {t("settings.todoist.connectButton")}
        </Button>
        <Button variant="outline" onClick={() => setShowPreview(true)}>
          {t("settings.todoist.previewImport")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            disconnectTodoist.mutate(undefined, {
              onSuccess: () => toast.success(t("settings.todoist.disconnected")),
              onError: () => toast.error(t("settings.todoist.failedToDisconnect")),
            });
          }}
          disabled={disconnectTodoist.isPending}
        >
          {disconnectTodoist.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {t("settings.todoist.disconnect")}
        </Button>
      </div>

      {showPreview && previewQuery.data && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">{t("settings.todoist.importPreview")}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t("settings.todoist.projects", { count: previewQuery.data.projects_count })}</p>
            <p>{t("settings.todoist.tasks", { count: previewQuery.data.tasks_count })}</p>
            <p>{t("settings.todoist.subtasks", { count: previewQuery.data.subtasks_count })}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                importMutation.mutate(
                  { data: null },
                  {
                    onSuccess: (data) => {
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      });
                      queryClient.invalidateQueries({
                        queryKey: getListDomainsApiV1DomainsGetQueryKey(),
                      });
                      toast.success(
                        t("settings.todoist.importedTasks", { count: data.tasks_created }),
                      );
                      setShowPreview(false);
                    },
                    onError: () => toast.error(t("settings.todoist.importFailed")),
                  },
                );
              }}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {t("settings.todoist.importAll")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

// ============================================================================
// Encryption Section
// ============================================================================

function EncryptionSection() {
  const { t } = useTranslation();
  const encryptionQuery = useGetEncryptionStatusApiV1PreferencesEncryptionGet();
  const setupMutation = useSetupEncryptionApiV1PreferencesEncryptionSetupPost();
  const disableMutation = useDisableEncryptionApiV1PreferencesEncryptionDisablePost();
  const passkeysQuery = useListPasskeysApiV1PasskeysGet();
  const deletePasskeyMutation = useDeletePasskeyApiV1PasskeysPasskeyIdDelete();

  // Use /all-content endpoint to get ALL tasks (including subtasks, completed, archived)
  const allContentQuery = useGetAllContentApiV1TasksAllContentGet();
  const batchTasks = useBatchUpdateTasksApiV1TasksBatchUpdatePost();
  const batchDomains = useBatchUpdateDomainsApiV1DomainsBatchUpdatePost();

  const queryClient = useQueryClient();
  const setKey = useCryptoStore((s) => s.setKey);
  const clearKey = useCryptoStore((s) => s.clearKey);
  const biometricEnabled = useCryptoStore((s) => s.biometricEnabled);
  const biometricAvailable = useCryptoStore((s) => s.biometricAvailable);
  const biometryType = useCryptoStore((s) => s.biometryType);
  const isUnlocked = useCryptoStore((s) => s.isUnlocked);
  const checkBiometric = useCryptoStore((s) => s.checkBiometric);
  const enrollBiometric = useCryptoStore((s) => s.enrollBiometric);
  const disableBiometric = useCryptoStore((s) => s.disableBiometric);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [togglingBiometric, setTogglingBiometric] = useState(false);

  // Check biometric availability on mount (Tauri only)
  useEffect(() => {
    if (isTauri) {
      checkBiometric();
    }
  }, [checkBiometric]);

  const encryptionEnabled = encryptionQuery.data?.enabled ?? false;
  const passkeys = (passkeysQuery.data as { passkeys?: PasskeyInfo[] } | undefined)?.passkeys ?? [];

  const handleToggleBiometric = async () => {
    setTogglingBiometric(true);
    try {
      if (biometricEnabled) {
        await disableBiometric();
        toast.success(t("settings.encryption.biometricDisabled"));
      } else {
        if (!isUnlocked) {
          toast.error(t("settings.encryption.unlockFirst"));
          return;
        }
        await enrollBiometric();
        toast.success(
          t("settings.encryption.biometricEnabled", { type: biometryLabel(biometryType) }),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(
        t("settings.encryption.biometricFailed", {
          action: biometricEnabled ? "disable" : "enable",
          message: msg,
        }),
      );
    } finally {
      setTogglingBiometric(false);
    }
  };

  const handleEnable = async () => {
    if (passphrase.length < 8) {
      toast.error(t("settings.encryption.passphraseTooShort"));
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error(t("settings.encryption.passphraseMismatch"));
      return;
    }

    setEnabling(true);
    try {
      const { salt, testValue } = await setupEncryption(passphrase);

      // Tell server encryption is enabled FIRST — if batch encryption
      // fails later, server knows encryption is on and client can retry.
      // The reverse (encrypted data + server unaware) would leave data unreadable.
      await setupMutation.mutateAsync({ data: { salt, test_value: testValue } });

      // Encrypt all existing task titles/descriptions and domain names
      // Uses /all-content which returns ALL tasks (subtasks, completed, archived)
      const allContent = allContentQuery.data;
      const tasks: TaskContentData[] = (allContent?.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? null,
      }));
      const domains: DomainContentData[] = (allContent?.domains ?? []).map((d) => ({
        id: d.id,
        name: d.name,
      }));

      const key = (await import("@/lib/crypto")).getStoredKey;
      const storedKey = await key();
      if (storedKey) {
        const encrypted = await encryptAllData(storedKey, tasks, domains);

        if (encrypted.tasks.length > 0) {
          await batchTasks.mutateAsync({ data: { tasks: encrypted.tasks } });
        }
        if (encrypted.domains.length > 0) {
          await batchDomains.mutateAsync({ data: { domains: encrypted.domains } });
        }

        await setKey(storedKey);
      }

      queryClient.invalidateQueries({
        queryKey: getGetEncryptionStatusApiV1PreferencesEncryptionGetQueryKey(),
      });
      queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetAllContentApiV1TasksAllContentGetQueryKey(),
      });
      toast.success(t("settings.encryption.enabled"));
      setShowEnableDialog(false);
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t("settings.encryption.failedToEnable", { message: msg }));
      console.error(err);
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    try {
      const storedKeyFn = (await import("@/lib/crypto")).getStoredKey;
      const storedKey = await storedKeyFn();

      if (storedKey) {
        // Uses /all-content which returns ALL tasks (subtasks, completed, archived)
        const allContent = allContentQuery.data;
        const tasks: TaskContentData[] = (allContent?.tasks ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
        }));
        const domains: DomainContentData[] = (allContent?.domains ?? []).map((d) => ({
          id: d.id,
          name: d.name,
        }));

        const decrypted = await decryptAllData(storedKey, tasks, domains);

        if (decrypted.tasks.length > 0) {
          await batchTasks.mutateAsync({ data: { tasks: decrypted.tasks } });
        }
        if (decrypted.domains.length > 0) {
          await batchDomains.mutateAsync({ data: { domains: decrypted.domains } });
        }
      }

      await disableMutation.mutateAsync(undefined);
      clearKey();

      queryClient.invalidateQueries({
        queryKey: getGetEncryptionStatusApiV1PreferencesEncryptionGetQueryKey(),
      });
      queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetAllContentApiV1TasksAllContentGetQueryKey(),
      });
      toast.success(t("settings.encryption.disabled"));
      setShowDisableDialog(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t("settings.encryption.failedToDisable", { message: msg }));
      console.error(err);
    } finally {
      setDisabling(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!passkeyName.trim()) {
      toast.error(t("settings.encryption.passkeyNameRequired"));
      return;
    }
    setRegisteringPasskey(true);
    try {
      const result = await registerPasskey(passkeyName.trim());
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: getListPasskeysApiV1PasskeysGetQueryKey() });
        toast.success(t("settings.encryption.passkeyRegistered"));
        setPasskeyName("");
      } else {
        toast.error(result.error ?? t("settings.encryption.registrationFailed"));
      }
    } finally {
      setRegisteringPasskey(false);
    }
  };

  return (
    <SettingsCard title={t("settings.encryption.title")} icon={<Shield className="h-4 w-4" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("settings.encryption.e2e")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.encryption.description")}</p>
        </div>
        {encryptionEnabled ? (
          <Button variant="destructive" size="sm" onClick={() => setShowDisableDialog(true)}>
            {t("settings.encryption.disable")}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setShowEnableDialog(true)}>
            {t("settings.encryption.enable")}
          </Button>
        )}
      </div>

      {encryptionEnabled && (
        <div className="space-y-3 pt-2">
          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">{t("settings.encryption.passkeys")}</p>
            {passkeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("settings.encryption.noPasskeys")}</p>
            ) : (
              <div className="space-y-1">
                {passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div>
                      <span className="text-sm">{pk.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(pk.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          !window.confirm(
                            t("settings.encryption.deletePasskeyConfirm", { name: pk.name }),
                          )
                        )
                          return;
                        deletePasskeyMutation.mutate(
                          { passkeyId: pk.id },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListPasskeysApiV1PasskeysGetQueryKey(),
                              });
                              toast.success(t("settings.encryption.passkeyDeleted"));
                            },
                            onError: () =>
                              toast.error(t("settings.encryption.failedToDeletePasskey")),
                          },
                        );
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {isPasskeySupported() && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder={t("settings.encryption.passkeyName")}
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleRegisterPasskey} disabled={registeringPasskey}>
                  {registeringPasskey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Key className="mr-1 h-3 w-3" /> {t("settings.encryption.addPasskey")}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Biometric Unlock (Tauri mobile only) */}
          {isTauri && biometricAvailable && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {biometryType === "FaceID" ? (
                    <ScanFace className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Fingerprint className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.encryption.biometricUnlock", {
                        type: biometryLabel(biometryType),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.encryption.biometricDescription")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={biometricEnabled}
                  onCheckedChange={handleToggleBiometric}
                  disabled={togglingBiometric || (!biometricEnabled && !isUnlocked)}
                />
              </div>
              {!isUnlocked && !biometricEnabled && (
                <p className="text-xs text-muted-foreground">
                  {t("settings.encryption.unlockFirstShort")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Enable Dialog */}
      <Dialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.encryption.enableTitle")}</DialogTitle>
            <DialogDescription>{t("settings.encryption.enableDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("settings.encryption.passphrase")}</Label>
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t("settings.encryption.passphrasePlaceholder")}
              />
            </div>
            <div>
              <Label>{t("settings.encryption.confirmPassphrase")}</Label>
              <Input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder={t("settings.encryption.confirmPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEnableDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleEnable} disabled={enabling}>
              {enabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.encryption.enableButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.encryption.disableTitle")}</DialogTitle>
            <DialogDescription>{t("settings.encryption.disableDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={disabling}>
              {disabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.encryption.disableButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

// ============================================================================
// Domains Section
// ============================================================================

function DomainsSection() {
  const { t } = useTranslation();
  const domainsQuery = useListDomainsApiV1DomainsGet();
  const createDomain = useCreateDomainApiV1DomainsPost();
  const updateDomain = useUpdateDomainApiV1DomainsDomainIdPut();
  const deleteDomain = useDeleteDomainApiV1DomainsDomainIdDelete();
  const queryClient = useQueryClient();
  const { encryptDomainName, decryptDomains } = useCrypto();

  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newColor, setNewColor] = useState("#6D5EF6");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editColor, setEditColor] = useState("");

  const domains = (domainsQuery.data ?? [])
    .filter((d) => !d.is_archived)
    .sort((a, b) => a.position - b.position);

  // Decrypt domain names for display and editing
  const [decryptedNameMap, setDecryptedNameMap] = useState<Map<number, string>>(new Map());
  const domainsFingerprint = useMemo(
    () => domains.map((d) => `${d.id}:${d.name?.slice(0, 8)}`).join(","),
    [domains],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptDomains(domains).then((result) => {
      if (!cancelled) {
        const map = new Map<number, string>();
        for (const d of result) map.set(d.id, d.name);
        setDecryptedNameMap(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [domainsFingerprint, decryptDomains]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const name = await encryptDomainName(newName.trim());
    createDomain.mutate(
      { data: { name, icon: newIcon || null, color: newColor || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
          toast.success(t("settings.domains.created"));
          setNewName("");
          setNewIcon("");
        },
        onError: () => toast.error(t("settings.domains.failedToCreate")),
      },
    );
  };

  const handleSave = async (id: number) => {
    const name = await encryptDomainName(editName.trim());
    updateDomain.mutate(
      { domainId: id, data: { name, icon: editIcon || null, color: editColor || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
          toast.success(t("settings.domains.updated"));
          setEditingId(null);
        },
        onError: () => toast.error(t("settings.domains.failedToUpdate")),
      },
    );
  };

  const batchUpdateDomains = useBatchUpdateDomainsApiV1DomainsBatchUpdatePost();

  const handleMove = (id: number, direction: "up" | "down") => {
    const idx = domains.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= domains.length) return;

    const current = domains[idx];
    const other = domains[swapIdx];

    batchUpdateDomains.mutate(
      {
        data: {
          domains: [
            { id: current.id, name: current.name, position: other.position },
            { id: other.id, name: other.name, position: current.position },
          ],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListDomainsApiV1DomainsGetQueryKey(),
          });
        },
        onError: () => toast.error(t("settings.domains.failedToReorder")),
      },
    );
  };

  const startEditing = (d: DomainResponse) => {
    setEditingId(d.id);
    setEditName(decryptedNameMap.get(d.id) ?? d.name);
    setEditIcon(d.icon ?? "");
    setEditColor(d.color ?? "#6D5EF6");
  };

  return (
    <SettingsCard title={t("settings.domains.title")} icon={<Database className="h-4 w-4" />}>
      <div className="space-y-2">
        {domains.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            {editingId === d.id ? (
              <>
                <Input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  className="w-12 text-center"
                  placeholder={t("settings.domains.iconPlaceholder")}
                />
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0"
                />
                <Button size="sm" onClick={() => handleSave(d.id)}>
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    disabled={domains.indexOf(d) === 0}
                    onClick={() => handleMove(d.id, "up")}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    disabled={domains.indexOf(d) === domains.length - 1}
                    onClick={() => handleMove(d.id, "down")}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-lg">{d.icon || "📁"}</span>
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: d.color ?? "#6D5EF6" }}
                />
                <span className="flex-1 text-sm">{decryptedNameMap.get(d.id) ?? d.name}</span>
                <Button size="sm" variant="ghost" onClick={() => startEditing(d)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deleteDomain.mutate(
                      { domainId: d.id },
                      {
                        onSuccess: () => {
                          queryClient.invalidateQueries({
                            queryKey: getListDomainsApiV1DomainsGetQueryKey(),
                          });
                          toast.success(t("settings.domains.archived"));
                        },
                        onError: () => toast.error(t("settings.domains.failedToArchive")),
                      },
                    );
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Input
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
          className="w-12 text-center"
          placeholder="🎯"
        />
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
          placeholder={t("settings.domains.newDomainPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded border-0"
        />
        <Button size="sm" onClick={handleCreate} disabled={createDomain.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Data Section
// ============================================================================

function DataSection() {
  const { t } = useTranslation();
  const snapshotsQuery = useListSnapshotsApiV1BackupSnapshotsGet();
  const createSnapshot = useCreateManualSnapshotApiV1BackupSnapshotsPost();
  const toggleSnapshots = useToggleSnapshotsApiV1BackupSnapshotsEnabledPut();
  const restoreSnapshot = useRestoreSnapshotApiV1BackupSnapshotsSnapshotIdRestorePost();
  const deleteSnapshot = useDeleteSnapshotApiV1BackupSnapshotsSnapshotIdDelete();
  const wipeMutation = useWipeUserDataApiV1ImportWipePost();
  const queryClient = useQueryClient();

  const [showWipeDialog, setShowWipeDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<number | null>(null);

  const snapshotData = snapshotsQuery.data as
    | { snapshots?: SnapshotInfo[]; enabled?: boolean }
    | undefined;
  const snapshots = snapshotData?.snapshots ?? [];
  const snapshotsEnabled = snapshotData?.enabled ?? false;

  const handleExport = () => {
    window.open("/api/v1/backup/export", "_blank");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const { importBackupApiV1BackupImportPost } = await import("@/api/queries/backup/backup");
      try {
        await importBackupApiV1BackupImportPost({ file });
        queryClient.invalidateQueries();
        toast.success(t("settings.data.backupImported"));
      } catch {
        toast.error(t("settings.data.importFailed"));
      }
    };
    input.click();
  };

  return (
    <SettingsCard title={t("settings.data.title")} icon={<Database className="h-4 w-4" />}>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-3 w-3" /> {t("settings.data.exportBackup")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Upload className="mr-1 h-3 w-3" /> {t("settings.data.importBackup")}
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("settings.data.automaticSnapshots")}</p>
          <Switch
            checked={snapshotsEnabled}
            onCheckedChange={() => {
              toggleSnapshots.mutate(undefined, {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getListSnapshotsApiV1BackupSnapshotsGetQueryKey(),
                  });
                  toast.success(t("settings.data.snapshotSettingUpdated"));
                },
                onError: () => toast.error(t("settings.data.failedToUpdateSnapshotSetting")),
              });
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            createSnapshot.mutate(undefined, {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getListSnapshotsApiV1BackupSnapshotsGetQueryKey(),
                });
                toast.success(t("settings.data.snapshotCreated"));
              },
              onError: () => toast.error(t("settings.data.failedToCreateSnapshot")),
            });
          }}
          disabled={createSnapshot.isPending}
        >
          {createSnapshot.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {t("settings.data.createSnapshotNow")}
        </Button>

        {snapshots.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs"
              >
                <span>{new Date(snap.created_at).toLocaleString()}</span>
                <span className="text-muted-foreground">
                  {(snap.size_bytes / 1024).toFixed(1)} KB
                  {snap.is_manual && (
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {t("common.manual")}
                    </Badge>
                  )}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    title={t("settings.data.download")}
                    onClick={() => {
                      window.open(`/api/v1/backup/snapshots/${snap.id}/download`, "_blank");
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    title={t("settings.data.restore")}
                    onClick={() => setShowRestoreDialog(snap.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    title={t("common.delete")}
                    onClick={() => {
                      deleteSnapshot.mutate(
                        { snapshotId: snap.id },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({
                              queryKey: getListSnapshotsApiV1BackupSnapshotsGetQueryKey(),
                            });
                          },
                        },
                      );
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <Button variant="destructive" size="sm" onClick={() => setShowWipeDialog(true)}>
          <Trash2 className="mr-1 h-3 w-3" /> {t("settings.data.wipeAllData")}
        </Button>
      </div>

      {/* Wipe Dialog */}
      <Dialog open={showWipeDialog} onOpenChange={setShowWipeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.data.wipeTitle")}</DialogTitle>
            <DialogDescription>{t("settings.data.wipeDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWipeDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                wipeMutation.mutate(undefined, {
                  onSuccess: () => {
                    queryClient.invalidateQueries();
                    toast.success(t("settings.data.allDataWiped"));
                    setShowWipeDialog(false);
                  },
                  onError: () => toast.error(t("settings.data.wipeFailed")),
                });
              }}
              disabled={wipeMutation.isPending}
            >
              {wipeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.data.wipeButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={showRestoreDialog !== null} onOpenChange={() => setShowRestoreDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.data.restoreTitle")}</DialogTitle>
            <DialogDescription>{t("settings.data.restoreDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRestoreDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (showRestoreDialog === null) return;
                restoreSnapshot.mutate(
                  { snapshotId: showRestoreDialog },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries();
                      toast.success(t("settings.data.restored"));
                      setShowRestoreDialog(null);
                    },
                    onError: () => toast.error(t("settings.data.failedToRestore")),
                  },
                );
              }}
              disabled={restoreSnapshot.isPending}
            >
              {restoreSnapshot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.data.restoreButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

// ============================================================================
// Activity Section
// ============================================================================

function ActivitySection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  const { data, isLoading, isError } = useGetUserActivityApiV1ActivityGet(
    { limit, offset: 0 },
    { query: { enabled: open } },
  );

  return (
    <SettingsCard title={t("settings.activity.title")} icon={<History className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">{t("settings.activity.recentActivity")}</p>
      <Button variant="outline" size="sm" className="text-xs" onClick={() => setOpen(true)}>
        {t("settings.activity.title")}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("settings.activity.title")}</SheetTitle>
            <SheetDescription>{t("settings.activity.recentActivity")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ActivityList entries={data?.entries ?? []} isLoading={isLoading} isError={isError} />
            {data && data.entries.length < data.total && limit < 200 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs mt-2"
                onClick={() => setLimit((prev) => Math.min(prev + 50, 200))}
              >
                {t("settings.activity.loadMore", { remaining: data.total - data.entries.length })}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </SettingsCard>
  );
}

// ============================================================================
// Shortcuts Section
// ============================================================================

function ShortcutsSection() {
  const { t } = useTranslation();
  const shortcuts = [
    { key: "?", desc: t("shortcuts.showShortcuts") },
    { key: "q", desc: t("shortcuts.quickAdd") },
    { key: "n", desc: t("shortcuts.newTask") },
    { key: "j / k", desc: t("shortcuts.nextTask") },
    { key: "c", desc: t("shortcuts.completeSelected") },
    { key: "e / Enter", desc: t("shortcuts.editSelected") },
    { key: "x", desc: t("shortcuts.deleteSelected") },
    { key: "Esc", desc: t("shortcuts.closePanelClear") },
  ];

  return (
    <SettingsCard title={t("settings.shortcuts.title")} icon={<Keyboard className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-1">
        {shortcuts.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">{s.key}</kbd>
            <span className="text-muted-foreground">{s.desc}</span>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Setup Section
// ============================================================================

function SetupSection() {
  const { t } = useTranslation();
  const resetWizard = useResetWizardApiV1WizardResetPost();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <SettingsCard title={t("settings.setup.title")} icon={<Settings2 className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">{t("settings.setup.rerunWizard")}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          resetWizard.mutate(undefined, {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getGetWizardStatusApiV1WizardStatusGetQueryKey(),
              });
              navigate({ to: "/" });
            },
            onError: () => toast.error(t("settings.setup.failedToReset")),
          });
        }}
        disabled={resetWizard.isPending}
      >
        {resetWizard.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        {t("settings.setup.rerunWizard")}
      </Button>
    </SettingsCard>
  );
}

// ============================================================================
// About Section
// ============================================================================

function AboutSection() {
  const { t } = useTranslation();
  const buildQuery = useGetBuildInfoApiV1BuildInfoGet();
  const buildInfo = buildQuery.data as
    | { version?: string; commit?: { sha: string; short: string } }
    | undefined;

  return (
    <SettingsCard title={t("settings.about.title")} icon={<Info className="h-4 w-4" />}>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">{t("settings.about.version")}:</span>{" "}
          {buildInfo?.version ?? "..."}
        </p>
        {buildInfo?.commit && (
          <p>
            <span className="text-muted-foreground">{t("settings.about.commit")}</span>{" "}
            {buildInfo.commit.short}
          </p>
        )}
      </div>
      <div className="flex gap-2 text-xs flex-wrap">
        <RouterLink to="/privacy" className="text-muted-foreground hover:underline">
          {t("settings.about.privacyPolicy")}
        </RouterLink>
        <RouterLink to="/terms" className="text-muted-foreground hover:underline">
          {t("settings.about.termsOfService")}
        </RouterLink>
        <a
          href="https://github.com/aleksandr-bogdanov/whendoist"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline"
        >
          {t("settings.about.github")}
        </a>
      </div>
    </SettingsCard>
  );
}

// ============================================================================
// Shared Card Component
// ============================================================================

function SettingsCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}
