import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    
    Modal,
    TouchableOpacity,
    Image,
    FlatList,
    Dimensions,
    SafeAreaView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';

import {
    getVisualIndex,
    getItemOffset,
    remapIndicesAfterReorder,
    remapIndicesAfterDelete,
    THUMBNAIL_SIZE,
    GAP,
    ITEM_WIDTH,
} from '../utils/dragHelpers';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const MAX_PHOTOS = 5;

// Crop area width with padding
const CROP_WIDTH = screenWidth;

// Crop frame dimensions - taller/more square aspect ratio
const CROP_FRAME_WIDTH = screenWidth - 48;
const CROP_FRAME_HEIGHT = 350;
const CROP_FRAME_ASPECT_RATIO = CROP_FRAME_WIDTH / CROP_FRAME_HEIGHT;

// Crop region in normalized coordinates (0-1) - matches InstagramPhotoPickerModal export
interface CropRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PhotoReviewModalProps {
    visible: boolean;
    photos: string[];
    originalPhotos?: string[]; // Original uncropped photos for re-cropping
    initialCropRegions?: CropRegion[]; // Initial focus regions from Instagram picker
    thumbnailIndex: number;
    onClose: () => void;
    onDone: (photos: string[], thumbnailIndex: number, originalPhotos: string[]) => void;
    onAddMore: () => void;
}

interface ImageDimensions {
    width: number;
    height: number;
}

interface CropState {
    scale: number;
    translateX: number;
    translateY: number;
}


const PhotoReviewModal: React.FC<PhotoReviewModalProps> = ({
    visible,
    photos,
    originalPhotos: propOriginalPhotos,
    initialCropRegions,
    thumbnailIndex,
    onClose,
    onDone,
    onAddMore,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [localPhotos, setLocalPhotos] = useState<string[]>(photos);
    const [localOriginalPhotos, setLocalOriginalPhotos] = useState<string[]>(propOriginalPhotos || photos);
    const flatListRef = useRef<FlatList>(null);

    // Per-image crop states (saved when switching images)
    const [cropStates, setCropStates] = useState<Map<number, CropState>>(new Map());
    const [imageDimensions, setImageDimensions] = useState<Map<number, ImageDimensions>>(new Map());
    const [displaySizes, setDisplaySizes] = useState<Map<number, { width: number; height: number }>>(new Map());
    const [isProcessing, setIsProcessing] = useState(false);
    const [cropAreaHeight, setCropAreaHeight] = useState(screenHeight * 0.6); // Default fallback
    const [cropAreaWidth, setCropAreaWidth] = useState(screenWidth); // Actual crop area width
    
    // Track if any changes have been made
    const [hasChanges, setHasChanges] = useState(false);
    const initialPhotosRef = useRef<string[]>([]);

    const applyCropStateToShared = useCallback((state?: CropState | null) => {
        const nextScale = state?.scale ?? 1;
        const nextTranslateX = state?.translateX ?? 0;
        const nextTranslateY = state?.translateY ?? 0;

        scale.value = nextScale;
        savedScale.value = nextScale;
        translateX.value = nextTranslateX;
        translateY.value = nextTranslateY;
        savedTranslateX.value = nextTranslateX;
        savedTranslateY.value = nextTranslateY;
    }, []);

    // Calculate crop frame size to maintain aspect ratio within the crop area
    const getCropFrameDimensions = () => {
        // The crop frame should fit inside cropAreaWidth x cropAreaHeight while maintaining CROP_FRAME_ASPECT_RATIO
        const containerAspect = cropAreaWidth / cropAreaHeight;
        let frameWidth: number;
        let frameHeight: number;

        if (CROP_FRAME_ASPECT_RATIO > containerAspect) {
            // Frame is wider than container aspect - fit by width
            frameWidth = cropAreaWidth - 48; // Keep consistent padding
            frameHeight = frameWidth / CROP_FRAME_ASPECT_RATIO;
        } else {
            // Frame is taller than container aspect - fit by height with some margin
            frameHeight = cropAreaHeight * 0.7;
            frameWidth = frameHeight * CROP_FRAME_ASPECT_RATIO;
        }

        return { width: frameWidth, height: frameHeight };
    };

    const cropFrameDimensions = getCropFrameDimensions();

    // Shared values for gestures (current image)
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Shared values for boundary calculations (using crop frame dimensions)
    const displayWidth = useSharedValue(CROP_WIDTH);
    const displayHeight = useSharedValue(screenHeight * 0.6);
    // cropWidth and cropHeight now represent the crop FRAME (not full area)
    const cropWidth = useSharedValue(CROP_FRAME_WIDTH);
    const cropHeight = useSharedValue(CROP_FRAME_HEIGHT);

    // Update crop frame shared values when dimensions change
    React.useEffect(() => {
        if (cropAreaHeight > 0 && cropAreaWidth > 0) {
            const frameDims = getCropFrameDimensions();
            cropWidth.value = frameDims.width;
            cropHeight.value = frameDims.height;
        }
    }, [cropAreaHeight, cropAreaWidth]);

    // Draggable thumbnail state
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [targetIndex, setTargetIndex] = useState<number | null>(null);
    const dragX = useSharedValue(0);
    const dragY = useSharedValue(0);
    const dragScale = useSharedValue(1);
    const activeIndex = useSharedValue(-1);
    const currentTarget = useSharedValue(-1);

    // Track if modal was previously visible to detect fresh opens vs photo additions
    const wasVisible = useRef(false);
    const prevPhotosLength = useRef(photos.length);

    // Sync with props when modal opens or photos change
    React.useEffect(() => {
        if (visible) {
            const isFirstOpen = !wasVisible.current;
            const photosWereAdded = photos.length > prevPhotosLength.current;
            
            // Always update local photos to reflect prop changes
            setLocalPhotos(photos);
            setLocalOriginalPhotos(propOriginalPhotos || photos);
            
            if (isFirstOpen) {
                // Fresh modal open - preserve existing crop state for already-added photos
                setCurrentIndex(0);
                setHasChanges(false);
                initialPhotosRef.current = [...photos]; // Store initial photos for comparison
                applyCropStateToShared(cropStates.get(0));
                // Reset display size shared values to safe defaults
                displayWidth.value = screenWidth;
                displayHeight.value = screenHeight * 0.6;
            } else if (photosWereAdded) {
                // Photos were added - preserve existing crop states, navigate to new photo
                const newPhotoIndex = photos.length - 1;
                saveCropState(); // Save current before switching
                setCurrentIndex(newPhotoIndex);
                // Reset crop values for the new image
                applyCropStateToShared(null);
            }
            
            wasVisible.current = true;
            prevPhotosLength.current = photos.length;
            setIsProcessing(false);
        } else {
            wasVisible.current = false;
            prevPhotosLength.current = photos.length;
            setIsProcessing(false);
        }
    }, [visible, photos, propOriginalPhotos]);

    // Fully reset cached crop/layout state only when the parent has no photos left.
    useEffect(() => {
        if (!visible && photos.length === 0) {
            setCropStates(new Map());
            setImageDimensions(new Map());
            setDisplaySizes(new Map());
            setHasChanges(false);
            initialPhotosRef.current = [];
            applyCropStateToShared(null);
        }
    }, [visible, photos.length, applyCropStateToShared]);

    // Load image dimensions for current image and initialize crop state from initialCropRegions if available
    useEffect(() => {
        if (visible && localOriginalPhotos[currentIndex] && cropAreaHeight > 0 && cropAreaWidth > 0) {
            const imageUri = localOriginalPhotos[currentIndex];

            if (!imageDimensions.has(currentIndex)) {
                Image.getSize(
                    imageUri,
                    (width, height) => {
                        setImageDimensions(prev => new Map(prev).set(currentIndex, { width, height }));

                        const imageAspect = width / height;
                        // Use crop frame dimensions for sizing (not full area)
                        const frameDims = getCropFrameDimensions();
                        const frameAspect = frameDims.width / frameDims.height;
                        let calcDisplayWidth: number;
                        let calcDisplayHeight: number;

                        // Image should always COVER the crop frame (fill it completely)
                        if (imageAspect > frameAspect) {
                            // Image is wider - fit by height, extend width
                            calcDisplayHeight = frameDims.height;
                            calcDisplayWidth = calcDisplayHeight * imageAspect;
                        } else {
                            // Image is taller - fit by width, extend height
                            calcDisplayWidth = frameDims.width;
                            calcDisplayHeight = calcDisplayWidth / imageAspect;
                        }

                        setDisplaySizes(prev => new Map(prev).set(currentIndex, { width: calcDisplayWidth, height: calcDisplayHeight }));
                        // Update shared values for worklet access
                        displayWidth.value = calcDisplayWidth;
                        displayHeight.value = calcDisplayHeight;
                        
                        const existingState = cropStates.get(currentIndex);
                        if (existingState) {
                            applyCropStateToShared(existingState);
                        } else if (initialCropRegions && initialCropRegions[currentIndex]) {
                            // Initialize crop state from initialCropRegions if available and no existing state
                            const initialState = cropRegionToInitialState(
                                initialCropRegions[currentIndex],
                                width,
                                height
                            );
                            setCropStates(prev => new Map(prev).set(currentIndex, initialState));
                            applyCropStateToShared(initialState);
                        } else {
                            applyCropStateToShared(null);
                        }
                    },
                    (error) => {
                        console.error('Error getting image size:', error);
                    }
                );
            } else {
                // Image already loaded, just update shared values
                const existing = displaySizes.get(currentIndex);
                if (existing) {
                    displayWidth.value = existing.width;
                    displayHeight.value = existing.height;
                }
                
                const existingState = cropStates.get(currentIndex);
                if (existingState) {
                    applyCropStateToShared(existingState);
                } else if (initialCropRegions && initialCropRegions[currentIndex]) {
                    // Initialize from picker crop regions when no saved state exists
                    const dims = imageDimensions.get(currentIndex);
                    if (dims) {
                        const initialState = cropRegionToInitialState(
                            initialCropRegions[currentIndex],
                            dims.width,
                            dims.height
                        );
                        setCropStates(prev => new Map(prev).set(currentIndex, initialState));
                        applyCropStateToShared(initialState);
                    }
                } else {
                    applyCropStateToShared(null);
                }
            }
        }
    }, [
        visible,
        currentIndex,
        localOriginalPhotos,
        cropAreaHeight,
        cropAreaWidth,
        initialCropRegions,
        cropStates,
        imageDimensions,
        displaySizes,
        applyCropStateToShared,
    ]);

    // Save crop state when switching images
    const saveCropState = () => {
        const currentState = {
            scale: savedScale.value,
            translateX: savedTranslateX.value,
            translateY: savedTranslateY.value,
        };
        
        // Check if the crop state has been modified from default
        const isModified = currentState.scale !== 1 || 
                          currentState.translateX !== 0 || 
                          currentState.translateY !== 0;
        
        if (isModified) {
            setHasChanges(true);
        }
        
        setCropStates(prev => {
            const newMap = new Map(prev);
            newMap.set(currentIndex, currentState);
            return newMap;
        });
    };

    // Convert a crop region to initial crop state for this modal
    // The crop region is in normalized coordinates (0-1) relative to the original image
    const cropRegionToInitialState = (
        cropRegion: CropRegion,
        imageWidth: number,
        imageHeight: number
    ): CropState => {
        // Get crop frame dimensions
        const frameDims = getCropFrameDimensions();
        const imageAspect = imageWidth / imageHeight;
        const frameAspect = frameDims.width / frameDims.height;
        
        // Calculate display dimensions (same logic as in the dimension loading effect)
        let calcDisplayWidth: number;
        let calcDisplayHeight: number;
        
        if (imageAspect > frameAspect) {
            calcDisplayHeight = frameDims.height;
            calcDisplayWidth = calcDisplayHeight * imageAspect;
        } else {
            calcDisplayWidth = frameDims.width;
            calcDisplayHeight = calcDisplayWidth / imageAspect;
        }
        
        // Calculate the center of the selected crop region (in normalized 0-1 coords)
        const centerY = cropRegion.y + cropRegion.height / 2;
        const centerX = cropRegion.x + cropRegion.width / 2;
        
        // Convert to translate values
        // At translateY=0, the center of the image (0.5) is shown
        // To show a different centerY, we translate by (0.5 - centerY) * displayHeight
        const translateY = (0.5 - centerY) * calcDisplayHeight;
        const translateX = (0.5 - centerX) * calcDisplayWidth;
        
        // Clamp to valid bounds (max pan is half the overflow)
        const maxTranslateY = Math.max(0, (calcDisplayHeight - frameDims.height) / 2);
        const maxTranslateX = Math.max(0, (calcDisplayWidth - frameDims.width) / 2);
        
        return {
            scale: 1,
            translateX: Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX)),
            translateY: Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY)),
        };
    };

    // Restore crop state when switching to an image
    const restoreCropState = (index: number) => {
        const state = cropStates.get(index);
        if (state) {
            scale.value = state.scale;
            savedScale.value = state.scale;
            translateX.value = state.translateX;
            translateY.value = state.translateY;
            savedTranslateX.value = state.translateX;
            savedTranslateY.value = state.translateY;
        } else {
            scale.value = 1;
            savedScale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        }
    };

    const handleDeletePhoto = (index: number) => {
        // If this is the last photo, ask to confirm then clear photos and close
        if (localPhotos.length <= 1) {
            Alert.alert(
                'Delete Photo',
                'Are you sure you want to remove this photo?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => onDone([], 0, []), // Clear all photos in parent
                    },
                ]
            );
            return;
        }

        Alert.alert(
            'Delete Photo',
            'Are you sure you want to remove this photo?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const newPhotos = localPhotos.filter((_, i) => i !== index);
                        const newOriginals = localOriginalPhotos.filter((_, i) => i !== index);
                        setLocalPhotos(newPhotos);
                        setLocalOriginalPhotos(newOriginals);
                        setHasChanges(true); // Mark as changed when photo is deleted

                        // Update all index-keyed maps
                        setCropStates(prev => remapIndicesAfterDelete(prev, index));
                        setImageDimensions(prev => remapIndicesAfterDelete(prev, index));
                        setDisplaySizes(prev => remapIndicesAfterDelete(prev, index));

                        // Adjust current index and restore crop state
                        if (currentIndex >= newPhotos.length) {
                            // Deleted last photo in array, move to new last photo
                            const newIdx = Math.max(0, newPhotos.length - 1);
                            setCurrentIndex(newIdx);
                            restoreCropState(newIdx);
                        } else if (currentIndex > index) {
                            // Deleted a photo before current one, shift index down
                            const newIdx = currentIndex - 1;
                            setCurrentIndex(newIdx);
                            restoreCropState(newIdx);
                        } else if (currentIndex === index) {
                            // Deleted the currently viewed photo - the next photo slides into
                            // this index position, so restore its crop state (index stays same)
                            restoreCropState(currentIndex);
                        }
                    },
                },
            ]
        );
    };

    const handleThumbnailPress = (index: number) => {
        if (index !== currentIndex) {
            saveCropState();
            setCurrentIndex(index);
            restoreCropState(index);
        }
    };

    // Mark changes when user interacts with crop (called from gestures via runOnJS)
    const markCropChanged = useCallback(() => {
        setHasChanges(true);
    }, []);

    // Reorder photos (drag and drop)
    const handleReorder = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;

        const newPhotos = [...localPhotos];
        const newOriginals = [...localOriginalPhotos];
        const [movedPhoto] = newPhotos.splice(fromIndex, 1);
        const [movedOriginal] = newOriginals.splice(fromIndex, 1);
        newPhotos.splice(toIndex, 0, movedPhoto);
        newOriginals.splice(toIndex, 0, movedOriginal);

        setLocalPhotos(newPhotos);
        setLocalOriginalPhotos(newOriginals);
        setHasChanges(true); // Mark as changed when photos are reordered

        // Update all index-keyed maps with new indices
        setCropStates(prev => remapIndicesAfterReorder(prev, fromIndex, toIndex));
        setImageDimensions(prev => remapIndicesAfterReorder(prev, fromIndex, toIndex));
        setDisplaySizes(prev => remapIndicesAfterReorder(prev, fromIndex, toIndex));

        // Update current index if needed
        let newCurrentIndex = currentIndex;
        if (currentIndex === fromIndex) {
            newCurrentIndex = toIndex;
        } else if (fromIndex < toIndex && currentIndex > fromIndex && currentIndex <= toIndex) {
            newCurrentIndex = currentIndex - 1;
        } else if (fromIndex > toIndex && currentIndex >= toIndex && currentIndex < fromIndex) {
            newCurrentIndex = currentIndex + 1;
        }
        setCurrentIndex(newCurrentIndex);
    };

    // Crop the current image based on its transform state
    const cropImageWithState = async (index: number, state: CropState): Promise<string> => {
        const dimensions = imageDimensions.get(index);
        const displaySize = displaySizes.get(index);

        if (!dimensions || !displaySize) {
            console.log('Missing dimensions or displaySize for index', index);
            return localPhotos[index];
        }

        const currentScale = state.scale;
        const currentTranslateX = state.translateX;
        const currentTranslateY = state.translateY;

        // Calculate scale factors from display to original image
        const scaleToOriginalX = dimensions.width / displaySize.width;
        const scaleToOriginalY = dimensions.height / displaySize.height;

        // Calculate what part of the image is visible in the crop frame
        // The crop frame is centered, and translate moves the image
        const visibleCenterX = -currentTranslateX / currentScale;
        const visibleCenterY = -currentTranslateY / currentScale;

        // Get the crop frame dimensions (not full area)
        const frameDims = getCropFrameDimensions();

        // Size of the crop frame in display coordinates (accounting for zoom)
        const cropFrameWidthInDisplay = frameDims.width / currentScale;
        const cropFrameHeightInDisplay = frameDims.height / currentScale;

        // Convert crop frame size to original image coordinates
        let cropWidth = cropFrameWidthInDisplay * scaleToOriginalX;
        let cropHeight = cropFrameHeightInDisplay * scaleToOriginalY;

        // Ensure crop dimensions don't exceed image dimensions
        cropWidth = Math.min(cropWidth, dimensions.width);
        cropHeight = Math.min(cropHeight, dimensions.height);

        const centerX = dimensions.width / 2;
        const centerY = dimensions.height / 2;

        // Calculate origin (top-left of crop area in original image)
        let originX = centerX + (visibleCenterX * scaleToOriginalX) - (cropWidth / 2);
        let originY = centerY + (visibleCenterY * scaleToOriginalY) - (cropHeight / 2);

        // Clamp origin to valid range (ensure crop stays within image bounds)
        originX = Math.max(0, Math.min(originX, dimensions.width - cropWidth));
        originY = Math.max(0, Math.min(originY, dimensions.height - cropHeight));

        // Final safety check - ensure dimensions are positive and within bounds
        const finalOriginX = Math.round(Math.max(0, originX));
        const finalOriginY = Math.round(Math.max(0, originY));
        const finalWidth = Math.round(Math.max(1, Math.min(cropWidth, dimensions.width - finalOriginX)));
        const finalHeight = Math.round(Math.max(1, Math.min(cropHeight, dimensions.height - finalOriginY)));

        // Validate crop rectangle is within image bounds
        if (finalOriginX < 0 || finalOriginY < 0 ||
            finalOriginX + finalWidth > dimensions.width ||
            finalOriginY + finalHeight > dimensions.height ||
            finalWidth <= 0 || finalHeight <= 0) {
            console.log('Invalid crop bounds, returning original photo');
            return localPhotos[index];
        }

        try {
            console.log(`Cropping image ${index}: origin(${finalOriginX}, ${finalOriginY}) size(${finalWidth}x${finalHeight})`);
            const result = await manipulateAsync(
                localOriginalPhotos[index],
                [
                    {
                        crop: {
                            originX: finalOriginX,
                            originY: finalOriginY,
                            width: finalWidth,
                            height: finalHeight,
                        },
                    },
                    // Also resize to max 1080px width to speed up upload
                    ...(finalWidth > 1080 ? [{ resize: { width: 1080 } }] : []),
                ],
                { compress: 0.8, format: SaveFormat.JPEG }
            );
            return result.uri;
        } catch (error) {
            console.error('Error cropping image:', error);
            return localPhotos[index];
        }
    };

    const cropImageWithTimeout = async (index: number, state: CropState, timeoutMs = 12000): Promise<string> => {
        try {
            return await Promise.race<string>([
                cropImageWithState(index, state),
                new Promise<string>((resolve) => {
                    setTimeout(() => {
                        console.warn(`Crop timed out for image ${index}; using existing image`);
                        resolve(localPhotos[index]);
                    }, timeoutMs);
                }),
            ]);
        } catch (error) {
            console.error('Crop with timeout failed:', error);
            return localPhotos[index];
        }
    };

    const handleDone = async () => {
        if (isProcessing) {
            return;
        }

        // Get current image's crop state directly from shared values (not async state)
        const currentState: CropState = {
            scale: scale.value,
            translateX: translateX.value,
            translateY: translateY.value,
        };

        // Create a combined map with all saved states plus current
        const allCropStates = new Map(cropStates);
        allCropStates.set(currentIndex, currentState);
        // Persist latest transform so reopening the modal restores the same crop frame.
        setCropStates(new Map(allCropStates));

        // Check which images can be cropped (have dimensions loaded)
        // Note: ALL images should be cropped to the frame, not just "modified" ones.
        // Since images are sized to COVER the crop frame, even unmodified images
        // extend beyond the frame and need to be cropped to match the preview.
        const canCrop = Array.from({ length: localPhotos.length }, (_, i) =>
            imageDimensions.has(i) && displaySizes.has(i)
        );

        const anyCroppingPossible = canCrop.some(Boolean);

        if (!anyCroppingPossible) {
            // No dimensions loaded yet, return original photos
            onDone(localPhotos, 0, localOriginalPhotos);
            return;
        }

        setIsProcessing(true);
        try {
            // Crop all images that have dimensions loaded to match the crop frame preview
            const croppedPhotos = await Promise.all(
                localPhotos.map(async (photo, index) => {
                    if (canCrop[index]) {
                        // Use saved crop state if available, otherwise use default (centered)
                        const state = allCropStates.get(index) || {
                            scale: 1,
                            translateX: 0,
                            translateY: 0,
                        };
                        return await cropImageWithTimeout(index, state);
                    }
                    return photo;
                })
            );
            // First image is always the cover (thumbnailIndex = 0)
            onDone(croppedPhotos, 0, localOriginalPhotos);
        } catch (error) {
            console.error('Error processing images:', error);
            onDone(localPhotos, 0, localOriginalPhotos);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddMorePhotos = () => {
        if (localPhotos.length >= MAX_PHOTOS) {
            Alert.alert('Limit Reached', `You can only add up to ${MAX_PHOTOS} photos.`);
            return;
        }
        saveCropState();
        onAddMore();
    };

    // Helper function to calculate max translation bounds
    const getMaxTranslation = (currentScale: number, imgWidth: number, imgHeight: number, cropW: number, cropH: number) => {
        'worklet';
        // The scaled image size
        const scaledWidth = imgWidth * currentScale;
        const scaledHeight = imgHeight * currentScale;

        // Maximum translation is half the difference between scaled image and crop area
        // (because translate is from center)
        const maxX = Math.max(0, (scaledWidth - cropW) / 2);
        const maxY = Math.max(0, (scaledHeight - cropH) / 2);

        return { maxX, maxY };
    };

    // Helper to apply rubber band resistance
    const rubberBand = (offset: number, max: number, resistance: number = 0.3) => {
        'worklet';
        if (offset > max) {
            return max + (offset - max) * resistance;
        } else if (offset < -max) {
            return -max + (offset + max) * resistance;
        }
        return offset;
    };

    // Helper to clamp value to bounds
    const clamp = (value: number, min: number, max: number) => {
        'worklet';
        return Math.min(Math.max(value, min), max);
    };

    // Pinch gesture for zoom
    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            'worklet';
            const newScale = Math.min(4, Math.max(1, savedScale.value * event.scale));
            scale.value = newScale;

            // Adjust translation to stay within bounds during zoom
            const { maxX, maxY } = getMaxTranslation(
                newScale,
                displayWidth.value,
                displayHeight.value,
                cropWidth.value,
                cropHeight.value
            );

            // Apply soft bounds during pinch
            translateX.value = rubberBand(savedTranslateX.value, maxX, 0.5);
            translateY.value = rubberBand(savedTranslateY.value, maxY, 0.5);
        })
        .onEnd(() => {
            'worklet';
            savedScale.value = scale.value;

            // Snap to bounds after pinch ends
            const { maxX, maxY } = getMaxTranslation(
                scale.value,
                displayWidth.value,
                displayHeight.value,
                cropWidth.value,
                cropHeight.value
            );

            const clampedX = clamp(translateX.value, -maxX, maxX);
            const clampedY = clamp(translateY.value, -maxY, maxY);

            translateX.value = withSpring(clampedX, { damping: 20, stiffness: 300 });
            translateY.value = withSpring(clampedY, { damping: 20, stiffness: 300 });
            savedTranslateX.value = clampedX;
            savedTranslateY.value = clampedY;
            
            // Mark as changed if zoom level is not default
            if (scale.value !== 1) {
                runOnJS(markCropChanged)();
            }
        });

    // Pan gesture for moving
    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            'worklet';
            const { maxX, maxY } = getMaxTranslation(
                scale.value,
                displayWidth.value,
                displayHeight.value,
                cropWidth.value,
                cropHeight.value
            );

            const rawX = savedTranslateX.value + event.translationX;
            const rawY = savedTranslateY.value + event.translationY;

            // Apply rubber band effect at boundaries
            translateX.value = rubberBand(rawX, maxX);
            translateY.value = rubberBand(rawY, maxY);
        })
        .onEnd(() => {
            'worklet';
            const { maxX, maxY } = getMaxTranslation(
                scale.value,
                displayWidth.value,
                displayHeight.value,
                cropWidth.value,
                cropHeight.value
            );

            // Snap back to valid bounds
            const clampedX = clamp(translateX.value, -maxX, maxX);
            const clampedY = clamp(translateY.value, -maxY, maxY);

            translateX.value = withSpring(clampedX, { damping: 20, stiffness: 300 });
            translateY.value = withSpring(clampedY, { damping: 20, stiffness: 300 });
            savedTranslateX.value = clampedX;
            savedTranslateY.value = clampedY;
            
            // Mark as changed if position has been adjusted
            if (clampedX !== 0 || clampedY !== 0) {
                runOnJS(markCropChanged)();
            }
        });

    const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

    const animatedImageStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value },
            ],
        };
    });

    // Draggable thumbnail handlers
    const startDragging = React.useCallback((index: number) => {
        setDraggingIndex(index);
        setTargetIndex(index);
    }, []);

    const updateTargetIdx = React.useCallback((newTarget: number) => {
        setTargetIndex(newTarget);
    }, []);

    const endDragging = React.useCallback((fromIndex: number, toIndex: number) => {
        setDraggingIndex(null);
        setTargetIndex(null);
        if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            handleReorder(fromIndex, toIndex);
        }
    }, [handleReorder]);

    const cancelDragging = React.useCallback(() => {
        setDraggingIndex(null);
        setTargetIndex(null);
    }, []);

    const imageCount = localPhotos.length;

    const createThumbnailGesture = React.useCallback((index: number) => {
        return Gesture.Pan()
            .activateAfterLongPress(200)
            .onStart(() => {
                'worklet';
                activeIndex.value = index;
                currentTarget.value = index;
                dragScale.value = withSpring(1.15);
                runOnJS(startDragging)(index);
            })
            .onUpdate((event) => {
                'worklet';
                // Follow finger exactly - no damping
                dragX.value = event.translationX;
                dragY.value = event.translationY;

                // Check if thumbnail is close enough vertically to the strip (within 100px)
                const verticalDistance = Math.abs(event.translationY);
                const maxVerticalDistanceForDrop = 100;

                // Only calculate target if within vertical drop zone
                if (verticalDistance > maxVerticalDistanceForDrop) {
                    // Too far vertically - reset target to original position (no shuffle animation)
                    if (currentTarget.value !== index) {
                        currentTarget.value = index;
                        runOnJS(updateTargetIdx)(index);
                    }
                    return;
                }

                // Calculate target position - need to move at least 50% of item width to change position
                const threshold = ITEM_WIDTH * 0.5;
                const rawOffset = Math.round(event.translationX / ITEM_WIDTH);

                // Only update target if moved clearly past threshold
                const distanceMoved = Math.abs(event.translationX);
                const minDistance = threshold; // Must move at least half an item width

                let newTarget = index;
                if (distanceMoved >= minDistance) {
                    const maxIndex = imageCount - 1;
                    newTarget = Math.max(0, Math.min(maxIndex, index + rawOffset));
                }

                if (newTarget !== currentTarget.value) {
                    currentTarget.value = newTarget;
                    runOnJS(updateTargetIdx)(newTarget);
                }
            })
            .onEnd((event) => {
                'worklet';
                const fromIdx = activeIndex.value;

                // Check if the movement was intentional (moved far enough horizontally)
                const distanceMoved = Math.abs(event.translationX);
                const minDistanceForReorder = ITEM_WIDTH * 0.5;

                // Check if thumbnail is close enough vertically to the strip (within 100px)
                const verticalDistance = Math.abs(event.translationY);
                const maxVerticalDistanceForDrop = 100;

                let finalTarget = fromIdx; // Default: snap back to original
                // Only reorder if moved enough horizontally AND not too far vertically
                if (distanceMoved >= minDistanceForReorder && verticalDistance <= maxVerticalDistanceForDrop) {
                    // Movement was clear and close to strip - use calculated target
                    finalTarget = currentTarget.value;
                }

                dragX.value = withSpring(0);
                dragY.value = withSpring(0);
                dragScale.value = withSpring(1);
                activeIndex.value = -1;
                currentTarget.value = -1;

                runOnJS(endDragging)(fromIdx, finalTarget);
            })
            .onFinalize(() => {
                'worklet';
                dragX.value = withSpring(0);
                dragY.value = withSpring(0);
                dragScale.value = withSpring(1);
                activeIndex.value = -1;
                currentTarget.value = -1;
                runOnJS(cancelDragging)();
            });
    }, [imageCount, startDragging, updateTargetIdx, endDragging, cancelDragging]);

    const currentDisplaySize = displaySizes.get(currentIndex) || { width: cropAreaWidth, height: cropAreaHeight };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <GestureHandlerRootView style={styles.container}>
                <SafeAreaView style={styles.container}>
                    <StatusBar style="dark" />

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>
                            {localPhotos.length} Photo{localPhotos.length !== 1 ? 's' : ''}
                        </Text>
                        <TouchableOpacity
                            style={styles.headerButton}
                            onPress={handleDone}
                            disabled={isProcessing || !hasChanges}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="#FFA05C" />
                            ) : (
                                <Text style={[
                                    styles.doneText,
                                    !hasChanges && styles.doneTextDisabled
                                ]}>Done</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Inline Crop Area - Instagram style */}
                    <View
                        style={styles.cropAreaWrapper}
                        onLayout={(event) => {
                            const { height, width } = event.nativeEvent.layout;
                            if (height > 0 && (height !== cropAreaHeight || width !== cropAreaWidth)) {
                                setCropAreaHeight(height);
                                setCropAreaWidth(width);
                                // Clear display sizes to recalculate with new dimensions
                                setDisplaySizes(new Map());
                                setImageDimensions(new Map());
                            }
                        }}
                    >
                        <View style={styles.cropAreaContainer}>
                            {/* The movable/zoomable image */}
                            <GestureDetector gesture={composedGesture}>
                                <Animated.View style={[styles.imageWrapper, animatedImageStyle]}>
                                    {localOriginalPhotos[currentIndex] && (
                                        <Image
                                            source={{ uri: localOriginalPhotos[currentIndex] }}
                                            style={{
                                                width: currentDisplaySize.width,
                                                height: currentDisplaySize.height,
                                            }}
                                            resizeMode="cover"
                                        />
                                    )}
                                </Animated.View>
                            </GestureDetector>

                            {/* Crop Frame Overlay - shows the crop boundary */}
                            <View style={styles.cropOverlay} pointerEvents="none">
                                {/* Top darkened area */}
                                <View style={[styles.cropOverlayDark, {
                                    height: (cropAreaHeight - cropFrameDimensions.height) / 2,
                                    width: '100%',
                                }]} />

                                {/* Middle row with side darkened areas and transparent center */}
                                <View style={{ flexDirection: 'row', height: cropFrameDimensions.height }}>
                                    {/* Left darkened area */}
                                    <View style={[styles.cropOverlayDark, {
                                        width: (cropAreaWidth - cropFrameDimensions.width) / 2,
                                        height: '100%',
                                    }]} />

                                    {/* Transparent center (the crop frame) */}
                                    <View style={[styles.cropFrame, {
                                        width: cropFrameDimensions.width,
                                        height: cropFrameDimensions.height,
                                    }]} />

                                    {/* Right darkened area */}
                                    <View style={[styles.cropOverlayDark, {
                                        width: (cropAreaWidth - cropFrameDimensions.width) / 2,
                                        height: '100%',
                                    }]} />
                                </View>

                                {/* Bottom darkened area */}
                                <View style={[styles.cropOverlayDark, {
                                    height: (cropAreaHeight - cropFrameDimensions.height) / 2,
                                    width: '100%',
                                }]} />
                            </View>

                            {/* Delete button */}
                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePhoto(currentIndex)}
                            >
                                <Ionicons name="close-circle" size={32} color="#FF3B30" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Draggable Thumbnail Strip */}
                    <View style={styles.thumbnailStrip}>
                        {localPhotos.map((item, index) => {
                            const isDragging = draggingIndex === index;
                            const offset = getItemOffset(index, draggingIndex, targetIndex);

                            const visualIndex = draggingIndex !== null && targetIndex !== null
                                ? getVisualIndex(index, draggingIndex, targetIndex)
                                : index;
                            const willBeCover = visualIndex === 0;

                            return (
                                <DraggableThumbnailItem
                                    key={`thumb-${index}`}
                                    item={item}
                                    index={index}
                                    isSelected={currentIndex === index}
                                    isCover={willBeCover}
                                    isDragging={isDragging}
                                    offset={offset}
                                    dragX={dragX}
                                    dragY={dragY}
                                    dragScale={dragScale}
                                    gesture={createThumbnailGesture(index)}
                                    onPress={() => handleThumbnailPress(index)}
                                />
                            );
                        })}

                        {/* Add more button */}
                        {localPhotos.length < MAX_PHOTOS && (
                            <TouchableOpacity
                                style={styles.addMoreButton}
                                onPress={handleAddMorePhotos}
                            >
                                <Ionicons name="add" size={20} color="#FFA05C" />
                            </TouchableOpacity>
                        )}
                    </View>
                </SafeAreaView>
            </GestureHandlerRootView>
        </Modal>
    );
};

// Draggable thumbnail item component
interface DraggableThumbnailItemProps {
    item: string;
    index: number;
    isSelected: boolean;
    isCover: boolean;
    isDragging: boolean;
    offset: number;
    dragX: Animated.SharedValue<number>;
    dragY: Animated.SharedValue<number>;
    dragScale: Animated.SharedValue<number>;
    gesture: ReturnType<typeof Gesture.Pan>;
    onPress: () => void;
}

const DraggableThumbnailItem: React.FC<DraggableThumbnailItemProps> = ({
    item,
    isSelected,
    isCover,
    isDragging,
    offset,
    dragX,
    dragY,
    dragScale,
    gesture,
    onPress,
}) => {
    // Track previous offset to detect changes
    const prevOffset = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => {
        if (isDragging) {
            return {
                transform: [
                    { translateX: dragX.value },
                    { translateY: dragY.value },
                    { scale: dragScale.value },
                ],
                zIndex: 100,
            };
        }
        // Always animate offset changes (both to and from 0)
        return {
            transform: [
                { translateX: withTiming(offset, { duration: 150 }) },
            ],
            zIndex: 0,
        };
    }, [isDragging, offset]);

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.thumbnailWrapper, animatedStyle]}>
                <TouchableOpacity
                    style={[
                        styles.thumbnailContainer,
                        isSelected && styles.thumbnailSelected,
                        isCover && styles.thumbnailIsCover,
                    ]}
                    onPress={onPress}
                    activeOpacity={0.8}
                >
                    <Image source={{ uri: item }} style={styles.thumbnailImage} />
                    {isCover && (
                        <View style={styles.thumbnailCoverBadge}>
                            <Ionicons name="star" size={8} color="#FFD700" />
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        </GestureDetector>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 0.5,
        borderBottomColor: '#E0E0E0',
    },
    headerButton: {
        minWidth: 60,
    },
    headerTitle: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: '600',
        color: '#000000',
    },
    cancelText: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: '400',
        color: '#000000',
    },
    doneText: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: '600',
        color: '#FFA05C',
        textAlign: 'right',
    },
    doneTextDisabled: {
        color: '#CCC',
    },
    cropAreaWrapper: {
        flex: 1,
        backgroundColor: '#000000',
        overflow: 'hidden',
    },
    cropAreaContainer: {
        flex: 1,
        backgroundColor: '#000000',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageWrapper: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 1,
        elevation: 2,
    },
    cropOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },
    cropOverlayDark: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    cropFrame: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    thumbnailStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderTopWidth: 0.5,
        borderTopColor: '#E0E0E0',
        gap: GAP,
    },
    thumbnailWrapper: {
        // Wrapper for animation
    },
    thumbnailContainer: {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(200, 200, 200, 0.3)',
    },
    thumbnailSelected: {
        borderColor: '#FFA05C',
    },
    thumbnailIsCover: {
        borderColor: '#FFD700',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
        borderRadius: 6,
    },
    thumbnailCoverBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 6,
        padding: 2,
    },
    addMoreButton: {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#FFA05C',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 140, 76, 0.08)',
    },
});

export default PhotoReviewModal;
