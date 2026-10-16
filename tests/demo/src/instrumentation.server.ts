import * as Sentry from '@sentry/sveltekit';
import { sentryOptions } from '#lib/sentry-options.js';

import { observeServerEvent } from '#lib/adapter/server/sentry-e2e.ts';

Sentry.init({ ...sentryOptions, beforeSend: observeServerEvent });
