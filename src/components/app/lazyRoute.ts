import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface PreloadableRouteComponent<T extends ComponentType<any>>
  extends LazyExoticComponent<T> {
  preload: () => Promise<{ default: T }>;
}

export const lazyRoute = <T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): PreloadableRouteComponent<T> => {
  const LazyComponent = lazy(loader) as PreloadableRouteComponent<T>;
  LazyComponent.preload = loader;
  return LazyComponent;
};
