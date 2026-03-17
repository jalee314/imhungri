import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useDealUpdate } from '../hooks/useDealUpdate';
import { BRAND, SEMANTIC, STATIC } from '../ui/alf';

const PostUploadProgressBar: React.FC = () => {
  const postUploadStatus = useDealUpdate((state) => state.postUploadStatus);
  const postUploadProgress = useDealUpdate((state) => state.postUploadProgress);
  const [isVisible, setIsVisible] = React.useState(false);
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (postUploadStatus !== 'idle') {
      if (!isVisible) {
        setIsVisible(true);
        animatedHeight.setValue(0);
        animatedOpacity.setValue(0);
        Animated.parallel([
          Animated.timing(animatedHeight, {
            toValue: 3,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(animatedOpacity, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ]).start();
      }

      Animated.timing(animatedProgress, {
        toValue: Math.max(0, Math.min(1, postUploadProgress)),
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      return;
    }

    if (!isVisible) {
      return;
    }

    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => {
      animatedProgress.setValue(0);
      setIsVisible(false);
    });
  }, [
    postUploadStatus,
    postUploadProgress,
    isVisible,
    animatedProgress,
    animatedHeight,
    animatedOpacity,
  ]);

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View style={[styles.uploadTrack, { height: animatedHeight, opacity: animatedOpacity }]}> 
      <Animated.View
        style={[
          styles.uploadFill,
          {
            width: animatedProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
            backgroundColor:
              postUploadStatus === 'success' ? SEMANTIC.success : BRAND.primary,
          },
        ]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  uploadTrack: {
    width: '100%',
    height: 3,
    backgroundColor: STATIC.white,
  },
  uploadFill: {
    height: '100%',
  },
});

export default React.memo(PostUploadProgressBar);
