/**
 * @file FeaturedDealsSection — Horizontal carousel of featured deals
 * with a section header and "see all" arrow.
 *
 * Purely presentational. State & callbacks come from useFeed.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { memo, useCallback } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';

import DealCard from '../../../components/DealCard';
import type { Deal } from '../../../types/deal';
import {
  STATIC,
  GRAY,
  SPACING,
  RADIUS,
} from '../../../ui/alf';
import { Box, Text } from '../../../ui/primitives';
import type { FeedInteractions } from '../types';

export interface FeaturedDealsSectionProps {
  deals: Deal[];
  interactions: FeedInteractions;
}

const renderItemSeparator = () => <View style={{ width: 0 }} />;

function FeaturedDealsSectionComponent({ deals, interactions }: FeaturedDealsSectionProps) {
  const navigation = useNavigation();

  const renderCommunityDeal = useCallback(
    ({ item }: { item: Deal }) => (
      <DealCard
        deal={item}
        variant="horizontal"
        onUpvote={interactions.handleUpvote}
        onDownvote={interactions.handleDownvote}
        onFavorite={interactions.handleFavorite}
        onPress={interactions.handleDealPress}
      />
    ),
    [interactions],
  );

  const handleSeeAllPress = useCallback(() => {
    navigation.navigate('CommunityUploaded' as never);
  }, [navigation]);

  if (deals.length === 0) return null;

  return (
    <>
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
          ✨ Featured Deals
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: GRAY[100],
            borderRadius: RADIUS.full,
            width: 30,
            height: 30,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={handleSeeAllPress}
        >
          <MaterialCommunityIcons name="arrow-right" size={20} color="#404040" />
        </TouchableOpacity>
      </Box>

      <FlatList
        data={deals}
        renderItem={renderCommunityDeal}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 10.5, paddingRight: SPACING.md }}
        ItemSeparatorComponent={renderItemSeparator}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
      />
    </>
  );
}

export const FeaturedDealsSection = memo(FeaturedDealsSectionComponent);
