import { useCallback, useMemo, useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useCodiusModelAccess } from "@/hooks/use-codius-model-access";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";

const SUPPORTED_AGENTS = ["OpenCode", "Claude Code", "Codex", "GitHub Copilot", "Pi"];
const API_KEYS_URL = "https://codius.ai/app/keys";
const ThemedCheckCircle = withUnistyles(CheckCircle2);
const ThemedKeyRound = withUnistyles(KeyRound);
const ThemedShieldCheck = withUnistyles(ShieldCheck);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedTextInput = withUnistyles(TextInput);
const accentColorMapping = (theme: Theme) => ({ color: theme.colors.accent });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const inputColorMapping = (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
});

function ConnectionStatus({
  isLoading,
  isConfigured,
}: {
  isLoading: boolean;
  isConfigured: boolean;
}) {
  const { t } = useTranslation();
  const statusStyle = [
    styles.statusPill,
    isConfigured ? styles.statusPillConnected : styles.statusPillDisconnected,
  ];
  if (isLoading) {
    return <ThemedLoadingSpinner size="small" uniProps={mutedColorMapping} />;
  }
  return (
    <View style={statusStyle}>
      {isConfigured ? <ThemedCheckCircle size={14} uniProps={successColorMapping} /> : null}
      <Text style={isConfigured ? styles.connectedText : styles.disconnectedText}>
        {isConfigured
          ? t("settings.providers.codius.connected")
          : t("settings.providers.codius.notConnected")}
      </Text>
    </View>
  );
}

export function CodiusModelAccessCard({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { status, isLoading, update } = useCodiusModelAccess(serverId);
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = status?.configured === true;
  const canSave = apiKey.trim().length > 0 && !isSaving;
  const keyPlaceholder = isConfigured
    ? t("settings.providers.codius.replacePlaceholder", {
        maskedKey: status.maskedApiKey ?? "",
      })
    : t("settings.providers.codius.keyPlaceholder");
  const modelOptions = useMemo(
    () =>
      (status?.models ?? []).map((model) => ({
        id: model.id,
        value: model.id,
        label: model.name ?? model.id,
        description: model.name ? model.id : undefined,
      })),
    [status?.models],
  );
  const selectedModel = useMemo(() => {
    const model = status?.models.find((candidate) => candidate.id === status.defaultModel);
    if (!model) return null;
    return {
      label: model.name ?? model.id,
      description: model.name ? model.id : undefined,
    };
  }, [status?.defaultModel, status?.models]);

  const save = useCallback(async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await update({ apiKey: apiKey.trim(), defaultForAgents: true });
      setApiKey("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, update]);

  const toggleDefaults = useCallback(
    async (enabled: boolean) => {
      setIsSaving(true);
      setError(null);
      try {
        await update({ defaultForAgents: enabled });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setIsSaving(false);
      }
    },
    [update],
  );

  const clear = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await update({ clearApiKey: true });
      setApiKey("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSaving(false);
    }
  }, [update]);

  const selectModel = useCallback(
    async (model: string) => {
      setIsSaving(true);
      setError(null);
      try {
        await update({ defaultModel: model });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setIsSaving(false);
      }
    },
    [update],
  );

  const openKeyManager = useCallback(() => {
    void Linking.openURL(API_KEYS_URL);
  }, []);

  return (
    <SettingsSection
      title={t("settings.providers.codius.title")}
      testID="codius-model-access-card"
      style={styles.section}
    >
      <View style={[settingsStyles.card, styles.card]}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <ThemedKeyRound size={20} uniProps={accentColorMapping} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t("settings.providers.codius.heading")}</Text>
            <Text style={styles.description}>{t("settings.providers.codius.description")}</Text>
          </View>
          <ConnectionStatus isLoading={isLoading} isConfigured={isConfigured} />
        </View>

        <View style={styles.agentList}>
          {SUPPORTED_AGENTS.map((agent) => (
            <View key={agent} style={styles.agentPill}>
              <ThemedShieldCheck size={12} uniProps={mutedColorMapping} />
              <Text style={styles.agentText}>{agent}</Text>
            </View>
          ))}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t("settings.providers.codius.apiKey")}</Text>
          <View style={styles.inputRow}>
            <ThemedTextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder={keyPlaceholder}
              uniProps={inputColorMapping}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              editable={!isSaving}
              onSubmitEditing={save}
              accessibilityLabel={t("settings.providers.codius.apiKey")}
              testID="codius-api-key-input"
            />
            <Button
              variant="default"
              onPress={save}
              disabled={!canSave}
              loading={isSaving && apiKey.trim().length > 0}
              testID="codius-api-key-save"
            >
              {isConfigured
                ? t("settings.providers.codius.update")
                : t("settings.providers.codius.connect")}
            </Button>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ExternalLink}
            onPress={openKeyManager}
            style={styles.manageButton}
          >
            {t("settings.providers.codius.manageKeys")}
          </Button>
        </View>

        {isConfigured ? (
          <>
            <SelectField
              label={t("settings.providers.codius.modelLabel")}
              value={status?.defaultModel ?? null}
              selectedDisplay={selectedModel}
              options={modelOptions}
              onChange={selectModel}
              placeholder={t("settings.providers.codius.modelPlaceholder")}
              emptyText={t("settings.providers.codius.noModels")}
              disabled={isSaving}
              searchable={modelOptions.length > 8}
              searchPlaceholder={t("settings.providers.codius.searchModels")}
              title={t("settings.providers.codius.modelPickerTitle")}
              testID="codius-default-model"
            />
            <View style={styles.defaultRow}>
              <View style={styles.defaultCopy}>
                <Text style={styles.defaultTitle}>
                  {t("settings.providers.codius.defaultTitle")}
                </Text>
                <Text style={styles.defaultDescription}>
                  {t("settings.providers.codius.defaultDescription", {
                    model: status?.defaultModel ?? t("settings.providers.codius.firstModel"),
                  })}
                </Text>
              </View>
              <Switch
                value={status?.defaultForAgents === true}
                onValueChange={toggleDefaults}
                disabled={isSaving}
                accessibilityLabel={t("settings.providers.codius.defaultTitle")}
              />
            </View>
          </>
        ) : null}

        {isConfigured ? (
          <Button variant="ghost" size="sm" onPress={clear} disabled={isSaving}>
            {t("settings.providers.codius.disconnect")}
          </Button>
        ) : null}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[4],
  },
  card: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  headerCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  statusPillConnected: {
    backgroundColor: "rgba(35, 153, 86, 0.12)",
  },
  statusPillDisconnected: {
    backgroundColor: theme.colors.surface2,
  },
  connectedText: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.xs,
  },
  disconnectedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  agentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  agentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  agentText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  form: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  inputRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 40,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  manageButton: {
    alignSelf: "flex-start",
  },
  defaultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[4],
  },
  defaultCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  defaultTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  defaultDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
