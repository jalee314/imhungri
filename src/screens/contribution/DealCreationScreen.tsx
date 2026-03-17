import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import CalendarModal from '../../components/CalendarModal';
import InstagramPhotoPickerModal, { PhotoWithCrop, CropRegion } from '../../components/InstagramPhotoPickerModal';
import ListSelectionModal from '../../components/ListSelectionModal';
import PhotoActionModal from '../../components/PhotoActionModal';
import PhotoReviewModal from '../../components/PhotoReviewModal';
import { useDealForm, IMAGES_MAX_COUNT } from '../../features/contribution/engine';
import type { FormRestaurant } from '../../features/contribution/engine';
import {
  TitleSection,
  DetailsSection,
  PhotoRow,
  DateRow,
  PickerRow,
  AnonymousToggle,
  FormDivider,
} from '../../features/contribution/sections';
import { useDataCache } from '../../hooks/useDataCache';
import { useDealUpdate } from '../../hooks/useDealUpdate';
import { createDeal, checkDealContentForProfanity } from '../../services/dealService';
import { ProfileCacheService } from '../../services/profileCacheService';
import { searchRestaurants, getOrCreateRestaurant, GooglePlaceResult } from '../../services/restaurantService';
import { fetchUserData } from '../../services/userService';
import {
  BRAND,
  GRAY,
  STATIC,
  ALPHA_COLORS,
  SPACING,
  RADIUS,
  OPACITY,
  ICON_SIZE,
  TIMING,
  DIMENSION,
  CAMERA,
  Z_INDEX,
} from '../../ui/alf';
import { Box, Text, Pressable } from '../../ui/primitives';

import DealPreviewScreen from './DealPreviewScreen';

// --- Debounce Helper Function ---
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// --- Interfaces ---
interface SearchRestaurant {
  id: string;
  name: string;
  subtext: string;
  google_place_id?: string;
  lat?: number;
  lng?: number;
  address?: string;
  distance_miles?: number;
}

interface DealCreationScreenProps {
  visible: boolean;
  onClose: () => void;
  onSubmitNavigateToFeed?: () => void;
}

export default function DealCreationScreen({ visible, onClose, onSubmitNavigateToFeed }: DealCreationScreenProps) {
  const {
    setPostAdded,
    startPostUpload,
    setPostUploadProgress,
    completePostUpload,
    resetPostUpload,
  } = useDealUpdate();
  const { categories, cuisines, loading: dataLoading } = useDataCache();

  // ── Form engine ──────────────────────────────────────────────────────────
  const form = useDealForm({ mode: 'create' });

  // ── Non-form local state ─────────────────────────────────────────────────
  const [userData, setUserData] = useState({
    username: '',
    profilePicture: null as string | null,
    city: '',
    state: ''
  });
  const [isCameraModalVisible, setIsCameraModalVisible] = useState(false);
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const [isCategoriesModalVisible, setIsCategoriesModalVisible] = useState(false);
  const [isFoodTagsModalVisible, setIsFoodTagsModalVisible] = useState(false);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  // Keep original (uncropped) URIs so re-editing always starts from the original
  const [originalImageUris, setOriginalImageUris] = useState<string[]>([]);
  // Store crop regions from Instagram picker for initial positioning in PhotoReviewModal
  const [cropRegions, setCropRegions] = useState<CropRegion[]>([]);
  const [isPhotoReviewVisible, setIsPhotoReviewVisible] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isInstagramPickerVisible, setIsInstagramPickerVisible] = useState(false);

  // Google Places search state
  const [searchResults, setSearchResults] = useState<SearchRestaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const detailsInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);
  const uploadProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Reference to abort controller for cancelling in-flight search requests
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const clearUploadTimers = useCallback(() => {
    if (uploadProgressIntervalRef.current) {
      clearInterval(uploadProgressIntervalRef.current);
      uploadProgressIntervalRef.current = null;
    }
    if (uploadSuccessTimeoutRef.current) {
      clearTimeout(uploadSuccessTimeoutRef.current);
      uploadSuccessTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearUploadTimers();
    };
  }, [clearUploadTimers]);

  const loadUserData = async () => {
    try {
      const data = await fetchUserData();
      setUserData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    if (visible) {
      loadUserData();
    } else {
      setIsPreviewVisible(false);
    }
  }, [visible]);

  useFocusEffect(
    React.useCallback(() => {
      if (visible) {
        loadUserData();
      }
    }, [visible])
  );

  // Get device's current location with timeout to prevent hangs
  const getDeviceLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    const LOCATION_TIMEOUT_MS = TIMING.locationTimeout;

    try {
      // Wrap the entire location process with a timeout
      const locationPromise = (async () => {
        let { status } = await Location.getForegroundPermissionsAsync();

        // If permissions are not granted, request them
        if (status !== 'granted') {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          status = newStatus;
        }

        // If permissions are still not granted, return null
        if (status !== 'granted') {
          return null;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        return {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        };
      })();

      // Race against timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn('getDeviceLocation: Timed out after 5 seconds');
          resolve(null);
        }, LOCATION_TIMEOUT_MS);
      });

      return await Promise.race([locationPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error getting device location:', error);
      return null;
    }
  };

  // Debounced Google Places search (when user types)
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      // Cancel any previous search
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      // Create new abort controller for this search
      const abortController = new AbortController();
      searchAbortControllerRef.current = abortController;

      setIsSearching(true);
      setSearchError(null);

      try {
        // Get device location for search
        const deviceLocation = await getDeviceLocation();

        // Check if this search was cancelled while we were getting location
        if (abortController.signal.aborted) {
          return;
        }

        if (!deviceLocation) {
          setSearchError('Location not available. Please enable location services.');
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        // Search via Google Places API with abort signal
        const result = await searchRestaurants(
          query,
          deviceLocation.lat,
          deviceLocation.lng,
          abortController.signal
        );

        // Check if cancelled before updating state
        if (abortController.signal.aborted) {
          return;
        }

        if (!result.success) {
          setSearchError(result.error || 'Failed to search restaurants');
          setSearchResults([]);
        } else if (result.count === 0) {
          setSearchError('No restaurants found');
          setSearchResults([]);
        } else {
          // Transform results to match Restaurant interface
          const transformed = result.restaurants.map((place: GooglePlaceResult) => ({
            id: place.google_place_id,
            name: place.name,
            subtext: place.address.replace(/, USA$/, ''), // Remove ", USA" from the end
            google_place_id: place.google_place_id,
            lat: place.lat,
            lng: place.lng,
            address: place.address.replace(/, USA$/, ''), // Also clean the address field
            distance_miles: place.distance_miles,
          }));

          setSearchResults(transformed);
          setSearchError(null);
        }
      } catch (error: any) {
        // Don't show error if search was cancelled
        if (abortController.signal.aborted || error?.message?.includes('cancelled')) {
          return;
        }
        console.error('Search error:', error);
        setSearchError('An error occurred while searching');
        setSearchResults([]);
      } finally {
        // Only update loading state if this is still the current search
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, TIMING.debounce),
    []
  );

  // Cleanup function to cancel in-flight searches when modal closes
  useEffect(() => {
    if (!visible) {
      // Cancel any in-flight search when modal closes
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
      // Reset search state
      setIsSearching(false);
      setSearchError(null);
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [visible]);

  // Handle search query change
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    debouncedSearch(text);
  };

  // All existing handler functions remain the same
  const handleAddPhoto = () => setIsCameraModalVisible(true);
  const handleCloseCameraModal = () => setIsCameraModalVisible(false);

  const handleTakePhoto = async () => {
    try {
      console.log('Starting camera photo process...');

      // Request camera permissions
      console.log('Requesting camera permissions...');
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
      console.log('Camera permission status:', cameraStatus);

      if (cameraStatus.status !== 'granted') {
        console.log('Camera permission denied');
        handleCloseCameraModal();
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access in your device settings to take photos.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => ImagePicker.requestCameraPermissionsAsync() }
          ]
        );
        return;
      }

      console.log('Camera permission granted, launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: CAMERA.aspectRatio as [number, number],
        quality: CAMERA.quality
      });

      console.log('Camera result:', result);
      handleCloseCameraModal();

      if (!result.canceled) {
        console.log('Photo taken successfully:', result.assets[0].uri);
        // Append to existing photos (max 5)
        const currentUris = form.values.imageUris;
        if (currentUris.length >= IMAGES_MAX_COUNT) {
          Alert.alert('Limit Reached', 'You can only add up to 5 photos.');
        } else {
          form.setField('imageUris', [...currentUris, result.assets[0].uri]);
          setOriginalImageUris(prev => [...prev, result.assets[0].uri]);
        }
      } else {
        console.log('User canceled camera');
      }
    } catch (error: any) {
      handleCloseCameraModal();
      console.error('Camera error:', error);
      Alert.alert('Camera Error', `Unable to open camera: ${error?.message || 'Unknown error'}. Please try again.`);
    }
  };

  const handleChooseFromAlbum = () => {
    handleCloseCameraModal();
    setIsInstagramPickerVisible(true);
  };

  // Handle photos selected from Instagram-style picker
  const handleInstagramPickerDone = (photos: PhotoWithCrop[]) => {
    setIsInstagramPickerVisible(false);
    if (photos.length > 0) {
      const uris = photos.map(p => p.uri);
      const regions = photos.map(p => p.cropRegion);
      
      form.setField('imageUris', [...form.values.imageUris, ...uris].slice(0, IMAGES_MAX_COUNT));
      setOriginalImageUris(prev => [...prev, ...uris].slice(0, IMAGES_MAX_COUNT));
      setCropRegions(prev => [...prev, ...regions].slice(0, IMAGES_MAX_COUNT));
    }
  };

  const handleConfirmDate = (date: string | null) => {
    form.setField('expirationDate', date);
    setIsCalendarModalVisible(false);
  };

  const handleDoneCategories = (categoryIds: string[]) => {
    form.setField('categoryId', categoryIds.length > 0 ? categoryIds[0] : null);
    setIsCategoriesModalVisible(false);
  };

  const handleDoneCuisines = (cuisineIds: string[]) => {
    form.setField('cuisineId', cuisineIds.length > 0 ? cuisineIds[0] : null);
    setIsFoodTagsModalVisible(false);
  };

  // Handle restaurant selection with Google Places persistence
  const handleDoneSearch = async (selectedIds: string[]) => {
    if (selectedIds.length > 0) {
      // Get selected restaurant from search results
      const selectedPlace = searchResults.find(r => r.id === selectedIds[0]);

      if (selectedPlace && selectedPlace.google_place_id) {
        setIsSearchModalVisible(false);

        try {
          // Persist to database and get restaurant_id
          const result = await getOrCreateRestaurant({
            google_place_id: selectedPlace.google_place_id,
            name: selectedPlace.name,
            address: selectedPlace.address || selectedPlace.subtext.split(' • ')[0],
            lat: selectedPlace.lat!,
            lng: selectedPlace.lng!,
            distance_miles: selectedPlace.distance_miles || 0,
          });

          if (result.success && result.restaurant_id) {
            form.setField('restaurant', {
              id: result.restaurant_id,
              name: selectedPlace.name,
              address: selectedPlace.subtext,
              lat: selectedPlace.lat!,
              lng: selectedPlace.lng!,
            } as FormRestaurant);
          } else {
            Alert.alert('Error', 'Failed to save restaurant. Please try again.');
          }
        } catch (error) {
          console.error('Error saving restaurant:', error);
          Alert.alert('Error', 'An unexpected error occurred.');
        }
      }
    }

    // Clear search state
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  };

  const handleClearRestaurant = () => form.setField('restaurant', null);

  const handleSearchPress = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setIsSearchModalVisible(true);
  };

  const handlePreview = async () => {
    const result = form.validate();
    if (!result.valid) {
      Alert.alert("Missing Information", result.errors[0].message);
      return;
    }

    // Check for profanity before showing preview
    try {
      const profanityCheck = await checkDealContentForProfanity(form.values.title, form.values.details);
      if (!profanityCheck.success) {
        Alert.alert("Content Review", profanityCheck.error);
        return;
      }
    } catch (error) {
      console.error('Error checking profanity:', error);
      // If profanity check fails, show preview anyway
    }

    setIsPreviewVisible(true);
  };

  const handlePost = async () => {
    const validation = form.validate();
    if (!validation.valid) {
      Alert.alert("Missing Information", validation.errors[0].message);
      return;
    }

    setIsPosting(true);
    clearUploadTimers();
    startPostUpload();

    let progress = 0.08;
    uploadProgressIntervalRef.current = setInterval(() => {
      progress = Math.min(0.9, progress + 0.06);
      setPostUploadProgress(progress);
    }, 280);

    try {
      const { values } = form;
      // Pass all images and thumbnail index to createDeal
      const dealData = {
        title: values.title,
        description: values.details,
        imageUris: values.imageUris,
        thumbnailIndex: values.thumbnailIndex,
        expirationDate: values.expirationDate,
        restaurantId: values.restaurant!.id,
        categoryId: values.categoryId,
        cuisineId: values.cuisineId,
        isAnonymous: values.isAnonymous,
      };

      // Check for profanity before proceeding
      const profanityCheck = await checkDealContentForProfanity(dealData.title, dealData.description);
      if (!profanityCheck.success) {
        Alert.alert("Content Review", profanityCheck.error || "Content contains inappropriate language.");
        clearUploadTimers();
        resetPostUpload();
        setIsPosting(false);
        return;
      }

      setIsPreviewVisible(false);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (onSubmitNavigateToFeed) {
        onSubmitNavigateToFeed();
      } else {
        onClose();
      }

      const result = await createDeal(dealData);

      if (result.success) {
        await ProfileCacheService.forceRefresh();
        setPostAdded(true);
        clearUploadTimers();
        completePostUpload();

        form.reset();
        setOriginalImageUris([]);
        setCropRegions([]);

        uploadSuccessTimeoutRef.current = setTimeout(() => {
          resetPostUpload();
        }, 1000);
      } else {
        clearUploadTimers();
        resetPostUpload();
        Alert.alert("Error", result.error || "Failed to post deal. Please try again.");
      }
    } catch (error) {
      console.error('Error posting deal:', error);
      clearUploadTimers();
      resetPostUpload();
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleDetailsFocus = () => {
    setTimeout(() => {
      if (scrollViewRef.current && detailsInputRef.current) {
        scrollViewRef.current.scrollToPosition(0, DIMENSION.scrollDetailsFocusY, true);
      }
    }, TIMING.focusDelay);
  };

  const handleTitleFocus = () => {
    setTimeout(() => {
      if (scrollViewRef.current && titleInputRef.current) {
        scrollViewRef.current.scrollToPosition(0, DIMENSION.scrollTitleFocusY, true);
      }
    }, TIMING.focusDelay);
  };

  const getSelectedCategoryName = () => {
    if (!form.values.categoryId) return '';
    return categories.find(c => c.id === form.values.categoryId)?.name || '';
  };

  const getSelectedCuisineName = () => {
    if (!form.values.cuisineId) return '';
    return cuisines.find(c => c.id === form.values.cuisineId)?.name || '';
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: GRAY[100] }}>
        <StatusBar style="dark" />

        {/* Show a loading indicator when data is being loaded */}
        {dataLoading && (
          <Box absoluteFill center bg={ALPHA_COLORS.whiteOverlay70} style={{ zIndex: Z_INDEX.loader }}>
            <ActivityIndicator size="large" color={BRAND.accent} />
          </Box>
        )}

        <KeyboardAwareScrollView
          ref={scrollViewRef}
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ paddingBottom: SPACING.xl, paddingHorizontal: SPACING.md }}
          keyboardShouldPersistTaps="handled"
          extraScrollHeight={DIMENSION.extraScrollHeight}
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          keyboardOpeningTime={0}
          scrollToOverflowEnabled={true}
        >
          {/* Back Button and Next Button Row */}
          <Box row justify="space-between" align="center" mb="sm">
            <TouchableOpacity
              style={{ width: DIMENSION.hitArea, height: DIMENSION.hitArea, justifyContent: 'center', alignItems: 'center', borderRadius: RADIUS.circle }}
              onPress={onClose}
            >
              <Ionicons name="arrow-back" size={ICON_SIZE.sm} color={STATIC.black} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.lg,
                backgroundColor: ALPHA_COLORS.brandPrimary80,
                borderRadius: RADIUS.pill,
                minWidth: DIMENSION.buttonMinWidth,
                opacity: dataLoading ? OPACITY.disabled : OPACITY.full,
              }}
              onPress={handlePreview}
              disabled={dataLoading}
            >
              <Text size="xs" color={STATIC.black}>Review</Text>
            </TouchableOpacity>
          </Box>

          {/* Search bar */}
          {form.values.restaurant ? (
            <Box row align="center" py="lg" px="lg" h={DIMENSION.restaurantBarHeight} bg={ALPHA_COLORS.whiteCard93} rounded={RADIUS.card}>
              <Box flex={1} mr="lg">
                <Text size="xs" weight="bold" color={STATIC.black} style={{ lineHeight: DIMENSION.compactLineHeight, marginBottom: SPACING['2xs'] }}>
                  {form.values.restaurant.name}
                </Text>
                <Text size="xs" color={STATIC.black} style={{ lineHeight: DIMENSION.compactLineHeight }}>
                  {form.values.restaurant.address}
                </Text>
              </Box>
              <TouchableOpacity onPress={handleClearRestaurant}>
                <Ionicons name="close-circle" size={ICON_SIZE.md} color={GRAY[350]} />
              </TouchableOpacity>
            </Box>
          ) : (
            <Pressable row align="center" p="md" h={DIMENSION.searchBarHeight} bg={ALPHA_COLORS.whiteCard93} rounded={RADIUS.pill} gap="sm" px="lg" onPress={handleSearchPress}>
              <Ionicons name="search" size={ICON_SIZE.sm} color={ALPHA_COLORS.placeholderGray} />
              <Text size="xs" color={ALPHA_COLORS.nearBlack} ml="sm" flex={1}>Search for Restaurant *</Text>
            </Pressable>
          )}

          {/* Unified main container */}
          <Box mt={6} flex={1}>
            <Box bg={STATIC.white} rounded={RADIUS.card} py="md" flex={1} minH={DIMENSION.formMinHeight}>
              {/* Deal Title Section */}
              <TitleSection
                value={form.values.title}
                onChangeText={(text) => form.setField('title', text)}
                onFocus={handleTitleFocus}
                inputRef={titleInputRef}
              />

              <FormDivider />

              {/* Photo Row */}
              <PhotoRow
                photoCount={form.values.imageUris.length}
                onPress={form.values.imageUris.length > 0 ? () => setIsPhotoReviewVisible(true) : handleAddPhoto}
              />

              <FormDivider />

              {/* Expiration Date */}
              <DateRow
                expirationDate={form.values.expirationDate}
                onPress={() => setIsCalendarModalVisible(true)}
              />

              <FormDivider />

              {/* Deal Categories */}
              <PickerRow
                icon="grid-outline"
                label="Deal Categories"
                selectedLabel={getSelectedCategoryName() || null}
                onPress={() => setIsCategoriesModalVisible(true)}
              />

              <FormDivider />

              {/* Cuisine Tag */}
              <PickerRow
                icon="pricetag-outline"
                label="Cuisine Tag"
                selectedLabel={getSelectedCuisineName() || null}
                onPress={() => setIsFoodTagsModalVisible(true)}
              />

              <FormDivider />

              {/* Anonymous Toggle */}
              <AnonymousToggle
                value={form.values.isAnonymous}
                onValueChange={(val) => form.setField('isAnonymous', val)}
              />

              <FormDivider />

              {/* Extra Details */}
              <DetailsSection
                value={form.values.details}
                onChangeText={(text) => form.setField('details', text)}
                onFocus={handleDetailsFocus}
                inputRef={detailsInputRef}
              />
            </Box>
          </Box>
        </KeyboardAwareScrollView>
      </SafeAreaView>

      {/* Modals outside the SafeAreaView */}
      <PhotoActionModal
        visible={isCameraModalVisible}
        onClose={handleCloseCameraModal}
        onTakePhoto={handleTakePhoto}
        onChooseFromAlbum={handleChooseFromAlbum}
      />
      <CalendarModal visible={isCalendarModalVisible} onClose={() => setIsCalendarModalVisible(false)} onConfirm={handleConfirmDate} initialDate={form.values.expirationDate} />
      <ListSelectionModal
        visible={isCategoriesModalVisible}
        onClose={() => setIsCategoriesModalVisible(false)}
        onDone={handleDoneCategories}
        initialSelected={form.values.categoryId ? [form.values.categoryId] : []}
        data={categories}
        title="Add Deal Category"
        singleSelect={true}
      />
      <ListSelectionModal
        visible={isFoodTagsModalVisible}
        onClose={() => setIsFoodTagsModalVisible(false)}
        onDone={handleDoneCuisines}
        initialSelected={form.values.cuisineId ? [form.values.cuisineId] : []}
        data={cuisines}
        title="Cuisine Tag"
        singleSelect={true}
      />
      <ListSelectionModal
        visible={isSearchModalVisible}
        onClose={() => {
          setIsSearchModalVisible(false);
          setSearchQuery('');
          setSearchResults([]);
          setSearchError(null);
        }}
        onDone={handleDoneSearch}
        data={
          isSearching
            ? [{ id: 'loading', name: 'Searching restaurants...', subtext: '' }]
            : searchError
              ? [{ id: 'error', name: searchError || 'Unknown error', subtext: 'Try a different search' }]
              : searchQuery.trim().length > 0
                ? (searchResults.length > 0
                  ? searchResults
                  : [{ id: 'empty', name: 'No results found', subtext: 'Try a different search term' }])
                : [{ id: 'prompt', name: 'Search for a restaurant', subtext: 'Start typing to see results...' }]
        }
        title="Search Restaurant"
        onSearchChange={handleSearchChange}
        searchQuery={searchQuery}
      />

      <DealPreviewScreen
        visible={isPreviewVisible}
        onClose={() => setIsPreviewVisible(false)}
        onPost={handlePost}
        dealTitle={form.values.title}
        dealDetails={form.values.details}
        imageUris={form.values.imageUris}
        originalImageUris={originalImageUris}
        expirationDate={form.values.expirationDate}
        selectedRestaurant={form.values.restaurant ? {
          id: form.values.restaurant.id,
          name: form.values.restaurant.name,
          subtext: form.values.restaurant.address,
          lat: form.values.restaurant.lat,
          lng: form.values.restaurant.lng,
        } : null}
        selectedCategory={getSelectedCategoryName()}
        selectedCuisine={getSelectedCuisineName()}
        userData={userData}
        isPosting={isPosting}
      />

      <PhotoReviewModal
        visible={isPhotoReviewVisible}
        photos={form.values.imageUris}
        originalPhotos={originalImageUris}
        initialCropRegions={cropRegions}
        thumbnailIndex={form.values.thumbnailIndex}
        onClose={() => setIsPhotoReviewVisible(false)}
        onDone={(photos, thumbIdx, originals) => {
          setIsPhotoReviewVisible(false);
          form.setFields({ imageUris: photos, thumbnailIndex: thumbIdx });
          setOriginalImageUris(originals);
        }}
        onAddMore={() => {
          setIsPhotoReviewVisible(false);
          setIsCameraModalVisible(true);
        }}
      />

      <InstagramPhotoPickerModal
        visible={isInstagramPickerVisible}
        onClose={() => setIsInstagramPickerVisible(false)}
        onDone={handleInstagramPickerDone}
        maxPhotos={IMAGES_MAX_COUNT}
        existingPhotosCount={form.values.imageUris.length}
      />
    </Modal>
  );
}