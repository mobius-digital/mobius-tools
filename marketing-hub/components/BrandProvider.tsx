"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The client side of the per-request brand.
 *
 * Server components load the brand from the database; this hands the parts
 * client components need down through context, replacing what used to be a
 * compile-time `import { brand } from "@/brand.config"`. `path()` prefixes
 * app-relative links and API calls with the brand's home, so a component
 * written as `path("/api/events")` works identically on every brand.
 */
export type ClientBrand = {
  slug: string;
  name: string;
  logoUrl: string;
  logoTint: boolean;
};

type BrandContextValue = ClientBrand & {
  path: (suffix: string) => string;
};

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: ClientBrand;
  children: ReactNode;
}) {
  // Memoized so effects that depend on `path` (the board's polling, the
  // settings refetch) keep one identity across renders instead of
  // restarting every time this provider re-renders.
  const value = useMemo<BrandContextValue>(
    () => ({
      ...brand,
      path: (suffix: string) =>
        `/b/${brand.slug}${suffix.startsWith("/") ? suffix : `/${suffix}`}`,
    }),
    [brand],
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const value = useContext(BrandContext);
  if (!value) throw new Error("useBrand outside a BrandProvider.");
  return value;
}
