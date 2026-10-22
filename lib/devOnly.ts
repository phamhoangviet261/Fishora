import { json } from '@/lib/api';

/** E2E-only endpoints answer 404 unless the server was started with FISHORA_E2E=1. */
export const devOnly = () => (process.env.FISHORA_E2E === '1' ? null : json(404, { error: 'not_found' }));
