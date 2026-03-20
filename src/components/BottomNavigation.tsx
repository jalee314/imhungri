/**
 * BottomNavigation
 *
 * A bottom navigation bar component with tab icons and profile photo.
 * Migrated to use ALF primitives (PR-029).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import DealCreationScreen from '../screens/contribution/DealCreationScreen';
import { fetchUserData } from '../services/userService';
import { GRAY, STATIC } from '../ui/alf/tokens';
import { Box, Text } from '../ui/primitives';

const { width: screenWidth } = Dimensions.get('window');

// Base design width (iPhone 15 = 393pt)
const BASE_WIDTH = 393;
// Scale factor for responsive sizing
const scale = (size: number) => (screenWidth / BASE_WIDTH) * size;

// Dynamic icon size - 25 on iPhone 15, ~28 on Pro Max
const ICON_SIZE = Math.round(scale(25));
const PROFILE_SIZE = Math.round(scale(25));

interface BottomNavigationProps {
  photoUrl?: any;
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  photoUrl: propPhotoUrl, 
  activeTab = 'profile',
  onTabPress 
}) => {
  const navigation = useNavigation();
  const { isAuthenticated } = useAuth();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [contributePressed, setContributePressed] = useState(false);
  const isFetchingRef = useRef(false);

  const loadUserData = async (): Promise<boolean> => {
    if (isFetchingRef.current) return !!userPhotoUrl;
    isFetchingRef.current = true;
    try {
      // Check if user is authenticated before fetching data
      if (!isAuthenticated) {
        setUserPhotoUrl(null);
        return false;
      }
      
      const userData = await fetchUserData();
      const hasProfilePicture = !!userData.profilePicture;
      setUserPhotoUrl(userData.profilePicture);
      return hasProfilePicture;
    } catch (error) {
      // Handle error silently
      setUserPhotoUrl(null);
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const attemptLoadWithRetry = async () => {
      if (!isAuthenticated || !isMounted) return;
      
      // Initial load
      const hasPicture = await loadUserData();
      
      // If we already have a profile picture, no need to retry
      if (hasPicture) return;
      
      // Retry with increasing delays until we get a profile picture or timeout
      const refreshAttempts = [2000, 5000, 10000, 15000]; // Retry at 2s, 5s, 10s, 15s
      
      for (const delay of refreshAttempts) {
        if (!isMounted) return;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (!isAuthenticated || !isMounted) return;
        
        const hasPictureNow = await loadUserData();
        if (hasPictureNow) break; // Stop retrying once we have a profile picture
      }
    };
    
    attemptLoadWithRetry();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useFocusEffect(
    React.useCallback(() => {
      loadUserData();
    }, [])
  );

  const navItems = [
    { id: 'feed', icon: 'view-grid', activeIcon: 'view-grid', label: 'Feed', screen: 'Feed' },
    { id: 'search', icon: 'magnify', activeIcon: 'magnify', label: 'Explore', screen: 'ExploreFeed' },
    { id: 'contribute', icon: 'plus-circle-outline', activeIcon: 'plus-circle', label: 'Contribute', screen: 'DealCreationScreen' },
    { id: 'favorites', icon: 'heart-outline', activeIcon: 'heart', label: 'Favorites', screen: 'FavoritesPage' },
    { id: 'profile', icon: 'account-circle-outline', activeIcon: 'account-circle', label: 'Profile', screen: 'ProfilePage' },
  ];

  const handleTabPress = (screenName: string) => {
    if (screenName === 'DealCreationScreen') {
      setContributePressed(true);
      setShowContributeModal(true);
      // Reset opacity after a short delay
      setTimeout(() => setContributePressed(false), 150);
      // Don't call onTabPress for contribute to avoid tab state change
    } else {
      if (onTabPress) {
        const tab = navItems.find(item => item.screen === screenName);
        if (tab) {
          onTabPress(tab.id);
        }
      } else {
        // Fallback to navigation if onTabPress is not provided (for backward compatibility)
        navigation.navigate(screenName as never);
      }
    }
  };

  const renderNavItem = (item: { id: string; icon: any; activeIcon: any; label: string; screen: string }) => {
    // Contribute button should never be considered active
    const isActive = item.id !== 'contribute' && activeTab === item.id;
    const isContributePressed = item.id === 'contribute' && contributePressed;
    
    if (item.id === 'profile') {
      const displayPhotoUrl = propPhotoUrl || userPhotoUrl;
      
      return (
        <TouchableOpacity
          key={item.id}
          style={styles.navItem}
          onPress={() => handleTabPress(item.screen)}
        >
          <Box w={ICON_SIZE} h={ICON_SIZE} center>
            {displayPhotoUrl && typeof displayPhotoUrl === 'string' ? (
              <Image source={{ uri: displayPhotoUrl }} style={[styles.navProfilePhoto, isActive && styles.activeNavProfilePhoto]} />
            ) : displayPhotoUrl ? (
              <Image source={displayPhotoUrl} style={[styles.navProfilePhoto, isActive && styles.activeNavProfilePhoto]} />
            ) : (
              <Box w={PROFILE_SIZE} h={PROFILE_SIZE} rounded="full" bg={GRAY[300]} center style={[styles.navProfilePlaceholderBorder, isActive && styles.activeNavProfilePhoto]}>
                <Text size="xs" color="textMuted">👤</Text>
              </Box>
            )}
          </Box>
          <Text size="xs" color={isActive ? 'text' : 'textMuted'} style={styles.navLabelMargin}>{item.label}</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.navItem, 
          isContributePressed && { opacity: 0.5 }
        ]}
        onPress={() => handleTabPress(item.screen)}
      >
        <Box w={ICON_SIZE} h={ICON_SIZE} center>
          <MaterialCommunityIcons
            name={isActive ? item.activeIcon : item.icon} 
            size={ICON_SIZE} 
            color={isActive ? STATIC.black : GRAY[600]} 
          />
        </Box>
        <Text size="xs" color={isActive ? 'text' : 'textMuted'} style={styles.navLabelMargin}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Box
        row
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        justify="space-around"
        align="center"
        bg="background"
        style={styles.bottomNavBorder}
      >
        {navItems.map(renderNavItem)}
      </Box>
      
      <DealCreationScreen
        visible={showContributeModal}
        onClose={() => {
          setShowContributeModal(false);
          setContributePressed(false); // Reset pressed state when modal closes
        }}
        onSubmitNavigateToFeed={() => {
          setShowContributeModal(false);
          setContributePressed(false);
          if (onTabPress) {
            onTabPress('feed');
            return;
          }
          navigation.navigate('Feed' as never);
        }}
      />
    </>
  );
};

// Minimal legacy styles for properties not yet in primitives
const styles = StyleSheet.create({
  bottomNavBorder: {
    borderTopWidth: 0.5,
    borderTopColor: '#bcbcbc',
    paddingTop: scale(4),
    paddingBottom: scale(32),
    paddingHorizontal: scale(8),
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: scale(65),
    paddingHorizontal: scale(4),
    flex: 1,
  },
  navLabelMargin: {
    marginTop: scale(4),
    textAlign: 'center',
    width: '100%',
  },
  navProfilePhoto: {
    width: PROFILE_SIZE,
    height: PROFILE_SIZE,
    borderRadius: PROFILE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  activeNavProfilePhoto: {
    borderColor: STATIC.black,
  },
  navProfilePlaceholderBorder: {
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
});

export default BottomNavigation;
