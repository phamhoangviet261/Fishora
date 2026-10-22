import { config } from 'dotenv';

config({ path: '.env.local' });
process.env.FISHORA_CONFIG_PROFILE = 'test';
