const API_BASE = "https://api.sx.org/v2";
const STORAGE_KEY = "sxorg_api_key";

export interface SXOrgBalance {
  success: boolean;
  balance: string;
  balance_traffic?: string;
  all_available_traffic?: string;
  prepared_traffic_balance?: string;
  balance_hold?: string;
}

export interface SXOrgCountry {
  id: number;
  code: string;
  name: string;
  flag?: string;
}

export interface SXOrgState {
  id: number;
  name: string;
  dir_country_id: number;
}

export interface SXOrgCity {
  id: number;
  name: string;
  dir_country_id: number;
  dir_state_id: number;
}

export interface CreateProxyRequest {
  country_code: string;
  state_id?: number;
  city_id?: number;
  type_id?: number;
  proxy_type_id?: number;
  name?: string;
  server_port_type_id?: number;
  count?: number;
  ttl?: number;
  traffic_limit?: number;
}

export interface SXOrgProxyPort {
  id: number;
  name: string;
  proxy?: string;
  server?: string;
  port: number;
  login: string;
  password: string;
  countryCode?: string;
  country_code?: string;
  country?: string;
  stateName?: string;
  state?: string;
  cityName?: string;
  city?: string;
  type_id?: number;
  proxy_type_id: number;
  status: string | number;
  created_at?: string;
  expires_at?: string;
  refresh_link?: string;
  template?: string;
}

export interface SXOrgProxyList {
  success: boolean;
  data?: SXOrgProxyPort[];
  message?: {
    countProxies?: number;
    proxies?: SXOrgProxyPort[];
  };
}

export class SXOrgClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${API_BASE}${endpoint}${separator}apiKey=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  async getBalance(): Promise<SXOrgBalance> {
    return this.request<SXOrgBalance>("/user/balance");
  }

  async getCountries(): Promise<SXOrgCountry[]> {
    const response = await this.request<{
      success: boolean;
      countries: SXOrgCountry[];
    }>("/dir/countries");
    return response.countries || [];
  }

  async getStates(countryId: number): Promise<SXOrgState[]> {
    const response = await this.request<{
      success: boolean;
      states: SXOrgState[];
    }>(`/dir/states?countryId=${countryId}`);
    return response.states || [];
  }

  async getCities(countryId: number, stateId?: number): Promise<SXOrgCity[]> {
    const stateParam = stateId ? `&stateId=${stateId}` : "";
    const response = await this.request<{
      success: boolean;
      cities: SXOrgCity[];
    }>(`/dir/cities?countryId=${countryId}${stateParam}`);
    return response.cities || [];
  }

  async createProxy(params: CreateProxyRequest): Promise<SXOrgProxyList> {
    return this.request<SXOrgProxyList>("/proxy/create-port", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getProxies(): Promise<SXOrgProxyList> {
    const response = await this.request<SXOrgProxyList>("/proxy/ports");
    if (response.message?.proxies) {
      return { success: response.success, data: response.message.proxies };
    }
    return response;
  }

  async refreshProxyIP(refreshLink: string): Promise<{ success: boolean }> {
    const response = await fetch(refreshLink);
    return response.json();
  }

  async deleteProxy(proxyId: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/proxy/port/${proxyId}`, {
      method: "DELETE",
    });
  }
}

export function saveSXOrgApiKey(apiKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, apiKey);
  } catch {
    // ignore storage errors
  }
}

export function getSXOrgApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function removeSXOrgApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function parseSXOrgProxyHostPort(proxy: SXOrgProxyPort): {
  host: string;
  port: string;
} {
  if (proxy.proxy?.includes(":")) {
    const [host, port] = proxy.proxy.split(":");
    return { host, port };
  }
  return { host: proxy.server || "", port: proxy.port?.toString() || "" };
}

export function buildSXOrgProxyName(proxy: SXOrgProxyPort): string {
  const { host, port } = parseSXOrgProxyHostPort(proxy);
  let countryCode = (
    proxy.countryCode ||
    proxy.country_code ||
    ""
  ).toLowerCase();
  if (!countryCode && proxy.login) {
    const match = proxy.login.match(/country-([A-Z]{2})/i);
    if (match) {
      countryCode = match[1].toLowerCase();
    }
  }
  const country = countryCode ? countryCode.toUpperCase() : "Proxy";
  const city = proxy.cityName || proxy.city;
  const displayName = city?.trim() ? city : country;
  return `${displayName} - socks5://${host}:${port}`;
}
