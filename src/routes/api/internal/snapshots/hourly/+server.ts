import type { RequestHandler } from './$types';
import { createInternalSnapshotResponse } from '$lib/server/portfolio/internalSnapshotRoute';

export const POST: RequestHandler = (event) => createInternalSnapshotResponse(event, 'hourly');
