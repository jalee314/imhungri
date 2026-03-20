/**
 * @file Feed feature types
 *
 * Shared type definitions for the decomposed Feed feature sections.
 */

import type { Deal } from '../../types/deal';

/**
 * Core feed state: deals, loading flags, and error.
 */
export interface FeedState {
  deals: Deal[];
  filteredDeals: Deal[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

/**
 * Location-derived flags that drive feed content decisions.
 */
export interface FeedLocationState {
  isInitialLoad: boolean;
  isLocationLoading: boolean;
  hasLocationSet: boolean;
}

/**
 * Cuisine filter bar state & callbacks.
 */
export interface FeedCuisineFilter {
  selectedCuisineId: string;
  cuisinesWithDeals: Array<{ id: string; name: string }>;
  cuisinesLoading: boolean;
  onFilterSelect: (filterName: string) => void;
}

/**
 * Deal interaction callbacks (vote / favorite / navigate).
 */
export interface FeedInteractions {
  handleUpvote: (dealId: string) => void;
  handleDownvote: (dealId: string) => void;
  handleFavorite: (dealId: string) => void;
  handleDealPress: (dealId: string) => void;
}

/**
 * Full context returned by useFeed.
 */
export interface FeedContext {
  state: FeedState;
  location: FeedLocationState;
  cuisineFilter: FeedCuisineFilter;
  interactions: FeedInteractions;
  communityDeals: Deal[];
  dealsForYou: Deal[];
  onRefresh: (options?: { showRefreshIndicator?: boolean }) => Promise<void>;
  loadDeals: () => Promise<void>;
}
