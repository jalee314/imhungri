import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';

import type { RouteProp } from '@react-navigation/native';

import type { ContributeStackParamList, DiscoverStackParamList, FeedStackParamList } from '../app/navigation/types';
import { useLocation } from '../hooks/useLocation';
import Feed from '../screens/deal_feed/Feed';
import DiscoverFeed from '../screens/discover_feed/DiscoverFeed';
import { STATIC } from '../ui/alf';

import Header from './Header';
import LocationModal from './LocationModal';
import PostUploadProgressBar from './PostUploadProgressBar';

interface FeedTabNavigatorProps {
  currentTab?: 'feed' | 'discover';
  onTabChange?: (tab: 'feed' | 'discover') => void;
  route?:
    | RouteProp<FeedStackParamList, 'Feed Main'>
    | RouteProp<DiscoverStackParamList, 'DiscoverMain'>
    | RouteProp<ContributeStackParamList, 'ContributeMain'>;
}

const FeedTabNavigator: React.FC<FeedTabNavigatorProps> = ({
  currentTab = 'feed',
  onTabChange,
  route,
}) => {
  const { currentLocation, updateLocation, refreshPermissionStatus } = useLocation();
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const refreshToken = (route?.params as { refreshToken?: number } | undefined)?.refreshToken;

  const handleLocationPress = useCallback(async () => {
    // Refresh permission status when modal is opened (in case user returned from settings)
    await refreshPermissionStatus();
    setLocationModalVisible(true);
  }, [refreshPermissionStatus]);

  const handleLocationUpdate = useCallback((location: { id: string; city: string; state: string; coordinates?: { lat: number; lng: number } }) => {
    updateLocation(location);
    console.log('Location updated to:', location);
  }, [updateLocation]);

  const handleLocationModalClose = useCallback(() => {
    setLocationModalVisible(false);
  }, []);

  // Render the appropriate screen based on currentTab
  const renderCurrentScreen = () => {
    switch (currentTab) {
      case 'feed':
        return <Feed refreshToken={refreshToken} />;
      case 'discover':
        return <DiscoverFeed />;
      default:
        return <Feed refreshToken={refreshToken} />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Persistent Header */}
      <Header
        onLocationPress={handleLocationPress}
        currentLocation={currentLocation}
      />

      <PostUploadProgressBar />

      {/* Current Screen Content */}
      <View style={styles.screenContainer}>
        {renderCurrentScreen()}
      </View>

      {/* Location Modal */}
      <LocationModal
        visible={locationModalVisible}
        onClose={handleLocationModalClose}
        onLocationUpdate={handleLocationUpdate}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STATIC.white,
  },
  screenContainer: {
    flex: 1,
  },
});

export default FeedTabNavigator;