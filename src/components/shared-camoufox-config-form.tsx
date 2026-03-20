"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLock } from "react-icons/lu";
import MultipleSelector, { type Option } from "@/components/multiple-selector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  CamoufoxConfig,
  CamoufoxFingerprintConfig,
  CamoufoxOS,
} from "@/types";

interface SharedCamoufoxConfigFormProps {
  config: CamoufoxConfig;
  onConfigChange: (key: keyof CamoufoxConfig, value: unknown) => void;
  className?: string;
  isCreating?: boolean; // Flag to indicate if this is for creating a new profile
  forceAdvanced?: boolean; // Force advanced mode (for editing)
  readOnly?: boolean; // Flag to indicate if the form should be read-only
  browserType?: "camoufox" | "wayfern"; // Browser type to customize form options
  crossOsUnlocked?: boolean; // Allow selecting non-current OS (paid feature)
}

// Determine if fingerprint editing should be disabled
const isFingerprintEditingDisabled = (config: CamoufoxConfig): boolean => {
  return config.randomize_fingerprint_on_launch === true;
};

// Detect the current operating system
const getCurrentOS = (): CamoufoxOS => {
  if (typeof navigator === "undefined") return "linux";
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  return "linux";
};

// OS display labels
const osLabels: Record<CamoufoxOS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

// Component for editing nested objects like webGl:parameters
interface ObjectEditorProps {
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown> | undefined) => void;
  title: string;
  readOnly?: boolean;
}

function ObjectEditor({
  value,
  onChange,
  title,
  readOnly = false,
}: ObjectEditorProps) {
  const { t } = useTranslation();
  const [jsonString, setJsonString] = useState("");

  useEffect(() => {
    setJsonString(JSON.stringify(value || {}, null, 2));
  }, [value]);

  const handleChange = (newValue: string) => {
    if (readOnly) return;
    setJsonString(newValue);
    try {
      if (newValue.trim() === "" || newValue.trim() === "{}") {
        onChange(undefined); // Treat empty objects as undefined
        return;
      }
      const parsed = JSON.parse(newValue);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        Object.keys(parsed).length === 0
      ) {
        onChange(undefined);
        return;
      }
      onChange(parsed as Record<string, unknown>);
    } catch (err) {
      console.warn("Invalid JSON:", err);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <Textarea
        value={jsonString}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("fingerprint.enterAsJson", { title })}
        className="font-mono text-sm"
        rows={6}
        disabled={readOnly}
      />
    </div>
  );
}

export function SharedCamoufoxConfigForm({
  config,
  onConfigChange,
  className = "",
  isCreating = false,
  forceAdvanced = false,
  readOnly = false,
  browserType = "camoufox",
  crossOsUnlocked = false,
}: SharedCamoufoxConfigFormProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(
    forceAdvanced ? "manual" : "automatic",
  );
  const [fingerprintConfig, setFingerprintConfig] =
    useState<CamoufoxFingerprintConfig>({});
  const [currentOS] = useState<CamoufoxOS>(getCurrentOS);

  // Get selected OS (defaults to current OS)
  const selectedOS = config.os || currentOS;

  // Set screen resolution to user's screen size when creating a new profile
  useEffect(() => {
    if (isCreating && typeof window !== "undefined") {
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;

      // Only set if not already configured
      if (!config.screen_max_width) {
        onConfigChange("screen_max_width", screenWidth);
      }
      if (!config.screen_max_height) {
        onConfigChange("screen_max_height", screenHeight);
      }
    }
  }, [
    isCreating,
    config.screen_max_width,
    config.screen_max_height,
    onConfigChange,
  ]);

  // Parse fingerprint config when component mounts or config changes
  useEffect(() => {
    if (config.fingerprint) {
      try {
        const parsed = JSON.parse(
          config.fingerprint,
        ) as CamoufoxFingerprintConfig;
        setFingerprintConfig(parsed);
      } catch (error) {
        console.error("Failed to parse fingerprint config:", error);
        setFingerprintConfig({});
      }
    } else {
      // Initialize with empty config if no fingerprint is set
      setFingerprintConfig({});
    }
  }, [config.fingerprint]);

  // Update fingerprint config and serialize it
  const updateFingerprintConfig = (
    key: keyof CamoufoxFingerprintConfig,
    value: unknown,
  ) => {
    const newConfig = { ...fingerprintConfig };

    // Remove undefined values to keep the config clean
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete newConfig[key];
    } else {
      (newConfig as Record<string, unknown>)[key] = value;
    }

    setFingerprintConfig(newConfig);

    // Validate that the config can be serialized to JSON
    try {
      const jsonString = JSON.stringify(newConfig);
      onConfigChange("fingerprint", jsonString);
    } catch (error) {
      console.error("Failed to serialize fingerprint config:", error);
      // Don't update if serialization fails
    }
  };

  // Determine if automatic location configuration is enabled
  const isAutoLocationEnabled = config.geoip !== false;

  // Handle automatic location configuration toggle
  const handleAutoLocationToggle = (enabled: boolean) => {
    if (enabled) {
      onConfigChange("geoip", true);
    } else {
      onConfigChange("geoip", false);
    }
  };

  const isEditingDisabled = isFingerprintEditingDisabled(config) || readOnly;

  const renderAdvancedForm = () => (
    <div className="space-y-6">
      {/* Operating System Selection */}
      <div className="space-y-3">
        <Label>{t("fingerprint.os.title")}</Label>
        <Select
          value={selectedOS}
          onValueChange={(value: CamoufoxOS) => onConfigChange("os", value)}
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("fingerprint.os.selectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {(["windows", "macos", "linux"] as CamoufoxOS[]).map((os) => {
              const isDisabled = os !== currentOS && !crossOsUnlocked;
              return (
                <SelectItem key={os} value={os} disabled={isDisabled}>
                  <span className="flex items-center gap-2">
                    {osLabels[os]}
                    {isDisabled && (
                      <LuLock className="w-3 h-3 text-muted-foreground" />
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {selectedOS !== currentOS && crossOsUnlocked && (
          <Alert className="mt-2">
            <AlertDescription>
              {t("fingerprint.crossOsWarning")}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Randomize Fingerprint Option */}
      <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="randomize-fingerprint"
            checked={config.randomize_fingerprint_on_launch || false}
            onCheckedChange={(checked) =>
              onConfigChange("randomize_fingerprint_on_launch", checked)
            }
            disabled={readOnly}
          />
          <Label htmlFor="randomize-fingerprint" className="font-medium">
            {t("fingerprint.randomize.label")}
          </Label>
        </div>
        <p className="text-sm text-muted-foreground ml-6">
          {t("fingerprint.randomize.description")}
        </p>
      </div>

      {isEditingDisabled ? (
        <Alert>
          <AlertDescription>
            {readOnly
              ? t("fingerprint.alerts.readOnlyDisabled")
              : t("fingerprint.alerts.randomizeDisabled")}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>
            {t("fingerprint.alerts.editWarning")}
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={isEditingDisabled} className="space-y-6">
        {/* Blocking Options - Only available for Camoufox */}
        {browserType === "camoufox" && (
          <div className="space-y-3">
            <Label>{t("fingerprint.blocking.title")}</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="block-images"
                  checked={config.block_images || false}
                  onCheckedChange={(checked) =>
                    onConfigChange("block_images", checked)
                  }
                />
                <Label htmlFor="block-images">
                  {t("fingerprint.blocking.blockImages")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="block-webrtc"
                  checked={config.block_webrtc || false}
                  onCheckedChange={(checked) =>
                    onConfigChange("block_webrtc", checked)
                  }
                />
                <Label htmlFor="block-webrtc">
                  {t("fingerprint.blocking.blockWebRTC")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="block-webgl"
                  checked={config.block_webgl || false}
                  onCheckedChange={(checked) =>
                    onConfigChange("block_webgl", checked)
                  }
                />
                <Label htmlFor="block-webgl">
                  {t("fingerprint.blocking.blockWebGL")}
                </Label>
              </div>
            </div>
          </div>
        )}

        {/* Navigator Properties */}
        <div className="space-y-3">
          <Label>{t("fingerprint.navigator.title")}</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-agent">
                {t("fingerprint.navigator.userAgent")}
              </Label>
              <Input
                id="user-agent"
                value={fingerprintConfig["navigator.userAgent"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.userAgent",
                    e.target.value || undefined,
                  )
                }
                placeholder="Mozilla/5.0..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform">
                {t("fingerprint.navigator.platform")}
              </Label>
              <Input
                id="platform"
                value={fingerprintConfig["navigator.platform"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.platform",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., MacIntel, Win32"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-version">
                {t("fingerprint.navigator.appVersion")}
              </Label>
              <Input
                id="app-version"
                value={fingerprintConfig["navigator.appVersion"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.appVersion",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., 5.0 (Macintosh)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oscpu">{t("fingerprint.navigator.osCpu")}</Label>
              <Input
                id="oscpu"
                value={fingerprintConfig["navigator.oscpu"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.oscpu",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., Intel Mac OS X 10.15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hardware-concurrency">
                {t("fingerprint.navigator.hardwareConcurrency")}
              </Label>
              <Input
                id="hardware-concurrency"
                type="number"
                value={fingerprintConfig["navigator.hardwareConcurrency"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.hardwareConcurrency",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-touch-points">
                {t("fingerprint.navigator.maxTouchPoints")}
              </Label>
              <Input
                id="max-touch-points"
                type="number"
                value={fingerprintConfig["navigator.maxTouchPoints"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.maxTouchPoints",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="do-not-track">
                {t("fingerprint.navigator.doNotTrack")}
              </Label>
              <Select
                value={fingerprintConfig["navigator.doNotTrack"] || ""}
                onValueChange={(value) =>
                  updateFingerprintConfig(
                    "navigator.doNotTrack",
                    value || undefined,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("fingerprint.navigator.selectDnt")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">
                    {t("fingerprint.navigator.dntAllowed")}
                  </SelectItem>
                  <SelectItem value="1">
                    {t("fingerprint.navigator.dntNotAllowed")}
                  </SelectItem>
                  <SelectItem value="unspecified">
                    {t("fingerprint.navigator.dntUnspecified")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">
                {t("fingerprint.navigator.language")}
              </Label>
              <Input
                id="language"
                value={fingerprintConfig["navigator.language"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "navigator.language",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., en-US"
              />
            </div>
          </div>
        </div>

        {/* Screen Properties */}
        <div className="space-y-3">
          <Label>{t("fingerprint.screen.title")}</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="screen-width">
                {t("fingerprint.screen.width")}
              </Label>
              <Input
                id="screen-width"
                type="number"
                value={fingerprintConfig["screen.width"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.width",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1920"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screen-height">
                {t("fingerprint.screen.height")}
              </Label>
              <Input
                id="screen-height"
                type="number"
                value={fingerprintConfig["screen.height"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.height",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1080"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avail-width">
                {t("fingerprint.screen.availWidth")}
              </Label>
              <Input
                id="avail-width"
                type="number"
                value={fingerprintConfig["screen.availWidth"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.availWidth",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1920"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avail-height">
                {t("fingerprint.screen.availHeight")}
              </Label>
              <Input
                id="avail-height"
                type="number"
                value={fingerprintConfig["screen.availHeight"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.availHeight",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1055"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color-depth">
                {t("fingerprint.screen.colorDepth")}
              </Label>
              <Input
                id="color-depth"
                type="number"
                value={fingerprintConfig["screen.colorDepth"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.colorDepth",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pixel-depth">
                {t("fingerprint.screen.pixelDepth")}
              </Label>
              <Input
                id="pixel-depth"
                type="number"
                value={fingerprintConfig["screen.pixelDepth"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "screen.pixelDepth",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 30"
              />
            </div>
          </div>
        </div>

        {/* Window Properties */}
        <div className="space-y-3">
          <Label>{t("fingerprint.window.title")}</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outer-width">
                {t("fingerprint.window.outerWidth")}
              </Label>
              <Input
                id="outer-width"
                type="number"
                value={fingerprintConfig["window.outerWidth"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.outerWidth",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1512"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outer-height">
                {t("fingerprint.window.outerHeight")}
              </Label>
              <Input
                id="outer-height"
                type="number"
                value={fingerprintConfig["window.outerHeight"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.outerHeight",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 886"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inner-width">
                {t("fingerprint.window.innerWidth")}
              </Label>
              <Input
                id="inner-width"
                type="number"
                value={fingerprintConfig["window.innerWidth"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.innerWidth",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 1512"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inner-height">
                {t("fingerprint.window.innerHeight")}
              </Label>
              <Input
                id="inner-height"
                type="number"
                value={fingerprintConfig["window.innerHeight"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.innerHeight",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 886"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screen-x">
                {t("fingerprint.window.screenX")}
              </Label>
              <Input
                id="screen-x"
                type="number"
                value={fingerprintConfig["window.screenX"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.screenX",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screen-y">
                {t("fingerprint.window.screenY")}
              </Label>
              <Input
                id="screen-y"
                type="number"
                value={fingerprintConfig["window.screenY"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "window.screenY",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="e.g., 0"
              />
            </div>
          </div>
        </div>

        {/* Geolocation */}
        <div className="space-y-3">
          <Label>{t("fingerprint.geolocation.title")}</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">
                {t("fingerprint.geolocation.latitude")}
              </Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={fingerprintConfig["geolocation:latitude"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "geolocation:latitude",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="e.g., 41.0019"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">
                {t("fingerprint.geolocation.longitude")}
              </Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={fingerprintConfig["geolocation:longitude"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "geolocation:longitude",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="e.g., 28.9645"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">
                {t("fingerprint.timezone.title")}
              </Label>
              <Input
                id="timezone"
                type="text"
                value={fingerprintConfig.timezone || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "timezone",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., America/New_York"
              />
            </div>
          </div>
        </div>

        {/* Locale */}
        <div className="space-y-3">
          <Label>{t("fingerprint.locale.title")}</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="locale-language">
                {t("fingerprint.locale.language")}
              </Label>
              <Input
                id="locale-language"
                value={fingerprintConfig["locale:language"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "locale:language",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., tr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale-region">
                {t("fingerprint.locale.region")}
              </Label>
              <Input
                id="locale-region"
                value={fingerprintConfig["locale:region"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "locale:region",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., TR"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale-script">
                {t("fingerprint.locale.script")}
              </Label>
              <Input
                id="locale-script"
                value={fingerprintConfig["locale:script"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "locale:script",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., Latn"
              />
            </div>
          </div>
        </div>

        {/* WebGL Properties */}
        <div className="space-y-3">
          <Label>{t("fingerprint.webgl.title")}</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webgl-vendor">
                {t("fingerprint.webgl.vendor")}
              </Label>
              <Input
                id="webgl-vendor"
                value={fingerprintConfig["webGl:vendor"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "webGl:vendor",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., Mesa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webgl-renderer">
                {t("fingerprint.webgl.renderer")}
              </Label>
              <Input
                id="webgl-renderer"
                value={fingerprintConfig["webGl:renderer"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "webGl:renderer",
                    e.target.value || undefined,
                  )
                }
                placeholder="e.g., llvmpipe, or similar"
              />
            </div>
          </div>
        </div>

        {/* WebGL Parameters */}
        <div className="space-y-3">
          <ObjectEditor
            value={
              (fingerprintConfig["webGl:parameters"] as Record<
                string,
                unknown
              >) || {}
            }
            onChange={(value) =>
              updateFingerprintConfig("webGl:parameters", value)
            }
            title={t("fingerprint.webgl.parameters")}
            readOnly={readOnly}
          />
        </div>

        {/* WebGL2 Parameters */}
        <div className="space-y-3">
          <ObjectEditor
            value={
              (fingerprintConfig["webGl2:parameters"] as Record<
                string,
                unknown
              >) || {}
            }
            onChange={(value) =>
              updateFingerprintConfig("webGl2:parameters", value)
            }
            title={t("fingerprint.webgl.parameters2")}
            readOnly={readOnly}
          />
        </div>

        {/* WebGL Shader Precision Formats */}
        <div className="space-y-3">
          <ObjectEditor
            value={
              (fingerprintConfig["webGl:shaderPrecisionFormats"] as Record<
                string,
                unknown
              >) || {}
            }
            onChange={(value) =>
              updateFingerprintConfig("webGl:shaderPrecisionFormats", value)
            }
            title={t("fingerprint.webgl.shaderPrecisionFormats")}
            readOnly={readOnly}
          />
        </div>

        {/* WebGL2 Shader Precision Formats */}
        <div className="space-y-3">
          <ObjectEditor
            value={
              (fingerprintConfig["webGl2:shaderPrecisionFormats"] as Record<
                string,
                unknown
              >) || {}
            }
            onChange={(value) =>
              updateFingerprintConfig("webGl2:shaderPrecisionFormats", value)
            }
            title={t("fingerprint.webgl.shaderPrecisionFormats2")}
            readOnly={readOnly}
          />
        </div>

        {/* Fonts */}
        <div className="space-y-3">
          <Label>{t("fingerprint.fonts.title")}</Label>
          <MultipleSelector
            value={(() => {
              // Handle fonts being either an array or a JSON string (Wayfern format)
              let fontsArray: string[] = [];
              if (fingerprintConfig.fonts) {
                if (Array.isArray(fingerprintConfig.fonts)) {
                  fontsArray = fingerprintConfig.fonts;
                } else if (typeof fingerprintConfig.fonts === "string") {
                  try {
                    const parsed = JSON.parse(fingerprintConfig.fonts);
                    if (Array.isArray(parsed)) {
                      fontsArray = parsed;
                    }
                  } catch {
                    // Invalid JSON, ignore
                  }
                }
              }
              return fontsArray.map((font) => ({
                label: font,
                value: font,
              }));
            })()}
            onChange={(selected: Option[]) =>
              updateFingerprintConfig(
                "fonts",
                selected.map((s: Option) => s.value),
              )
            }
            placeholder="Add fonts..."
            creatable
          />
        </div>

        {/* Battery */}
        <div className="space-y-3">
          <Label>{t("fingerprint.battery.title")}</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="battery-charging"
                  checked={fingerprintConfig["battery:charging"] || false}
                  onCheckedChange={(checked) =>
                    updateFingerprintConfig("battery:charging", checked)
                  }
                />
                <Label htmlFor="battery-charging">
                  {t("fingerprint.battery.charging")}
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="charging-time">
                {t("fingerprint.battery.chargingTime")}
              </Label>
              <Input
                id="charging-time"
                type="number"
                step="any"
                value={fingerprintConfig["battery:chargingTime"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "battery:chargingTime",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="e.g., 0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discharging-time">
                {t("fingerprint.battery.dischargingTime")}
              </Label>
              <Input
                id="discharging-time"
                type="number"
                step="any"
                value={fingerprintConfig["battery:dischargingTime"] || ""}
                onChange={(e) =>
                  updateFingerprintConfig(
                    "battery:dischargingTime",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="e.g., 0"
              />
            </div>
          </div>
        </div>

        {/* Browser Behavior */}
        {/* <div className="space-y-3">
        <Label>Browser Behavior</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="allow-addon-new-tab"
            checked={fingerprintConfig.allowAddonNewTab}
            onCheckedChange={(checked) =>
              updateFingerprintConfig("allowAddonNewTab", checked)
            }
          />
          <Label htmlFor="allow-addon-new-tab">
            Allow browser addons to open new tabs automatically
          </Label>
        </div>
      </div> */}
      </fieldset>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {forceAdvanced ? (
        // Advanced mode only (for editing)
        renderAdvancedForm()
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={readOnly ? undefined : setActiveTab}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="automatic" disabled={readOnly}>
              {t("fingerprint.tabs.automatic")}
            </TabsTrigger>
            <TabsTrigger value="manual" disabled={readOnly}>
              {t("fingerprint.tabs.manual")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="automatic" className="space-y-6">
            {/* Operating System Selection */}
            <div className="mt-4 space-y-3">
              <Label>{t("fingerprint.os.title")}</Label>
              <Select
                value={selectedOS}
                onValueChange={(value: CamoufoxOS) =>
                  onConfigChange("os", value)
                }
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("fingerprint.os.selectPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(["windows", "macos", "linux"] as CamoufoxOS[]).map((os) => {
                    const isDisabled = os !== currentOS && !crossOsUnlocked;
                    return (
                      <SelectItem key={os} value={os} disabled={isDisabled}>
                        <span className="flex items-center gap-2">
                          {osLabels[os]}
                          {isDisabled && (
                            <LuLock className="w-3 h-3 text-muted-foreground" />
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedOS !== currentOS && crossOsUnlocked && (
                <Alert className="mt-2">
                  <AlertDescription>
                    {t("fingerprint.crossOsLimitations")}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Randomize Fingerprint Option */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="randomize-fingerprint-auto"
                  checked={config.randomize_fingerprint_on_launch || false}
                  onCheckedChange={(checked) =>
                    onConfigChange("randomize_fingerprint_on_launch", checked)
                  }
                  disabled={readOnly}
                />
                <Label
                  htmlFor="randomize-fingerprint-auto"
                  className="font-medium"
                >
                  {t("fingerprint.randomize.label")}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {t("fingerprint.randomize.descriptionWithSave")}
              </p>
            </div>

            {/* Automatic Location Configuration */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-location"
                  checked={isAutoLocationEnabled}
                  onCheckedChange={handleAutoLocationToggle}
                  disabled={isEditingDisabled}
                />
                <Label htmlFor="auto-location">
                  {t("fingerprint.autoLocation")}
                </Label>
              </div>
            </div>

            {/* Screen Resolution */}
            <fieldset disabled={isEditingDisabled} className="space-y-3">
              <Label>{t("fingerprint.screen.resolution")}</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="screen-max-width">
                    {t("fingerprint.screen.maxWidth")}
                  </Label>
                  <Input
                    id="screen-max-width"
                    type="number"
                    value={config.screen_max_width || ""}
                    onChange={(e) =>
                      onConfigChange(
                        "screen_max_width",
                        e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      )
                    }
                    placeholder="e.g., 1920"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="screen-max-height">
                    {t("fingerprint.screen.maxHeight")}
                  </Label>
                  <Input
                    id="screen-max-height"
                    type="number"
                    value={config.screen_max_height || ""}
                    onChange={(e) =>
                      onConfigChange(
                        "screen_max_height",
                        e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      )
                    }
                    placeholder="e.g., 1080"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="screen-min-width">
                    {t("fingerprint.screen.minWidth")}
                  </Label>
                  <Input
                    id="screen-min-width"
                    type="number"
                    value={config.screen_min_width || ""}
                    onChange={(e) =>
                      onConfigChange(
                        "screen_min_width",
                        e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      )
                    }
                    placeholder="e.g., 800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="screen-min-height">
                    {t("fingerprint.screen.minHeight")}
                  </Label>
                  <Input
                    id="screen-min-height"
                    type="number"
                    value={config.screen_min_height || ""}
                    onChange={(e) =>
                      onConfigChange(
                        "screen_min_height",
                        e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      )
                    }
                    placeholder="e.g., 600"
                  />
                </div>
              </div>
            </fieldset>
          </TabsContent>

          <TabsContent value="manual" className="space-y-6">
            {renderAdvancedForm()}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
