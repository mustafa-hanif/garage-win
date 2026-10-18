import React from 'react';
import { Composition } from 'remotion';
import { GaragePro, totalFrames, FPS } from './Video';

export const Root: React.FC = () => (
  <Composition id="GaragePro" component={GaragePro} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />
);
