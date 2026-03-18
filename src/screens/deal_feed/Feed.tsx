/**
 * Feed — Legacy wrapper export
 *
 * This file is retained solely for navigation compatibility.
 * All logic and UI live in the feed feature module.
 *
 * @see features/feed/FeedContainer
 */

import React from 'react';

import FeedContainer from '../../features/feed/FeedContainer';

interface FeedProps {
	refreshToken?: number;
}

const Feed: React.FC<FeedProps> = ({ refreshToken }) => {
	return <FeedContainer refreshToken={refreshToken} />;
};

export default Feed;
