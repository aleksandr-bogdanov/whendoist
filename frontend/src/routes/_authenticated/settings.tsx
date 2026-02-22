import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Database,
  Download,
  Info,
  Key,
  Keyboard,
  Link,
  Loader2,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  Shield,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CalendarResponse, DomainResponse, PasskeyInfo, SnapshotInfo } from "@/api/model";
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
  getListTasksApiV1TasksGetQueryKey,
  useBatchUpdateTasksApiV1TasksBatchUpdatePost,
  useListTasksApiV1TasksGet,
} from "@/api/queries/tasks/tasks";
import {
  getGetWizardStatusApiV1WizardStatusGetQueryKey,
  useResetWizardApiV1WizardResetPost,
} from "@/api/queries/wizard/wizard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCrypto } from "@/hooks/use-crypto";
import {
  type DomainContentData,
  decryptAllData,
  encryptAllData,
  setupEncryption,
  type TaskContentData,
} from "@/lib/crypto";
import { isSupported as isPasskeySupported, registerPasskey } from "@/lib/passkey";
import { useCryptoStore } from "@/stores/crypto-store";
import { useUIStore } from "@/stores/ui-store";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

// ============================================================================
// Main Settings Page
// ============================================================================

function SettingsPage() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <ThemeSection />
        <Separator />
        <TimezoneSection />
        <Separator />
        <GoogleCalendarSection />
        <Separator />
        <GCalSyncSection />
        <Separator />
        <TodoistSection />
        <Separator />
        <EncryptionSection />
        <Separator />
        <DomainsSection />
        <Separator />
        <DataSection />
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
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <SettingsCard title="Display" icon={<Sun className="h-4 w-4" />}>
      <Label className="text-sm text-muted-foreground">Theme</Label>
      <div className="flex gap-2">
        {[
          { value: "light" as const, label: "Light", icon: <Sun className="h-4 w-4" /> },
          { value: "dark" as const, label: "Dark", icon: <Moon className="h-4 w-4" /> },
          { value: "system" as const, label: "System", icon: <Monitor className="h-4 w-4" /> },
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
// Timezone Section
// ============================================================================

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function TimezoneSection() {
  const prefsQuery = useGetPreferencesApiV1PreferencesGet();
  const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();
  const queryClient = useQueryClient();

  const currentTz = prefsQuery.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <SettingsCard title="Timezone" icon={<Calendar className="h-4 w-4" />}>
      <Select
        value={currentTz}
        onValueChange={(value) => {
          updatePrefs.mutate(
            { data: { timezone: value } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getGetPreferencesApiV1PreferencesGetQueryKey(),
                });
                toast.success("Timezone updated");
              },
              onError: () => toast.error("Failed to update timezone"),
            },
          );
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMON_TIMEZONES.map((tz) => (
            <SelectItem key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsCard>
  );
}

// ============================================================================
// Google Calendar Section
// ============================================================================

function GoogleCalendarSection() {
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
          toast.success("Calendar updated");
        },
      },
    );
  };

  return (
    <SettingsCard title="Google Calendar" icon={<Calendar className="h-4 w-4" />}>
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">Connected</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/auth/google";
              }}
            >
              Reconnect
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
                      Primary
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
          <p className="text-sm text-muted-foreground">
            Connect Google Calendar to see your events alongside tasks.
          </p>
          <Button
            onClick={() => {
              window.location.href = "/auth/google";
            }}
          >
            <Link className="mr-2 h-4 w-4" />
            Connect Google Calendar
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
  const syncQuery = useGetSyncStatusApiV1GcalSyncStatusGet();
  const enableSync = useEnableSyncApiV1GcalSyncEnablePost();
  const disableSync = useDisableSyncApiV1GcalSyncDisablePost();
  const fullSync = useFullSyncApiV1GcalSyncFullSyncPost();
  const queryClient = useQueryClient();

  const syncStatus = syncQuery.data;

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
            toast.success("Calendar sync enabled");
          }
        },
        onError: () => toast.error("Failed to enable sync"),
      });
    } else {
      disableSync.mutate(
        { data: { delete_events: false } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getGetSyncStatusApiV1GcalSyncStatusGetQueryKey(),
            });
            toast.success("Calendar sync disabled");
          },
          onError: () => toast.error("Failed to disable sync"),
        },
      );
    }
  };

  return (
    <SettingsCard title="Google Calendar Sync" icon={<RotateCcw className="h-4 w-4" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">One-way sync to Google Calendar</p>
          <p className="text-xs text-muted-foreground">
            Scheduled tasks appear on your Google Calendar
          </p>
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
            {syncStatus.synced_count != null && <>{syncStatus.synced_count} tasks synced</>}
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
                  toast.success("Full sync started");
                },
                onError: () => toast.error("Failed to start sync"),
              });
            }}
            disabled={fullSync.isPending}
          >
            {fullSync.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Re-sync
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

// ============================================================================
// Todoist Section
// ============================================================================

function TodoistSection() {
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = usePreviewTodoistImportApiV1ImportTodoistPreviewGet({
    query: { enabled: showPreview },
  });
  const importMutation = useImportFromTodoistApiV1ImportTodoistPost();
  const disconnectTodoist = useDisconnectTodoistAuthTodoistDisconnectPost();
  const queryClient = useQueryClient();

  return (
    <SettingsCard title="Todoist Import" icon={<Download className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">Import tasks and projects from Todoist.</p>
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/auth/todoist";
          }}
        >
          <Link className="mr-2 h-4 w-4" />
          Connect Todoist
        </Button>
        <Button variant="outline" onClick={() => setShowPreview(true)}>
          Preview Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            disconnectTodoist.mutate(undefined, {
              onSuccess: () => toast.success("Todoist disconnected"),
              onError: () => toast.error("Failed to disconnect Todoist"),
            });
          }}
          disabled={disconnectTodoist.isPending}
        >
          {disconnectTodoist.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Disconnect
        </Button>
      </div>

      {showPreview && previewQuery.data && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">Import Preview</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{previewQuery.data.projects_count} projects</p>
            <p>{previewQuery.data.tasks_count} tasks</p>
            <p>{previewQuery.data.subtasks_count} subtasks</p>
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
                      toast.success(`Imported ${data.tasks_created} tasks`);
                      setShowPreview(false);
                    },
                    onError: () => toast.error("Import failed"),
                  },
                );
              }}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Import All
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>
              Cancel
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
  const encryptionQuery = useGetEncryptionStatusApiV1PreferencesEncryptionGet();
  const setupMutation = useSetupEncryptionApiV1PreferencesEncryptionSetupPost();
  const disableMutation = useDisableEncryptionApiV1PreferencesEncryptionDisablePost();
  const passkeysQuery = useListPasskeysApiV1PasskeysGet();
  const deletePasskeyMutation = useDeletePasskeyApiV1PasskeysPasskeyIdDelete();

  const tasksQuery = useListTasksApiV1TasksGet();
  const domainsQuery = useListDomainsApiV1DomainsGet();
  const batchTasks = useBatchUpdateTasksApiV1TasksBatchUpdatePost();
  const batchDomains = useBatchUpdateDomainsApiV1DomainsBatchUpdatePost();

  const queryClient = useQueryClient();
  const setKey = useCryptoStore((s) => s.setKey);
  const clearKey = useCryptoStore((s) => s.clearKey);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const encryptionEnabled = encryptionQuery.data?.enabled ?? false;
  const passkeys = (passkeysQuery.data as { passkeys?: PasskeyInfo[] } | undefined)?.passkeys ?? [];

  const handleEnable = async () => {
    if (passphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error("Passphrases do not match");
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
      const tasks = (tasksQuery.data ?? []) as Array<{
        id: number;
        title: string;
        description: string | null;
      }>;
      const domains = (domainsQuery.data ?? []) as Array<{ id: number; name: string }>;

      const key = (await import("@/lib/crypto")).getStoredKey;
      const storedKey = await key();
      if (storedKey) {
        const taskData: TaskContentData[] = tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
        }));
        const domainData: DomainContentData[] = domains.map((d) => ({ id: d.id, name: d.name }));

        const encrypted = await encryptAllData(storedKey, taskData, domainData);

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
      toast.success("Encryption enabled");
      setShowEnableDialog(false);
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      toast.error("Failed to enable encryption");
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
        const tasks = (tasksQuery.data ?? []) as Array<{
          id: number;
          title: string;
          description: string | null;
        }>;
        const domains = (domainsQuery.data ?? []) as Array<{ id: number; name: string }>;

        const taskData: TaskContentData[] = tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
        }));
        const domainData: DomainContentData[] = domains.map((d) => ({ id: d.id, name: d.name }));

        const decrypted = await decryptAllData(storedKey, taskData, domainData);

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
      toast.success("Encryption disabled");
      setShowDisableDialog(false);
    } catch (err) {
      toast.error("Failed to disable encryption");
      console.error(err);
    } finally {
      setDisabling(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!passkeyName.trim()) {
      toast.error("Enter a name for the passkey");
      return;
    }
    setRegisteringPasskey(true);
    try {
      const result = await registerPasskey(passkeyName.trim());
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: getListPasskeysApiV1PasskeysGetQueryKey() });
        toast.success("Passkey registered");
        setPasskeyName("");
      } else {
        toast.error(result.error ?? "Registration failed");
      }
    } finally {
      setRegisteringPasskey(false);
    }
  };

  return (
    <SettingsCard title="Encryption" icon={<Shield className="h-4 w-4" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">End-to-end encryption</p>
          <p className="text-xs text-muted-foreground">
            Encrypt task titles, descriptions, and domain names
          </p>
        </div>
        {encryptionEnabled ? (
          <Button variant="destructive" size="sm" onClick={() => setShowDisableDialog(true)}>
            Disable
          </Button>
        ) : (
          <Button size="sm" onClick={() => setShowEnableDialog(true)}>
            Enable
          </Button>
        )}
      </div>

      {encryptionEnabled && (
        <div className="space-y-3 pt-2">
          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">Passkeys</p>
            {passkeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No passkeys registered</p>
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
                        if (!window.confirm(`Delete passkey "${pk.name}"? This cannot be undone.`))
                          return;
                        deletePasskeyMutation.mutate(
                          { passkeyId: pk.id },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListPasskeysApiV1PasskeysGetQueryKey(),
                              });
                              toast.success("Passkey deleted");
                            },
                            onError: () => toast.error("Failed to delete passkey"),
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
                  placeholder="Passkey name"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleRegisterPasskey} disabled={registeringPasskey}>
                  {registeringPasskey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Key className="mr-1 h-3 w-3" /> Add Passkey
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enable Dialog */}
      <Dialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Encryption</DialogTitle>
            <DialogDescription>
              Enter a passphrase to encrypt your data. You will need this passphrase to access your
              data on new devices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Passphrase</Label>
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label>Confirm passphrase</Label>
              <Input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Repeat passphrase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEnableDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnable} disabled={enabling}>
              {enabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable Encryption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Encryption</DialogTitle>
            <DialogDescription>
              This will decrypt all your data. Make sure you are unlocked before proceeding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={disabling}>
              {disabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable Encryption
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
  const domainsQuery = useListDomainsApiV1DomainsGet();
  const createDomain = useCreateDomainApiV1DomainsPost();
  const updateDomain = useUpdateDomainApiV1DomainsDomainIdPut();
  const deleteDomain = useDeleteDomainApiV1DomainsDomainIdDelete();
  const queryClient = useQueryClient();
  const { encryptDomainName } = useCrypto();

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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const name = await encryptDomainName(newName.trim());
    createDomain.mutate(
      { data: { name, icon: newIcon || null, color: newColor || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
          toast.success("Domain created");
          setNewName("");
          setNewIcon("");
        },
        onError: () => toast.error("Failed to create domain"),
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
          toast.success("Domain updated");
          setEditingId(null);
        },
        onError: () => toast.error("Failed to update domain"),
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
            { id: current.id, position: other.position },
            { id: other.id, position: current.position },
          ],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListDomainsApiV1DomainsGetQueryKey(),
          });
        },
        onError: () => toast.error("Failed to reorder domains"),
      },
    );
  };

  const startEditing = (d: DomainResponse) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditIcon(d.icon ?? "");
    setEditColor(d.color ?? "#6D5EF6");
  };

  return (
    <SettingsCard title="Domains" icon={<Database className="h-4 w-4" />}>
      <div className="space-y-2">
        {domains.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            {editingId === d.id ? (
              <>
                <Input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  className="w-12 text-center"
                  placeholder="Icon"
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
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
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
                <span className="flex-1 text-sm">{d.name}</span>
                <Button size="sm" variant="ghost" onClick={() => startEditing(d)}>
                  Edit
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
                          toast.success("Domain archived");
                        },
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
          placeholder="New domain name"
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
        toast.success("Backup imported");
      } catch {
        toast.error("Import failed");
      }
    };
    input.click();
  };

  return (
    <SettingsCard title="Data" icon={<Database className="h-4 w-4" />}>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-3 w-3" /> Export Backup
        </Button>
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Upload className="mr-1 h-3 w-3" /> Import Backup
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Automatic Snapshots</p>
          <Switch
            checked={snapshotsEnabled}
            onCheckedChange={() => {
              toggleSnapshots.mutate(undefined, {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getListSnapshotsApiV1BackupSnapshotsGetQueryKey(),
                  });
                  toast.success("Snapshot setting updated");
                },
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
                toast.success("Snapshot created");
              },
            });
          }}
          disabled={createSnapshot.isPending}
        >
          {createSnapshot.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Create Snapshot Now
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
                      Manual
                    </Badge>
                  )}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    title="Download"
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
                    title="Restore"
                    onClick={() => setShowRestoreDialog(snap.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    title="Delete"
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
          <Trash2 className="mr-1 h-3 w-3" /> Wipe All Data
        </Button>
      </div>

      {/* Wipe Dialog */}
      <Dialog open={showWipeDialog} onOpenChange={setShowWipeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wipe All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all your tasks and domains. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWipeDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                wipeMutation.mutate(undefined, {
                  onSuccess: () => {
                    queryClient.invalidateQueries();
                    toast.success("All data wiped");
                    setShowWipeDialog(false);
                  },
                  onError: () => toast.error("Wipe failed"),
                });
              }}
              disabled={wipeMutation.isPending}
            >
              {wipeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Wipe Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={showRestoreDialog !== null} onOpenChange={() => setShowRestoreDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Snapshot</DialogTitle>
            <DialogDescription>
              This will replace all your current data with the snapshot. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRestoreDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (showRestoreDialog === null) return;
                restoreSnapshot.mutate(
                  { snapshotId: showRestoreDialog },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries();
                      toast.success("Snapshot restored");
                      setShowRestoreDialog(null);
                    },
                    onError: () => toast.error("Restore failed"),
                  },
                );
              }}
              disabled={restoreSnapshot.isPending}
            >
              {restoreSnapshot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

// ============================================================================
// Shortcuts Section
// ============================================================================

function ShortcutsSection() {
  const shortcuts = [
    { key: "?", desc: "Show keyboard shortcuts" },
    { key: "q", desc: "Quick add task" },
    { key: "n", desc: "New task (full editor)" },
    { key: "j / k", desc: "Navigate tasks" },
    { key: "c", desc: "Toggle complete" },
    { key: "e / Enter", desc: "Edit selected task" },
    { key: "x", desc: "Delete selected task" },
    { key: "Esc", desc: "Close dialog/sheet" },
  ];

  return (
    <SettingsCard title="Keyboard Shortcuts" icon={<Keyboard className="h-4 w-4" />}>
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
  const resetWizard = useResetWizardApiV1WizardResetPost();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <SettingsCard title="Setup" icon={<Settings2 className="h-4 w-4" />}>
      <p className="text-sm text-muted-foreground">
        Re-run the onboarding wizard to reconfigure domains, calendar, or imports.
      </p>
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
            onError: () => toast.error("Failed to reset wizard"),
          });
        }}
        disabled={resetWizard.isPending}
      >
        {resetWizard.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Re-run Setup Wizard
      </Button>
    </SettingsCard>
  );
}

// ============================================================================
// About Section
// ============================================================================

function AboutSection() {
  const buildQuery = useGetBuildInfoApiV1BuildInfoGet();
  const buildInfo = buildQuery.data as
    | { version?: string; commit?: { sha: string; short: string } }
    | undefined;

  return (
    <SettingsCard title="About" icon={<Info className="h-4 w-4" />}>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Version:</span> {buildInfo?.version ?? "..."}
        </p>
        {buildInfo?.commit && (
          <p>
            <span className="text-muted-foreground">Commit:</span> {buildInfo.commit.short}
          </p>
        )}
      </div>
      <div className="flex gap-2 text-xs flex-wrap">
        <RouterLink to="/privacy" className="text-muted-foreground hover:underline">
          Privacy Policy
        </RouterLink>
        <RouterLink to="/terms" className="text-muted-foreground hover:underline">
          Terms of Service
        </RouterLink>
        <a
          href="https://github.com/aleksandr-bogdanov/whendoist"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline"
        >
          GitHub
        </a>
        <a
          href="/static/debug-pwa.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline"
        >
          PWA Debug
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
