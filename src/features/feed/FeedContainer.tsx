/**
 * @file FeedContainer — Composed container that wires useFeed
 * to all feature-scoped section components.
 *
 * This component is the single composition root for the feed feature.
 * The legacy Feed screen re-exports it for navigation compatibility.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, FlatList, RefreshControl, StatusBar, View } from 'react-native';

import DealCard from '../../components/DealCard';
import { useFeedUIStore } from '../../stores/FeedUIStore';
import type { Deal } from '../../types/deal';
import { STATIC, BRAND } from '../../ui/alf';
import { Box, Text } from '../../ui/primitives';

import {
  CuisineFilterBar,
  FeaturedDealsSection,
  FeedLoadingState,
  FeedEmptyState,
  FeedErrorState,
  FeedSectionDivider,
} from './sections';
import { useFeed } from './useFeed';

interface FeedContainerProps {
  refreshToken?: number;
}

const FeedContainer: React.FC<FeedContainerProps> = ({ refreshToken }) => {
  const ctx = useFeed(refreshToken);
  const reselectReloadRequestId = useFeedUIStore((store) => store.reselectReloadRequestId);
  const endReselectReload = useFeedUIStore((store) => store.endReselectReload);
  const listRef = useRef<FlatList<Deal> | null>(null);
  const lastHandledReselectSignalRef = useRef<string | undefined>(undefined);
  const onRefreshRef = useRef(ctx.onRefresh);
  const scrollOffsetYRef = useRef(0);
  const bounceTranslateY = useRef(new Animated.Value(0)).current;
  const hasReselectTrigger = refreshToken !== undefined || reselectReloadRequestId > 0;
  const reselectSignal = `${refreshToken ?? 'none'}:${reselectReloadRequestId}`;

  useEffect(() => {
    onRefreshRef.current = ctx.onRefresh;
  }, [ctx.onRefresh]);

  useEffect(() => {
    if (!hasReselectTrigger) {
      return;
    }

    bounceTranslateY.stopAnimation();
    bounceTranslateY.setValue(-12);

    Animated.spring(bounceTranslateY, {
      toValue: 0,
      speed: 3,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  }, [hasReselectTrigger, reselectSignal, bounceTranslateY]);

  useEffect(() => {
    if (!hasReselectTrigger) {
      return;
    }

    if (lastHandledReselectSignalRef.current === reselectSignal) {
      return;
    }

    lastHandledReselectSignalRef.current = reselectSignal;

    let cancelled = false;
    const runReselectRefresh = async () => {
      const shouldAnimateScrollToTop = scrollOffsetYRef.current > 20;

      if (shouldAnimateScrollToTop && listRef.current) {
        listRef.current.scrollToOffset({ offset: 0, animated: true });
        await new Promise((resolve) => setTimeout(resolve, 320));
      }

      if (cancelled) {
        return;
      }

      try {
        await onRefreshRef.current();
      } finally {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
        endReselectReload();
      }
    };

    void runReselectRefresh();

    return () => {
      cancelled = true;
      endReselectReload();
    };
  }, [hasReselectTrigger, reselectSignal, endReselectReload]);

  const onRefresh = useCallback(() => {
    void ctx.onRefresh();
  }, [ctx.onRefresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={ctx.state.refreshing}
      onRefresh={onRefresh}
      colors={[BRAND.primary]}
      tintColor={BRAND.primary}
    />
  );

  const listWrapperStyle = useMemo(
    () => ({ transform: [{ translateY: bounceTranslateY }] }),
    [bounceTranslateY],
  );

  const dealsHeader = useMemo(() => (
    <>
      <CuisineFilterBar cuisineFilter={ctx.cuisineFilter} />

      <FeaturedDealsSection
        deals={ctx.communityDeals}
        interactions={ctx.interactions}
      />

      {ctx.communityDeals.length > 0 && ctx.dealsForYou.length > 0 && (
        <FeedSectionDivider />
      )}

      <Box
        row
        justify="space-between"
        align="center"
        pt="xs"
        pb="xs"
        pl="lg"
        pr={10}
      >
        <Text
          size={17}
          weight="bold"
          color={STATIC.black}
          style={{ fontFamily: 'Inter' }}
        >
          💰️ Deals For You
        </Text>
      </Box>
    </>
  ), [ctx.cuisineFilter, ctx.communityDeals, ctx.interactions, ctx.dealsForYou.length]);

  const renderStaticSurface = (surface: React.ReactElement) => (
    <Animated.View style={[{ flex: 1 }, listWrapperStyle]}>
      <FlatList
        key="feed-static-list"
        data={['state']}
        keyExtractor={(item) => item}
        renderItem={() => surface}
        numColumns={1}
        style={{ flex: 1, backgroundColor: STATIC.white }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustsScrollIndicatorInsets={false}
      />
    </Animated.View>
  );

  // Priority 1: While location context is doing its initial load OR still loading location
  if (ctx.location.isInitialLoad || ctx.location.isLocationLoading) {
    return (
      <Box flex={1} bg={STATIC.white}>
        <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
        {renderStaticSurface(<FeedLoadingState />)}
      </Box>
    );
  }

  // Priority 2: Handle errors
  if (ctx.state.error) {
    return (
      <Box flex={1} bg={STATIC.white}>
        <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
        {renderStaticSurface(<FeedErrorState message={ctx.state.error} onRetry={ctx.loadDeals} />)}
      </Box>
    );
  }

  // Priority 3: Show skeleton if we are fetching deals for the first time
  if (ctx.state.loading && ctx.state.deals.length === 0) {
    return (
      <Box flex={1} bg={STATIC.white}>
        <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
        {renderStaticSurface(<FeedLoadingState />)}
      </Box>
    );
  }

  // Priority 4: No location set and no deals loaded
  if (!ctx.location.hasLocationSet && ctx.state.deals.length === 0) {
    return (
      <Box flex={1} bg={STATIC.white}>
        <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
        {renderStaticSurface(<FeedEmptyState reason="needs_location" />)}
      </Box>
    );
  }

  // Priority 5: Filters result in no deals
  if (ctx.state.filteredDeals.length === 0) {
    return (
      <Box flex={1} bg={STATIC.white}>
        <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
        {renderStaticSurface(<FeedEmptyState reason="no_deals" />)}
      </Box>
    );
  }

  const renderDealItem = ({ item, index }: { item: Deal; index: number }) => (
    <View style={index % 2 === 0 ? { marginBottom: 0, marginRight: 2 } : { marginTop: 0, marginLeft: 2 }}>
      <DealCard
        deal={item}
        variant="vertical"
        onUpvote={ctx.interactions.handleUpvote}
        onDownvote={ctx.interactions.handleDownvote}
        onFavorite={ctx.interactions.handleFavorite}
        onPress={ctx.interactions.handleDealPress}
      />
    </View>
  );

  return (
    <Box flex={1} bg={STATIC.white}>
      <StatusBar barStyle="dark-content" backgroundColor={STATIC.white} />
      <Animated.View style={[{ flex: 1 }, listWrapperStyle]}>
        <FlatList
          key="feed-grid-list"
          ref={listRef}
          data={ctx.dealsForYou}
          keyExtractor={(item) => item.id}
          renderItem={renderDealItem}
          numColumns={2}
          ListHeaderComponent={dealsHeader}
          style={{ flex: 1, backgroundColor: STATIC.white }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          columnWrapperStyle={{ paddingHorizontal: 10 }}
          refreshControl={refreshControl}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={false}
          onScroll={(event) => {
            scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
        />
      </Animated.View>
    </Box>
  );
};

export default FeedContainer;
