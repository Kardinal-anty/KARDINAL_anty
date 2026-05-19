"use client";

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  LuCheck,
  LuCircleHelp,
  LuDownload,
  LuExternalLink,
  LuLoaderCircle,
  LuLogOut,
  LuRefreshCw,
  LuSearch,
  LuServer,
  LuSmartphone,
  LuTrash2,
  LuTriangleAlert,
  LuWallet,
  LuWifi,
} from "react-icons/lu";
import { toast } from "sonner";
import { FlagIcon } from "@/components/flag-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildSXOrgProxyName,
  type CreateProxyRequest,
  getSXOrgApiKey,
  parseSXOrgProxyHostPort,
  removeSXOrgApiKey,
  type SXOrgBalance,
  type SXOrgCity,
  SXOrgClient,
  type SXOrgCountry,
  type SXOrgProxyPort,
  type SXOrgState,
  saveSXOrgApiKey,
} from "@/lib/sxorg-api";
import { showErrorToast, showSuccessToast } from "@/lib/toast-utils";
import { cn } from "@/lib/utils";

const LOGIN_URL = "https://my.sx.org/auth/login/?utm-source=kardinalanty";
const SMART_COUNTRY_CODES = ["US", "GB", "KZ", "UA"];

type DeviceType = "mobile" | "residential" | "datacenter";
type LocationStep = "country" | "region" | "city" | "advanced";
type BehaviorType = "keep" | "break" | "rotate";

interface SXOrgIntegrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SXOrgIntegrationDialog({
  isOpen,
  onClose,
}: SXOrgIntegrationDialogProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [client, setClient] = useState<SXOrgClient | null>(null);
  const [balance, setBalance] = useState<SXOrgBalance | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "import">("create");

  const authenticate = useCallback(
    async (key: string) => {
      const trimmed = key.trim();
      if (!trimmed) {
        setAuthError(t("proxies.sxorg.enterApiKey"));
        return;
      }
      setIsAuthenticating(true);
      setAuthError("");
      try {
        const sxClient = new SXOrgClient(trimmed);
        const balanceData = await sxClient.getBalance();
        if (!balanceData.success) {
          throw new Error(t("proxies.sxorg.invalidKey"));
        }
        setClient(sxClient);
        setBalance(balanceData);
        saveSXOrgApiKey(trimmed);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("proxies.sxorg.authError");
        setAuthError(message);
        setClient(null);
        setBalance(null);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isOpen) return;
    const saved = getSXOrgApiKey();
    if (saved) {
      setApiKey(saved);
      void authenticate(saved);
    }
  }, [isOpen, authenticate]);

  const reloadBalance = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.getBalance();
      if (data.success) setBalance(data);
    } catch {
      // ignore
    }
  }, [client]);

  const handleLogout = useCallback(() => {
    removeSXOrgApiKey();
    setApiKey("");
    setClient(null);
    setBalance(null);
    setAuthError("");
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const openLogin = useCallback(() => {
    void openUrl(LOGIN_URL).catch(() => {
      // ignore
    });
  }, []);

  const importProxiesToLocal = useCallback(
    async (proxies: SXOrgProxyPort[]) => {
      let imported = 0;
      for (const proxy of proxies) {
        const { host, port } = parseSXOrgProxyHostPort(proxy);
        if (!host || !port) continue;
        const portNumber = Number.parseInt(port, 10);
        if (!Number.isFinite(portNumber) || portNumber <= 0) continue;
        const name = buildSXOrgProxyName(proxy);
        try {
          await invoke("create_stored_proxy", {
            name,
            proxySettings: {
              proxy_type: "socks5",
              host,
              port: portNumber,
              username: proxy.login || undefined,
              password: proxy.password || undefined,
            },
          });
          imported += 1;
        } catch (error) {
          console.error("Failed to import SX.ORG proxy:", error);
        }
      }
      if (imported > 0) {
        await emit("stored-proxies-changed");
        showSuccessToast(t("proxies.sxorg.importedCount", { count: imported }));
      } else {
        showErrorToast(t("proxies.sxorg.importFailed"));
      }
      return imported;
    },
    [t],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden",
          client ? "sm:max-w-[1100px] w-[95vw] h-[90vh]" : "sm:max-w-md",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <img
              src="/sxorg-logo.svg"
              alt="SX.ORG"
              className="w-6 h-6"
              draggable={false}
            />
            {client ? t("proxies.sxorg.titleAuthed") : t("proxies.sxorg.title")}
          </DialogTitle>
          <DialogDescription>
            {client
              ? t("proxies.sxorg.descriptionAuthed")
              : t("proxies.sxorg.description")}
          </DialogDescription>
        </DialogHeader>

        {!client ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <AuthScreen
              apiKey={apiKey}
              setApiKey={setApiKey}
              error={authError}
              isLoading={isAuthenticating}
              onAuthenticate={() => authenticate(apiKey)}
              onOpenLogin={openLogin}
            />
          </motion.div>
        ) : (
          <motion.div
            key="authed"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex flex-col flex-1 gap-4 min-h-0"
          >
            <BalanceCard balance={balance} onLogout={handleLogout} />

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "create" | "import")}
              className="flex flex-col flex-1 min-h-0"
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="create">
                  {t("proxies.sxorg.createProxy")}
                </TabsTrigger>
                <TabsTrigger value="import">
                  {t("proxies.sxorg.importProxy")}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="create"
                className="flex-1 mt-4 overflow-hidden"
              >
                <ScrollArea className="h-full pr-3">
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CreateProxyForm
                      client={client}
                      onCreated={async (proxies) => {
                        await importProxiesToLocal(proxies);
                        void reloadBalance();
                      }}
                    />
                  </motion.div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="import"
                className="flex-1 mt-4 overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  <ImportProxyList
                    client={client}
                    onImport={async (proxies) => {
                      await importProxiesToLocal(proxies);
                    }}
                  />
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface AuthScreenProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  error: string;
  isLoading: boolean;
  onAuthenticate: () => void;
  onOpenLogin: () => void;
}

function AuthScreen({
  apiKey,
  setApiKey,
  error,
  isLoading,
  onAuthenticate,
  onOpenLogin,
}: AuthScreenProps) {
  const { t } = useTranslation();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onAuthenticate();
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="sxorg-api-key">{t("proxies.sxorg.apiKey")}</Label>
        <Input
          id="sxorg-api-key"
          type="password"
          autoComplete="off"
          placeholder={t("proxies.sxorg.apiKeyPlaceholder")}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <LuTriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 justify-between">
        <Button
          variant="outline"
          onClick={onOpenLogin}
          className="flex-1 gap-2"
        >
          <LuExternalLink className="w-4 h-4" />
          {t("proxies.sxorg.getApiKey")}
        </Button>
        <Button
          onClick={onAuthenticate}
          disabled={isLoading || !apiKey.trim()}
          className="flex-1 gap-2"
        >
          {isLoading ? (
            <>
              <LuLoaderCircle className="w-4 h-4 animate-spin" />
              {t("proxies.sxorg.checking")}
            </>
          ) : (
            t("proxies.sxorg.connect")
          )}
        </Button>
      </div>
    </div>
  );
}

interface BalanceCardProps {
  balance: SXOrgBalance | null;
  onLogout: () => void;
}

function BalanceCard({ balance, onLogout }: BalanceCardProps) {
  const { t } = useTranslation();
  const formatted = balance
    ? Number.parseFloat(balance.balance).toFixed(2)
    : "—";
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="flex gap-3 items-center px-4 py-2.5 rounded-lg border bg-gradient-to-r from-primary/5 to-background"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
        <LuWallet className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {t("proxies.sxorg.balance")}
        </span>
        <motion.span
          key={formatted}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="text-base font-bold tabular-nums"
        >
          ${formatted}
        </motion.span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLogout}
        title="logout"
        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
      >
        <LuLogOut className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

interface CreateProxyFormProps {
  client: SXOrgClient;
  onCreated: (proxies: SXOrgProxyPort[]) => void | Promise<void>;
}

function CreateProxyForm({ client, onCreated }: CreateProxyFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([
    "mobile",
    "residential",
    "datacenter",
  ]);
  const [proxyCount, setProxyCount] = useState(1);
  const [behaviorType, setBehaviorType] = useState<BehaviorType>("keep");
  const [rotateInterval, setRotateInterval] = useState(5);
  const [changeOnRequest, setChangeOnRequest] = useState(true);

  const [countries, setCountries] = useState<SXOrgCountry[]>([]);
  const [states, setStates] = useState<SXOrgState[]>([]);
  const [cities, setCities] = useState<SXOrgCity[]>([]);

  const [selectedCountry, setSelectedCountry] = useState<SXOrgCountry | null>(
    null,
  );
  const [selectedState, setSelectedState] = useState<SXOrgState | null>(null);
  const [selectedCity, setSelectedCity] = useState<SXOrgCity | null>(null);

  const [step, setStep] = useState<LocationStep>("country");
  const [countrySearch, setCountrySearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingCountries(true);
    client
      .getCountries()
      .then((data) => {
        if (!cancelled) setCountries(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError(t("proxies.sxorg.loadCountriesError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, t]);

  const handleCountrySelect = useCallback(
    async (country: SXOrgCountry) => {
      if (selectedCountry?.id === country.id) {
        setStep("region");
        return;
      }
      setSelectedCountry(country);
      setSelectedState(null);
      setSelectedCity(null);
      setStates([]);
      setCities([]);
      setError(null);
      setLoadingStates(true);
      try {
        const data = await client.getStates(country.id);
        setStates(data);
        setStep(data.length > 0 ? "region" : "advanced");
      } catch (err) {
        console.error(err);
        setError(t("proxies.sxorg.loadStatesError"));
      } finally {
        setLoadingStates(false);
      }
    },
    [client, selectedCountry, t],
  );

  const handleStateSelect = useCallback(
    async (state: SXOrgState) => {
      if (!selectedCountry) return;
      if (selectedState?.id === state.id) {
        setStep("city");
        return;
      }
      setSelectedState(state);
      setSelectedCity(null);
      setCities([]);
      setError(null);
      setLoadingCities(true);
      try {
        const data = await client.getCities(selectedCountry.id, state.id);
        setCities(data);
        setStep(data.length > 0 ? "city" : "advanced");
      } catch (err) {
        console.error(err);
        setError(t("proxies.sxorg.loadCitiesError"));
      } finally {
        setLoadingCities(false);
      }
    },
    [client, selectedCountry, selectedState, t],
  );

  const handleCitySelect = useCallback((city: SXOrgCity) => {
    setSelectedCity(city);
    setStep("advanced");
  }, []);

  const toggleDeviceType = useCallback((type: DeviceType) => {
    setDeviceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const filteredCountries = useMemo(
    () =>
      countries.filter((c) =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()),
      ),
    [countries, countrySearch],
  );
  const filteredStates = useMemo(
    () =>
      states.filter((s) =>
        s.name.toLowerCase().includes(stateSearch.toLowerCase()),
      ),
    [states, stateSearch],
  );
  const filteredCities = useMemo(
    () =>
      cities.filter((c) =>
        c.name.toLowerCase().includes(citySearch.toLowerCase()),
      ),
    [cities, citySearch],
  );
  const smartCountries = useMemo(
    () => countries.filter((c) => SMART_COUNTRY_CODES.includes(c.code)),
    [countries],
  );

  const handleCreate = async () => {
    if (!selectedCountry || deviceTypes.length === 0) {
      setError(t("proxies.sxorg.selectCountryDevice"));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const sessionTypeId =
        behaviorType === "rotate" ? 3 : behaviorType === "keep" ? 2 : 1;
      let proxyTypeId = 4;
      if (deviceTypes.includes("mobile")) proxyTypeId = 1;
      else if (deviceTypes.includes("residential")) proxyTypeId = 2;

      const computedName =
        name.trim() ||
        `${selectedCountry.name}${selectedState ? ` - ${selectedState.name}` : ""}${
          selectedCity ? ` - ${selectedCity.name}` : ""
        }`;

      const params: CreateProxyRequest = {
        country_code: selectedCountry.code,
        state_id: selectedState?.id,
        city_id: selectedCity?.id,
        name: computedName,
        type_id: sessionTypeId,
        proxy_type_id: proxyTypeId,
        server_port_type_id: 0,
        count: proxyCount,
        ttl: behaviorType === "rotate" ? rotateInterval : 1,
        traffic_limit: 0,
      };

      const result = await client.createProxy(params);
      const created = result.data ?? result.message?.proxies ?? [];
      if (!result.success || created.length === 0) {
        throw new Error(t("proxies.sxorg.createError"));
      }
      const enriched = created.map((proxy) => ({
        ...proxy,
        countryCode: selectedCountry.code,
        country_code: selectedCountry.code,
        country: selectedCountry.name,
        stateName: selectedState?.name,
        cityName: selectedCity?.name,
        proxy_type_id: proxyTypeId,
      }));
      await onCreated(enriched);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("proxies.sxorg.createError");
      setError(message);
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const stepLabel = (s: LocationStep) => {
    switch (s) {
      case "country":
        return t("proxies.sxorg.country");
      case "region":
        return t("proxies.sxorg.region");
      case "city":
        return t("proxies.sxorg.city");
      case "advanced":
        return t("proxies.sxorg.advancedSettings");
    }
  };

  const stepDone = {
    country: !!selectedCountry,
    region: !!selectedState,
    city: !!selectedCity,
    advanced: false,
  };

  const stepDisabled = {
    country: false,
    region: !selectedCountry,
    city: !selectedState,
    advanced: !selectedCountry,
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 pb-4 border-b">
        <div className="flex-1 space-y-2">
          <Label htmlFor="sxorg-name">{t("proxies.sxorg.nameLabel")}</Label>
          <Input
            id="sxorg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("proxies.sxorg.namePlaceholder")}
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label>{t("proxies.sxorg.deviceType")}</Label>
          <div className="flex gap-2">
            {(["mobile", "residential", "datacenter"] as const).map((type) => (
              <DeviceTypeButton
                key={type}
                type={type}
                selected={deviceTypes.includes(type)}
                onToggle={toggleDeviceType}
                label={t(`proxies.sxorg.device.${type}`)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 p-1 rounded-xl bg-muted/50 border">
        {(["country", "region", "city", "advanced"] as LocationStep[]).map(
          (s, idx) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => !stepDisabled[s] && setStep(s)}
              disabled={stepDisabled[s]}
              whileHover={!stepDisabled[s] ? { y: -1 } : undefined}
              whileTap={!stepDisabled[s] ? { scale: 0.97 } : undefined}
              transition={{ type: "spring", stiffness: 400, damping: 24 }}
              className={cn(
                "relative flex-1 flex gap-2 items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                step === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold transition-colors",
                  stepDone[s]
                    ? "bg-primary text-primary-foreground"
                    : step === s
                      ? "bg-primary/20 text-primary"
                      : "bg-muted-foreground/20 text-muted-foreground",
                )}
              >
                {stepDone[s] ? (
                  <LuCheck className="w-3 h-3" strokeWidth={3} />
                ) : (
                  idx + 1
                )}
              </span>
              <span>{stepLabel(s)}</span>
            </motion.button>
          ),
        )}
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-4"
          >
            {step === "country" && (
              <div className="space-y-4">
                {loadingCountries ? (
                  <Spinner />
                ) : (
                  <>
                    <SearchInput
                      value={countrySearch}
                      onChange={setCountrySearch}
                      placeholder={t("proxies.sxorg.searchCountry")}
                    />
                    {smartCountries.length > 0 && !countrySearch && (
                      <div>
                        <h5 className="text-sm font-semibold mb-3">
                          {t("proxies.sxorg.smartList")}
                        </h5>
                        <div className="grid grid-cols-2 gap-2">
                          {smartCountries.map((country) => (
                            <CountryButton
                              key={country.code}
                              country={country}
                              selected={selectedCountry?.id === country.id}
                              smart
                              onClick={() => handleCountrySelect(country)}
                              smartLabel={t("proxies.sxorg.many")}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <h5 className="text-sm font-semibold mb-3">
                        {t("proxies.sxorg.allCountries")}
                      </h5>
                      <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                        {filteredCountries.map((country) => (
                          <CountryButton
                            key={country.code}
                            country={country}
                            selected={selectedCountry?.id === country.id}
                            onClick={() => handleCountrySelect(country)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === "region" && (
              <div className="space-y-4">
                {loadingStates ? (
                  <Spinner />
                ) : (
                  <>
                    <SearchInput
                      value={stateSearch}
                      onChange={setStateSearch}
                      placeholder={t("proxies.sxorg.searchRegion")}
                    />
                    {filteredStates.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {filteredStates.map((state) => (
                          <SelectableTile
                            key={state.id}
                            selected={selectedState?.id === state.id}
                            onClick={() => handleStateSelect(state)}
                          >
                            {state.name}
                          </SelectableTile>
                        ))}
                      </div>
                    ) : (
                      <EmptyHint
                        title={t("proxies.sxorg.noRegions")}
                        hint={t("proxies.sxorg.noRegionsHint")}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {step === "city" && (
              <div className="space-y-4">
                {loadingCities ? (
                  <Spinner />
                ) : (
                  <>
                    <SearchInput
                      value={citySearch}
                      onChange={setCitySearch}
                      placeholder={t("proxies.sxorg.searchCity")}
                    />
                    {filteredCities.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {filteredCities.map((city) => (
                          <SelectableTile
                            key={city.id}
                            selected={selectedCity?.id === city.id}
                            onClick={() => handleCitySelect(city)}
                          >
                            {city.name}
                          </SelectableTile>
                        ))}
                      </div>
                    ) : (
                      <EmptyHint
                        title={t("proxies.sxorg.noCities")}
                        hint={t("proxies.sxorg.noCitiesHint")}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {step === "advanced" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <Label>{t("proxies.sxorg.quantity")}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-muted-foreground">
                          <LuCircleHelp className="w-4 h-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("proxies.sxorg.quantityTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={proxyCount}
                    onChange={(e) =>
                      setProxyCount(
                        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      )
                    }
                  />
                </div>

                <div className="space-y-3">
                  <Label>{t("proxies.sxorg.behaviorLabel")}</Label>
                  <BehaviorOption
                    value="keep"
                    current={behaviorType}
                    onChange={setBehaviorType}
                    title={t("proxies.sxorg.behaviorKeep")}
                    description={t("proxies.sxorg.behaviorKeepDesc")}
                  />
                  <BehaviorOption
                    value="break"
                    current={behaviorType}
                    onChange={setBehaviorType}
                    title={t("proxies.sxorg.behaviorBreak")}
                    description={t("proxies.sxorg.behaviorBreakDesc")}
                  />
                  <BehaviorOption
                    value="rotate"
                    current={behaviorType}
                    onChange={setBehaviorType}
                    title={t("proxies.sxorg.behaviorRotate")}
                    description={t("proxies.sxorg.behaviorRotateDesc")}
                  >
                    <AnimatePresence initial={false}>
                      {behaviorType === "rotate" && (
                        <motion.div
                          key="rotate-options"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-2 pl-1">
                            <label className="flex gap-2 items-center text-sm">
                              <input
                                type="radio"
                                name="sxorg-rotate-mode"
                                checked={changeOnRequest}
                                onChange={() => setChangeOnRequest(true)}
                              />
                              <span>{t("proxies.sxorg.changeOnRequest")}</span>
                            </label>
                            <label className="flex gap-2 items-center text-sm">
                              <input
                                type="radio"
                                name="sxorg-rotate-mode"
                                checked={!changeOnRequest}
                                onChange={() => setChangeOnRequest(false)}
                              />
                              <span>{t("proxies.sxorg.changeEvery")}</span>
                              <Input
                                type="number"
                                min={1}
                                value={rotateInterval}
                                onChange={(e) =>
                                  setRotateInterval(
                                    Math.max(
                                      1,
                                      Number.parseInt(e.target.value, 10) || 5,
                                    ),
                                  )
                                }
                                onFocus={() => setChangeOnRequest(false)}
                                className="w-20 h-8"
                                disabled={changeOnRequest}
                              />
                              <span>{t("proxies.sxorg.minutes")}</span>
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </BehaviorOption>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && (
        <Alert variant="destructive">
          <LuTriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleCreate}
        disabled={
          creating ||
          !selectedCountry ||
          deviceTypes.length === 0 ||
          step !== "advanced" ||
          loadingStates ||
          loadingCities
        }
        className="w-full gap-2"
      >
        {creating ? (
          <>
            <LuLoaderCircle className="w-4 h-4 animate-spin" />
            {t("proxies.sxorg.creating")}
          </>
        ) : (
          t("proxies.sxorg.createButton")
        )}
      </Button>
    </div>
  );
}

interface DeviceTypeButtonProps {
  type: DeviceType;
  selected: boolean;
  onToggle: (t: DeviceType) => void;
  label: string;
}

function DeviceTypeButton({
  type,
  selected,
  onToggle,
  label,
}: DeviceTypeButtonProps) {
  const Icon =
    type === "mobile"
      ? LuSmartphone
      : type === "residential"
        ? LuWifi
        : LuServer;
  return (
    <motion.button
      type="button"
      onClick={() => onToggle(type)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={cn(
        "relative flex-1 flex flex-col gap-1.5 items-center justify-center px-3 py-3 rounded-lg border text-xs font-medium transition-colors overflow-hidden",
        selected
          ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
    >
      <Icon className={cn("w-5 h-5", selected && "text-primary")} />
      <span>{label}</span>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground"
          >
            <LuCheck className="w-2.5 h-2.5" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

interface CountryButtonProps {
  country: SXOrgCountry;
  selected: boolean;
  smart?: boolean;
  smartLabel?: string;
  onClick: () => void;
}

function CountryButton({
  country,
  selected,
  smart = false,
  smartLabel,
  onClick,
}: CountryButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={cn(
        "relative flex gap-2 items-center p-2 rounded-lg border text-left text-sm transition-colors overflow-hidden",
        smart && "p-3 gap-3",
        selected
          ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
          : "border-border hover:bg-muted hover:border-primary/40",
      )}
    >
      <FlagIcon
        countryCode={country.code}
        className={smart ? "text-2xl" : ""}
      />
      <span className="flex-1 truncate font-medium">{country.name}</span>
      {smart && smartLabel && !selected && (
        <span className="px-2 py-0.5 bg-primary/15 text-primary text-xs rounded-full font-semibold">
          {smartLabel}
        </span>
      )}
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground shrink-0"
          >
            <LuCheck className="w-3 h-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

interface SelectableTileProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function SelectableTile({ selected, onClick, children }: SelectableTileProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={cn(
        "relative flex items-center gap-2 p-3 rounded-lg border text-left transition-colors text-sm overflow-hidden",
        selected
          ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
          : "border-border hover:bg-muted hover:border-primary/40",
      )}
    >
      <span className="flex-1 truncate">{children}</span>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground shrink-0"
          >
            <LuCheck className="w-3 h-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

interface BehaviorOptionProps {
  value: BehaviorType;
  current: BehaviorType;
  onChange: (v: BehaviorType) => void;
  title: string;
  description: string;
  children?: React.ReactNode;
}

function BehaviorOption({
  value,
  current,
  onChange,
  title,
  description,
  children,
}: BehaviorOptionProps) {
  const selected = current === value;
  return (
    <motion.label
      layout
      whileHover={{ scale: 1.005 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn(
        "relative flex gap-3 items-start p-4 border rounded-lg cursor-pointer transition-colors",
        selected
          ? "border-primary bg-primary/5 shadow-sm shadow-primary/5"
          : "border-border hover:bg-muted hover:border-primary/40",
      )}
    >
      <input
        type="radio"
        name="sxorg-behavior"
        checked={selected}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        className={cn(
          "mt-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-colors",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        <AnimatePresence>
          {selected && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="w-2.5 h-2.5 rounded-full bg-primary"
            />
          )}
        </AnimatePresence>
      </span>
      <div className="flex-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{description}</div>
        {children}
      </div>
    </motion.label>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative">
      <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

function EmptyHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <div className="mb-2 text-sm">{title}</div>
      <div className="text-xs">{hint}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <LuLoaderCircle className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

interface ImportProxyListProps {
  client: SXOrgClient;
  onImport: (proxies: SXOrgProxyPort[]) => void | Promise<void>;
}

function ImportProxyList({ client, onImport }: ImportProxyListProps) {
  const { t } = useTranslation();
  const [proxies, setProxies] = useState<SXOrgProxyPort[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const loadProxies = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await client.getProxies();
      setProxies(response.data || []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("proxies.sxorg.loadError");
      setError(msg);
      setProxies([]);
    } finally {
      setIsLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadProxies();
  }, [loadProxies]);

  const filteredProxies = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return proxies.filter((proxy) => {
      const host = proxy.proxy || proxy.server || "";
      const country = proxy.countryCode || proxy.country_code || "";
      return (
        proxy.name?.toLowerCase().includes(q) ||
        host.toLowerCase().includes(q) ||
        country.toLowerCase().includes(q)
      );
    });
  }, [proxies, searchQuery]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredProxies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredProxies.map((p) => p.id)));
    }
  };

  const handleImport = async () => {
    const chosen = proxies.filter((p) => selected.has(p.id));
    if (chosen.length === 0) {
      toast.error(t("proxies.sxorg.selectAtLeastOne"));
      return;
    }
    await onImport(chosen);
    setSelected(new Set());
    void loadProxies();
  };

  const handleDelete = async (proxyId: number) => {
    if (!confirm(t("proxies.sxorg.confirmDeleteProxy"))) return;
    try {
      await client.deleteProxy(proxyId);
      showSuccessToast(t("proxies.sxorg.proxyDeleted"));
      void loadProxies();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t("proxies.sxorg.proxyDeleteError");
      showErrorToast(msg);
    }
  };

  const handleRefreshIP = async (proxy: SXOrgProxyPort) => {
    if (!proxy.refresh_link) {
      toast.error(t("proxies.sxorg.refreshIPNoLink"));
      return;
    }
    try {
      await client.refreshProxyIP(proxy.refresh_link);
      showSuccessToast(t("proxies.sxorg.refreshIPSuccess"));
      void loadProxies();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("proxies.sxorg.refreshIPError");
      showErrorToast(msg);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t("proxies.sxorg.searchPlaceholder")}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={loadProxies}
          disabled={isLoading}
        >
          <LuRefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleSelectAll}>
          <LuCheck className="w-4 h-4 mr-2" />
          {t("proxies.sxorg.selectAllButton")}
        </Button>
        <Button
          size="sm"
          onClick={handleImport}
          disabled={selected.size === 0}
          className="gap-2"
        >
          <LuDownload className="w-4 h-4" />
          {t("proxies.sxorg.importButton", { count: selected.size })}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <LuTriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1 min-h-0 border rounded-md">
        {isLoading && proxies.length === 0 ? (
          <Spinner />
        ) : filteredProxies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery
              ? t("proxies.sxorg.noProxiesFound")
              : t("proxies.sxorg.noProxiesYet")}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredProxies.map((proxy) => {
              const { host, port } = parseSXOrgProxyHostPort(proxy);
              const cc = (
                proxy.countryCode ||
                proxy.country_code ||
                ""
              ).toLowerCase();
              const isSelected = selected.has(proxy.id);
              return (
                <motion.div
                  key={proxy.id}
                  layout
                  whileHover={{ x: 2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className={cn(
                    "p-2.5 rounded-lg border transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary/10 border-primary shadow-sm shadow-primary/10"
                      : "border-transparent hover:bg-muted hover:border-border",
                  )}
                  onClick={() => toggleSelect(proxy.id)}
                >
                  <div className="flex gap-3 items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(proxy.id);
                      }}
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30",
                      )}
                      aria-label="select"
                    >
                      <AnimatePresence>
                        {isSelected && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 22,
                            }}
                          >
                            <LuCheck
                              className="w-3 h-3 text-primary-foreground"
                              strokeWidth={3}
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {proxy.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {host && port ? `${host}:${port}` : "—"}
                      </div>
                    </div>
                    {cc && (
                      <div className="flex gap-2 items-center text-xs">
                        <FlagIcon countryCode={cc} />
                        <span className="font-medium uppercase">{cc}</span>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefreshIP(proxy);
                      }}
                      disabled={!proxy.refresh_link}
                      title={t("proxies.sxorg.refreshIPTitle")}
                    >
                      <LuRefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(proxy.id);
                      }}
                      title={t("proxies.sxorg.deleteProxyTitle")}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <LuTrash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="text-xs text-muted-foreground">
        {t("proxies.sxorg.foundProxies", {
          filtered: filteredProxies.length,
          total: proxies.length,
        })}
      </div>
    </div>
  );
}
