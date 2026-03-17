/**
 * @file FeedContainer — Composed container that wires useFeed
 * to all feature-scoped section components.
 *
 * This component is the single composition root for the feed feature.
 * The legacy Feed screen re-exports it for navigation compatibility.
 */

import React from 'react';
import { View, FlatList, StatusBar, RefreshControl } from 'react-native';

import DealCard from '../../components/DealCard';
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

const FeedContainer: React.FC = () => {
  const ctx = useFeed();
  const refreshControl = (
    <RefreshControl
      refreshing={ctx.state.refreshing}
      onRefresh={ctx.onRefresh}
      colors={[BRAND.primary]}
      tintColor={BRAND.primary}
    />
  );

  const renderStaticSurface = (surface: React.ReactElement) => (
    <FlatList
      key="feed-static-list"
      data={['state']}
      keyExtractor={(item) => item}
      renderItem={() => surface}
      numColumns={1}
      style={{ flex: 1, backgroundColor: STATIC.white, paddingTop: 4 }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    />
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

  const renderDealsHeader = () => (
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
  );

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
      <FlatList
        key="feed-grid-list"
        data={ctx.dealsForYou}
        keyExtractor={(item) => item.id}
        renderItem={renderDealItem}
        numColumns={2}
        ListHeaderComponent={renderDealsHeader}
        style={{ flex: 1, backgroundColor: STATIC.white, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        columnWrapperStyle={{ paddingHorizontal: 10 }}
        refreshControl={refreshControl}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={false}
      />
    </Box>
  );
};

export default FeedContainer;
