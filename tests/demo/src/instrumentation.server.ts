import * as Sentry from '@sentry/sveltekit';
import { sentryOptions } from '#lib/sentry-options.js';

Sentry.init(sentryOptions);
