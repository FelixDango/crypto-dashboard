import { APP_NAME } from '$lib/env';
import { getAppSettings } from '$lib/server/settings';

export function load() {
  return {
    appName: APP_NAME,
    settings: getAppSettings()
  };
}
