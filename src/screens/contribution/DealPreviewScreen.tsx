/**
 * @file DealPreviewScreen — Read-only deal preview before posting
 *
 * Purely presentational; receives form data via props and renders a
 * preview that mirrors DealDetailScreen.  Migrated to ALF primitives
 * (Box / Text) and design tokens — no raw StyleSheet or inline literals.
 */

import { Ionicons } from '@expo/vector-icons';
import { Monicon } from '@monicon/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowBigUp, ArrowBigDown } from 'lucide-react-native';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Easing,
} from 'react-native';

import { getCurrentUserLocation, calculateDistance } from '../../services/locationService';
import {
  BRAND,
  GRAY,
  STATIC,
  ALPHA_COLORS,
  SPACING,
  RADIUS,
  OPACITY,
  BORDER_WIDTH,
  FONT_SIZE,
} from '../../ui/alf';
import { Box, Text } from '../../ui/primitives';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Base design width (iPhone 15 = 393pt) — matches VoteButtons component
const BASE_WIDTH = 393;
const scale = (size: number) => (screenWidth / BASE_WIDTH) * size;

// Dynamic sizes for vote buttons — matches VoteButtons component exactly
const PILL_WIDTH = scale(85);
const PILL_HEIGHT = scale(28);
const ARROW_SIZE = Math.round(scale(18));

interface Restaurant {
  id: string;
  name: string;
  subtext: string;
  lat?: number;
  lng?: number;
}

interface User {
  username: string;
  profilePicture: string | null;
  city: string;
  state: string;
}

interface DealPreviewScreenProps {
  visible: boolean;
  onClose: () => void;
  onPost: () => Promise<void> | void;
  dealTitle: string;
  dealDetails: string;
  imageUris: string[];
  /** Optional originals (uncropped) so fullscreen preview can show the full photo. */
  originalImageUris?: string[];
  expirationDate: string | null;
  selectedRestaurant: Restaurant | null;
  selectedCategory: string;
  selectedCuisine: string;
  userData: User;
  isPosting?: boolean;
}

const DealPreviewScreen: React.FC<DealPreviewScreenProps> = ({
  visible,
  onClose,
  onPost,
  dealTitle,
  dealDetails,
  imageUris,
  originalImageUris,
  expirationDate,
  selectedRestaurant,
  selectedCategory,
  selectedCuisine,
  userData,
  isPosting = false,
}) => {
  const [distance, setDistance] = useState<string>('?mi away');
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [isImageViewVisible, setImageViewVisible] = useState(false);
  const [modalImageLoading, setModalImageLoading] = useState(false);
  const [modalImageError, setModalImageError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageViewerKey, setImageViewerKey] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isSubmitPressed, setIsSubmitPressed] = useState(false);
  const carouselRef = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setIsSubmitPressed(false);
    }
  }, [visible]);

  // ── Slide-in animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && !isAnimatingOut) {
      slideAnim.setValue(screenWidth);
      fadeAnim.setValue(0);

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // ── Animated close ────────────────────────────────────────────────────────
  const handleAnimatedClose = useCallback(() => {
    if (isPosting || isAnimatingOut) return;

    setImageViewVisible(false);
    setIsAnimatingOut(true);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenWidth,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsAnimatingOut(false);
      onClose();
    });
  }, [isPosting, isAnimatingOut, onClose, slideAnim, fadeAnim]);

  useEffect(() => {
    if (!visible || isPosting || isAnimatingOut) {
      setImageViewVisible(false);
    }
  }, [visible, isPosting, isAnimatingOut]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const removeZipCode = (address: string) =>
    address.replace(/,?\s*\d{5}(-\d{4})?$/, '').trim();

  // ── Distance calculation ──────────────────────────────────────────────────
  useEffect(() => {
    const calculateRestaurantDistance = async () => {
      if (!selectedRestaurant?.lat || !selectedRestaurant?.lng) {
        setDistance('?mi away');
        return;
      }

      setIsCalculatingDistance(true);

      try {
        const userLocation = await getCurrentUserLocation();

        if (userLocation) {
          const distanceMiles = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            selectedRestaurant.lat,
            selectedRestaurant.lng,
          );

          const formattedDistance =
            distanceMiles < 1
              ? '<1mi away'
              : `${Math.round(distanceMiles)}mi away`;

          setDistance(formattedDistance);
        } else {
          setDistance('?mi away');
        }
      } catch (error) {
        console.error('Error calculating distance:', error);
        setDistance('?mi away');
      } finally {
        setIsCalculatingDistance(false);
      }
    };

    if (visible && selectedRestaurant) {
      calculateRestaurantDistance();
    }
  }, [visible, selectedRestaurant]);

  const formatDate = (dateString: string | null) => {
    if (!dateString || dateString === 'Unknown') return 'Not Known';
    const date = new Date(dateString);
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString(
      'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' },
    );
  };

  const scrollViewRef = useRef<ScrollView>(null);

  const openImageViewer = () => {
    if (isPosting || isAnimatingOut || isSubmitPressed) {
      return;
    }
    setModalImageLoading(true);
    setModalImageError(false);
    setImageViewVisible(true);
    setImageViewerKey((prev) => prev + 1);
  };

  const handlePostPress = () => {
    if (isPosting || isAnimatingOut || isSubmitPressed) {
      return;
    }

    setIsSubmitPressed(true);
    setImageViewVisible(false);

    Promise.resolve(onPost()).finally(() => {
      setIsSubmitPressed(false);
    });
  };

  const handleImageLoad = (event: any) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions({ width, height });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleAnimatedClose}
    >
      {/* Fade background overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(0, 0, 0, 0.15)', opacity: fadeAnim },
        ]}
      />

      <Animated.View
        style={{
          flex: 1,
          backgroundColor: STATIC.white,
          transform: [{ translateX: slideAnim }],
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: STATIC.white }}>
          <StatusBar style="dark" />

          {/* Back Button and Share Button Row */}
          <Box row justify="space-between" align="center" mb="sm" px="md">
            <TouchableOpacity
              style={{
                width: 40,
                height: 40,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: RADIUS.circle,
              }}
              onPress={handleAnimatedClose}
              disabled={isPosting || isAnimatingOut}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={isPosting || isAnimatingOut ? GRAY[350] : STATIC.black}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.lg,
                backgroundColor: ALPHA_COLORS.brandPrimary80,
                borderRadius: RADIUS.pill,
                minWidth: 90,
                opacity: isPosting || isSubmitPressed ? OPACITY.disabled + 0.1 : OPACITY.full,
              }}
              onPress={handlePostPress}
              disabled={isPosting || isSubmitPressed}
            >
              {isPosting || isSubmitPressed ? (
                <ActivityIndicator size="small" color={STATIC.black} />
              ) : (
                <Text
                  size="xs"
                  color={STATIC.black}
                  style={{ fontFamily: 'Inter', fontWeight: '400' }}
                >
                  Share
                </Text>
              )}
            </TouchableOpacity>
          </Box>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: SPACING['2xl'],
              paddingTop: SPACING.lg,
            }}
          >
            <Box bg={STATIC.white} rounded={RADIUS.card} py="lg">
              {/* Restaurant Info */}
              <Box style={{ alignSelf: 'stretch', alignItems: 'flex-start', justifyContent: 'space-around' }}>
                <Text
                  size="lg"
                  weight="bold"
                  color={STATIC.black}
                  style={{ fontFamily: 'Inter', lineHeight: 20, marginBottom: SPACING.sm }}
                >
                  {selectedRestaurant?.name}
                </Text>

                {/* Location row */}
                <Box row align="center" mb="xs">
                  <Text
                    size="xs"
                    style={{ fontFamily: 'Inter', lineHeight: 20 }}
                  >
                    📍 {isCalculatingDistance ? 'Calculating...' : distance}{' '}
                  </Text>
                  <Text
                    size="xs"
                    style={{ fontFamily: 'Inter', fontWeight: '300', color: STATIC.black }}
                  >
                    •
                  </Text>
                  <Text
                    size="xs"
                    numberOfLines={1}
                    style={{ fontFamily: 'Inter', lineHeight: 20 }}
                  >
                    {' '}{removeZipCode(selectedRestaurant?.subtext || '')}
                  </Text>
                </Box>

                {/* Valid until row */}
                <Box row align="center" mb="xs">
                  <Text
                    size="xs"
                    style={{ fontFamily: 'Inter', lineHeight: 20 }}
                  >
                    ⏳ Valid Until • {formatDate(expirationDate)}
                  </Text>
                </Box>

                {/* Category row */}
                {((selectedCuisine && selectedCuisine.trim() !== '' && selectedCuisine !== 'Cuisine') ||
                  (selectedCategory && selectedCategory.trim() !== '')) && (
                    <Box row align="center">
                      <Text size="xs" style={{ fontFamily: 'Inter', lineHeight: 20 }}>
                        {selectedCuisine &&
                          selectedCuisine.trim() !== '' &&
                          selectedCuisine !== 'Cuisine' && (
                            <Text
                              style={{
                                fontFamily: 'Inter',
                                fontSize: FONT_SIZE.xs,
                                fontWeight: '400',
                                color: STATIC.black,
                              }}
                            >
                              🍽 {selectedCuisine}
                            </Text>
                          )}
                        {selectedCuisine &&
                          selectedCuisine.trim() !== '' &&
                          selectedCuisine !== 'Cuisine' &&
                          selectedCategory &&
                          selectedCategory.trim() !== '' && (
                            <Text
                              style={{
                                fontFamily: 'Inter',
                                fontSize: FONT_SIZE.xs,
                                fontWeight: '300',
                                color: STATIC.black,
                              }}
                            >
                              {' '}•{' '}
                            </Text>
                          )}
                        {selectedCategory && selectedCategory.trim() !== '' && (
                          <Text
                            style={{
                              fontFamily: 'Inter',
                              fontSize: FONT_SIZE.xs,
                              fontWeight: '400',
                              color: STATIC.black,
                            }}
                          >
                            {' '}{selectedCategory}
                          </Text>
                        )}
                      </Text>
                    </Box>
                  )}
              </Box>

              {/* Separator */}
              <Box
                my="sm"
                style={{
                  alignSelf: 'stretch',
                  height: BORDER_WIDTH.hairline,
                  backgroundColor: GRAY[250],
                  width: '100%',
                }}
              />

              {/* Deal Title */}
              <Text
                size="lg"
                weight="bold"
                color={STATIC.black}
                style={{
                  alignSelf: 'stretch',
                  fontFamily: 'Inter',
                  letterSpacing: 0,
                  lineHeight: 20,
                  marginTop: SPACING.sm,
                  marginBottom: SPACING.lg,
                }}
              >
                {dealTitle}
              </Text>

              {/* Deal Images Carousel */}
              {imageUris.length > 0 && (
                <Box mb="lg">
                  <FlatList
                    ref={carouselRef}
                    data={imageUris}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    scrollEnabled={imageUris.length > 1}
                    decelerationRate="fast"
                    style={{ height: 350 }}
                    onScroll={(event) => {
                      const contentWidth = screenWidth - 48;
                      const index = Math.round(
                        event.nativeEvent.contentOffset.x / contentWidth,
                      );
                      if (
                        index !== currentImageIndex &&
                        index >= 0 &&
                        index < imageUris.length
                      ) {
                        setCurrentImageIndex(index);
                      }
                    }}
                    scrollEventThrottle={16}
                    keyExtractor={(item, index) => `preview-image-${index}`}
                    getItemLayout={(_, index) => ({
                      length: screenWidth - 48,
                      offset: (screenWidth - 48) * index,
                      index,
                    })}
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        onPress={() => {
                          setCurrentImageIndex(index);
                          openImageViewer();
                        }}
                        disabled={isPosting || isAnimatingOut || isSubmitPressed}
                        style={{ width: screenWidth - 48 }}
                      >
                        <Image
                          source={{ uri: item }}
                          style={{
                            width: screenWidth - 48,
                            height: 350,
                            backgroundColor: GRAY[200],
                            borderRadius: RADIUS.md,
                            alignSelf: 'center',
                          }}
                          resizeMode="cover"
                          onLoad={handleImageLoad}
                        />
                      </TouchableOpacity>
                    )}
                  />

                  {/* Pagination Dots */}
                  {imageUris.length > 1 && (
                    <Box row justify="center" align="center" mt={10} mb={5}>
                      {imageUris.map((_, index) => (
                        <Box
                          key={`dot-${index}`}
                          mx="xs"
                          rounded="full"
                          style={{
                            width: currentImageIndex === index ? 10 : 8,
                            height: currentImageIndex === index ? 10 : 8,
                            backgroundColor:
                              currentImageIndex === index
                                ? BRAND.accent
                                : GRAY[325],
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              )}

              {/* Interactions (Preview State — Non-interactive) */}
              <Box row justify="space-between" align="center" mb="sm">
                {/* Vote pill */}
                <Box
                  row
                  align="center"
                  bg={STATIC.white}
                  borderWidth={1}
                  borderColor={GRAY[325]}
                  rounded={RADIUS.pill}
                  h={PILL_HEIGHT}
                  w={PILL_WIDTH}
                  overflow="hidden"
                >
                  <Box
                    flex={1}
                    row
                    align="center"
                    justify="center"
                    h="100%"
                    pl={scale(8)}
                    pr={scale(2)}
                  >
                    <ArrowBigUp size={ARROW_SIZE} color={STATIC.black} fill="transparent" />
                    <Text
                      style={{
                        fontFamily: 'Inter',
                        fontSize: scale(10),
                        fontWeight: '400',
                        color: STATIC.black,
                        marginLeft: scale(4),
                      }}
                    >
                      0
                    </Text>
                  </Box>
                  <Box
                    w={1}
                    h={scale(12)}
                    bg={GRAY[250]}
                  />
                  <Box
                    center
                    h="100%"
                    px={scale(10)}
                  >
                    <ArrowBigDown size={ARROW_SIZE} color={STATIC.black} fill="transparent" />
                  </Box>
                </Box>

                {/* Right actions */}
                <Box row gap="xs">
                  <Box
                    center
                    bg={STATIC.white}
                    borderWidth={1}
                    borderColor={GRAY[325]}
                    rounded={RADIUS.pill}
                    w={40}
                    h={28}
                  >
                    <Monicon name="mdi:heart-outline" size={19} color={STATIC.black} />
                  </Box>
                  <Box
                    center
                    bg={STATIC.white}
                    borderWidth={1}
                    borderColor={GRAY[325]}
                    rounded={RADIUS.pill}
                    w={40}
                    h={28}
                  >
                    <Monicon name="mdi-light:share" size={24} color={STATIC.black} />
                  </Box>
                </Box>
              </Box>

              {/* Separator */}
              <Box
                my="sm"
                style={{
                  alignSelf: 'stretch',
                  height: BORDER_WIDTH.hairline,
                  backgroundColor: GRAY[250],
                  width: '100%',
                }}
              />

              {/* Deal Details */}
              {dealDetails ? (
                <Box style={{ alignSelf: 'stretch' }}>
                  <Text
                    size="lg"
                    weight="bold"
                    color={STATIC.black}
                    style={{ fontFamily: 'Inter', lineHeight: 20, marginBottom: 10 }}
                  >
                    Details
                  </Text>
                  <Text
                    size="xs"
                    color={STATIC.black}
                    style={{ fontFamily: 'Inter', lineHeight: 18, fontWeight: '400' }}
                  >
                    {dealDetails}
                  </Text>
                </Box>
              ) : null}

              {/* Shared By Section */}
              <Box row align="center" gap="sm" py="lg">
                {userData.profilePicture ? (
                  <Image
                    source={{ uri: userData.profilePicture }}
                    style={{ width: 58, height: 58, borderRadius: 29 }}
                  />
                ) : (
                  <Image
                    source={require('../../../img/Default_pfp.svg.png')}
                    style={{ width: 58, height: 58, borderRadius: 29 }}
                  />
                )}
                <Text
                  size="2xs"
                  color={STATIC.black}
                  style={{ fontFamily: 'Inter', letterSpacing: 0.2, lineHeight: 15 }}
                >
                  <Text style={{ letterSpacing: 0.2 }}>Shared By{'\n'}</Text>
                  <Text
                    style={{
                      fontFamily: 'Inter',
                      fontSize: FONT_SIZE.xs,
                      fontWeight: '700',
                      letterSpacing: 0.2,
                    }}
                  >
                    {userData.username}
                    {'\n'}
                  </Text>
                  <Text style={{ letterSpacing: 0.2 }}>
                    {userData.city}, {userData.state}
                  </Text>
                </Text>
              </Box>
            </Box>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>

      {/* Full-screen image viewer */}
      {imageUris.length > 0 && imageUris[currentImageIndex] && (
        <Modal
          visible={visible && isImageViewVisible && !isPosting && !isAnimatingOut && !isSubmitPressed}
          transparent={true}
          onRequestClose={() => setImageViewVisible(false)}
        >
          <Box flex={1} center bg="rgba(0, 0, 0, 0.9)">
            <TouchableOpacity
              style={{ position: 'absolute', top: 60, right: 20, zIndex: 1 }}
              onPress={() => setImageViewVisible(false)}
            >
              <Ionicons name="close" size={30} color={STATIC.white} />
            </TouchableOpacity>

            {modalImageLoading && (
              <ActivityIndicator
                size="large"
                color={STATIC.white}
                style={{ position: 'absolute' }}
              />
            )}

            <ScrollView
              key={imageViewerKey}
              ref={scrollViewRef}
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              maximumZoomScale={3}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
              bouncesZoom={true}
              centerContent={true}
            >
              <Image
                source={{
                  uri:
                    originalImageUris?.[currentImageIndex] ||
                    imageUris[currentImageIndex],
                }}
                style={{
                  width: screenWidth,
                  height: screenHeight,
                  resizeMode: 'contain',
                }}
                resizeMode="contain"
                onLoad={() => setModalImageLoading(false)}
                onError={() => {
                  setModalImageLoading(false);
                  setModalImageError(true);
                }}
              />
            </ScrollView>

            {modalImageError && (
              <Box position="absolute" center>
                <Text color={STATIC.white} size="md">
                  Could not load image
                </Text>
              </Box>
            )}

            {/* Image counter */}
            {imageUris.length > 1 && (
              <Box
                position="absolute"
                bottom={60}
                alignSelf="center"
                bg="rgba(0, 0, 0, 0.6)"
                px="lg"
                py="sm"
                rounded={RADIUS.circle}
              >
                <Text
                  color={STATIC.white}
                  size="sm"
                  weight="semibold"
                >
                  {currentImageIndex + 1} / {imageUris.length}
                </Text>
              </Box>
            )}
          </Box>
        </Modal>
      )}
    </Modal>
  );
};

export default DealPreviewScreen;
