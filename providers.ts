export type WebProvider = "exa" | "jina" | "tavily";
export type WebCapability = "search" | "extract" | "research" | "findSimilar" | "codeSearch";

const PROVIDER_ORDER: readonly WebProvider[] = ["exa", "jina", "tavily"] as const;

const PROVIDER_ENV_VARS: Record<WebProvider, string> = {
  exa: "EXA_API_KEY",
  jina: "JINA_API_KEY",
  tavily: "TAVILY_API_KEY",
};

const PROVIDER_CAPABILITIES: Record<WebProvider, readonly WebCapability[]> = {
  exa: ["search", "extract", "research", "findSimilar", "codeSearch"],
  jina: ["search", "extract"],
  tavily: ["search", "extract", "research"],
};

export type ProviderOptionBlocks = Partial<Record<WebProvider, Record<string, unknown> | undefined>>;

export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): WebProvider[] {
  return PROVIDER_ORDER.filter((provider) => hasConfiguredKey(provider, env));
}

export function getSupportedProviders(capability: WebCapability): WebProvider[] {
  return PROVIDER_ORDER.filter((provider) => providerSupportsCapability(provider, capability));
}

export function getProviderEnvVar(provider: WebProvider): string {
  return PROVIDER_ENV_VARS[provider];
}

export function getProviderApiKey(provider: WebProvider, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env[PROVIDER_ENV_VARS[provider]];
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : undefined;
}

export function providerSupportsCapability(provider: WebProvider, capability: WebCapability): boolean {
  return PROVIDER_CAPABILITIES[provider].includes(capability);
}

export function resolveProvider(options: {
  capability: WebCapability;
  provider?: WebProvider;
  env?: NodeJS.ProcessEnv;
  requireExplicitWhenMultiple?: boolean;
}): WebProvider {
  const env = options.env ?? process.env;
  const supportedProviders = getSupportedProviders(options.capability);

  if (options.provider) {
    if (!providerSupportsCapability(options.provider, options.capability)) {
      throw new Error(
        `Provider \"${options.provider}\" does not support ${options.capability}. Supported providers: ${supportedProviders.join(", ")}.`,
      );
    }

    if (!hasConfiguredKey(options.provider, env)) {
      throw new Error(`Provider \"${options.provider}\" is not configured. Set ${getProviderEnvVar(options.provider)}.`);
    }

    return options.provider;
  }

  const configuredSupportingProviders = getConfiguredProviders(env).filter((provider) =>
    providerSupportsCapability(provider, options.capability),
  );

  if (configuredSupportingProviders.length === 0) {
    throw new Error(
      `No configured providers support ${options.capability}. Supported providers: ${supportedProviders.join(", ")}.`,
    );
  }

  if (options.requireExplicitWhenMultiple && configuredSupportingProviders.length > 1) {
    throw new Error(
      `Multiple configured providers support ${options.capability}. Choose one explicitly: ${configuredSupportingProviders.join(", ")}.`,
    );
  }

  // Auto-select the first configured provider by priority order (exa > jina > tavily)
  return configuredSupportingProviders[0]!;
}

export function validateProviderOptions<T extends ProviderOptionBlocks>(provider: WebProvider, blocks: T | undefined): T | undefined {
  if (!blocks) return blocks;

  for (const [blockProvider, blockValue] of Object.entries(blocks) as [WebProvider, Record<string, unknown> | undefined][]) {
    if (!blockValue) continue;
    if (blockProvider !== provider) {
      throw new Error(
        `Provider-specific options for \"${blockProvider}\" cannot be used when the resolved provider is \"${provider}\".`,
      );
    }
  }

  return blocks;
}

function hasConfiguredKey(provider: WebProvider, env: NodeJS.ProcessEnv): boolean {
  return getProviderApiKey(provider, env) !== undefined;
}
