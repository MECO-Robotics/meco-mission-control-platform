import { uniqueIds } from "./ids";

type SeasonMembership = {
  seasonId: string;
  activeSeasonIds?: readonly string[];
};

export function isActiveInSeason(membership: SeasonMembership, seasonId: string) {
  return uniqueIds([...(membership.activeSeasonIds ?? []), membership.seasonId]).includes(seasonId);
}
