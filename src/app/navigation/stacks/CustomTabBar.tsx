/**
 * CustomTabBar (PR-021)
 * 
 * Custom tab bar component that wraps BottomNavigation.
 * Handles tab state management and special contribute tab behavior.
 */

import React from 'react';

import BottomNavigation from '../../../components/BottomNavigation';
import { useFeedUIStore } from '../../../stores/FeedUIStore';

interface CustomTabBarProps {
  state: {
    index: number;
    routeNames: string[];
  };
  navigation: {
    navigate: (name: string, params?: object) => void;
  };
}

/** Tab mapping from index to tab name */
const TAB_MAPPING = ['feed', 'search', 'contribute', 'favorites', 'profile'] as const;
const FEED_RESELECT_DEBOUNCE_MS = 250;
const FEED_RESELECT_STALE_LOCK_MS = 12000;
const POST_REFRESH_COOLDOWN_MS = 600;

/**
 * CustomTabBar - Custom tab bar using BottomNavigation
 * 
 * Handles:
 * - Tab state tracking
 * - Contribute tab modal behavior (doesn't change nav state)
 * - Profile tab reset behavior
 */
export const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, navigation }) => {
  // Don't change activeTab if user is on contribute tab (which is index 2)
  const actualActiveTab = state.index === 2 ? 'feed' : TAB_MAPPING[state.index];
  const [lastActiveTab, setLastActiveTab] = React.useState('feed');
  const lastFeedReselectPressTsRef = React.useRef(0);

  // Update last active tab when navigating to non-contribute tabs
  React.useEffect(() => {
    if (state.index !== 2) { // Not contribute tab
      setLastActiveTab(TAB_MAPPING[state.index]);
    }
  }, [state.index]);

  const handleTabPress = (tab: string) => {
    const tabIndex = TAB_MAPPING.indexOf(tab as typeof TAB_MAPPING[number]);
    if (tab === 'contribute') {
      // For contribute, don't change navigation state, just show modal
      // The BottomNavigation component will handle showing the modal
      return;
    }
    
    // Special handling for Profile tab - always reset to own profile
    if (tab === 'profile') {
      // Reset the ProfileStack to ProfileMain with no params (shows own profile)
      navigation.navigate('ProfilePage', {
        screen: 'ProfileMain',
        params: { viewUser: false, userId: undefined },
      });
      return;
    }

    if (tab === 'feed' && tabIndex === state.index) {
      const now = Date.now();
      if (now - lastFeedReselectPressTsRef.current < FEED_RESELECT_DEBOUNCE_MS) {
        return;
      }

      const feedUiState = useFeedUIStore.getState();
      if (feedUiState.isReselectReloadInProgress) {
        const lockStartedAt = feedUiState.reselectReloadStartedAt;
        const isStaleLock = lockStartedAt !== null && now - lockStartedAt > FEED_RESELECT_STALE_LOCK_MS;
        if (!isStaleLock) {
          return;
        }

        feedUiState.endReselectReload();
      }

      const endedAt = feedUiState.reselectReloadEndedAt;
      if (endedAt !== null && now - endedAt < POST_REFRESH_COOLDOWN_MS) {
        return;
      }

      lastFeedReselectPressTsRef.current = now;
      feedUiState.beginReselectReload();
      feedUiState.requestReselectReload();
      return;
    }
    
    if (tabIndex !== -1 && tabIndex !== state.index) {
      navigation.navigate(state.routeNames[tabIndex]);
    }
  };

  return (
    <BottomNavigation
      activeTab={state.index === 2 ? lastActiveTab : actualActiveTab}
      onTabPress={handleTabPress}
    />
  );
};

export default CustomTabBar;
