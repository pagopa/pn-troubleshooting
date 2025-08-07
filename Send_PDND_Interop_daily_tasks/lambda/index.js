import { headStream } from '@smithy/util-stream';
import { eventHandler } from './src/app/handler.js';

export const handler = async(event) => {
  return eventHandler(event);
};

await handler();
