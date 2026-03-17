import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Image, ImageProps, PixelRatio, Dimensions } from 'react-native';

import { getOptimalImageVariant, getImageUrl } from '../services/imageProcessingService';
import type { ImageVariants, VariantContext } from '../types/image';

// Static set to track preloaded images
const preloadedImages = new Set<string>();

/**
 * Preload an image before displaying it
 */
export const preloadImage = async (imageSource: any, variants?: ImageVariants, displaySize?: { width: number; height: number }) => {
  try {
    let uriToLoad = '';
    
    // If we have variants, get the optimal variant
    if (variants && displaySize) {
      const context: VariantContext = {
        componentType: 'deal',
        displaySize,
        devicePixelRatio: PixelRatio.get(),
        screenWidth: Dimensions.get('window').width,
      };
      const optimalVariant = getOptimalImageVariant(variants, context);
      if (!optimalVariant || optimalVariant.trim() === '') {
        console.warn('No valid variant found for preload');
        return;
      }
      uriToLoad = getImageUrl(optimalVariant);
    } else {
      // Fallback to original image source
      if (typeof imageSource === 'string') {
        uriToLoad = imageSource;
      } else {
        const resolved = Image.resolveAssetSource(imageSource);
        uriToLoad = resolved.uri;
      }
    }
    
    // Validate URI before prefetching to prevent nil URIs
    if (!uriToLoad || uriToLoad.trim() === '') {
      console.warn('Cannot preload image: invalid URI');
      return;
    }
    
    if (uriToLoad && !preloadedImages.has(uriToLoad)) {
      console.log('🖼️ Preloading image:', uriToLoad);
      await Image.prefetch(uriToLoad);
      preloadedImages.add(uriToLoad);
      console.log('✅ Image preloaded:', uriToLoad);
    }
  } catch (error) {
    console.error('Error preloading image:', error);
  }
};

interface OptimizedImageProps extends Omit<ImageProps, 'source'> {
  variants: ImageVariants;
  componentType: 'profile' | 'deal' | 'restaurant' | 'franchise_logo';
  displaySize: { width: number; height: number };
  fallbackSource?: any;
  networkType?: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  variants,
  componentType,
  displaySize,
  fallbackSource,
  networkType,
  ...props
}) => {
  const [currentVariant, setCurrentVariant] = useState<string>('');
  const [imageError, setImageError] = useState(false);

  const getSourceUri = (source: any): string => {
    if (!source) return '';
    if (typeof source === 'number') return String(source);
    if (typeof source === 'object' && typeof source.uri === 'string') return source.uri;
    return '';
  };

  const computedImageSource = useMemo(() => {
    if (imageError && fallbackSource) {
      return fallbackSource;
    }

    const source = currentVariant && currentVariant.trim() !== ''
      ? (() => {
          const uri = getImageUrl(currentVariant);
          if (!uri || uri.trim() === '') {
            return fallbackSource;
          }
          return { uri };
        })()
      : fallbackSource;

    if (!source || (typeof source === 'object' && 'uri' in source && (!source.uri || source.uri.trim() === ''))) {
      return fallbackSource ?? null;
    }

    return source;
  }, [currentVariant, fallbackSource, imageError]);

  const [displaySource, setDisplaySource] = useState<any>(computedImageSource);
  const displaySourceRef = useRef<any>(computedImageSource);

  useEffect(() => {
    displaySourceRef.current = displaySource;
  }, [displaySource]);
  
  useEffect(() => {
    const context: VariantContext = {
      componentType,
      displaySize,
      devicePixelRatio: PixelRatio.get(),
      screenWidth: Dimensions.get('window').width,
      networkType
    };
    
    const optimalVariant = getOptimalImageVariant(variants, context);
    setCurrentVariant(optimalVariant);
    setImageError(false);
  }, [variants, componentType, displaySize, networkType]);

  useEffect(() => {
    if (!computedImageSource) {
      if (!displaySourceRef.current) {
        setDisplaySource(null);
      }
      return;
    }

    const nextUri = getSourceUri(computedImageSource);
    const currentUri = getSourceUri(displaySourceRef.current);
    if (nextUri && nextUri === currentUri) {
      return;
    }

    let cancelled = false;
    const applySource = () => {
      if (!cancelled) {
        setDisplaySource(computedImageSource);
      }
    };

    if (nextUri.startsWith('http://') || nextUri.startsWith('https://')) {
      Image.prefetch(nextUri)
        .catch(() => undefined)
        .finally(applySource);
      return () => {
        cancelled = true;
      };
    }

    applySource();
    return () => {
      cancelled = true;
    };
  }, [computedImageSource]);
  
  const handleError = () => {
    // Try fallback to smaller variant
    if (currentVariant === variants.large && variants.medium) {
      setCurrentVariant(variants.medium);
    } else if (currentVariant === variants.medium && variants.small) {
      setCurrentVariant(variants.small);
    } else if (currentVariant === variants.small && variants.thumbnail) {
      setCurrentVariant(variants.thumbnail);
    } else if (variants.original) {
      setCurrentVariant(variants.original);
    } else {
      setImageError(true);
    }
  };
  
  if (!displaySource) {
    return null;
  }
  
  return (
    <Image
      {...props}
      source={displaySource}
      onError={handleError}
    />
  );
};

export default OptimizedImage;
