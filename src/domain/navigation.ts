export const navigationViewIds = [
  "home",
  "work-tasks",
  "work-schedule",
  "work-risks",
  "work-activity",
  "resources-materials",
  "resources-documents",
  "resources-parts",
  "resources-purchases",
  "resources-manufacturing",
  "resources-structure",
  "team-people",
  "team-attendance",
] as const;

export type NavigationViewId = (typeof navigationViewIds)[number];

export function isNavigationViewId(value: string): value is NavigationViewId {
  return (navigationViewIds as readonly string[]).includes(value);
}
