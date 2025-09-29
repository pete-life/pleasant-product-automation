import { google, drive_v3, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from '../env';
import { logger } from '../logger';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

let authClient: JWT | null = null;
let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

async function createAuthClient(): Promise<JWT> {
  const client = new google.auth.JWT({
    email: config.google.clientEmail,
    key: config.google.privateKey,
    scopes: SCOPES,
    subject: undefined
  });

  await client.authorize();
  logger.debug('Initialized Google service account client');
  return client;
}

export async function getAuthClient(): Promise<JWT> {
  if (!authClient) {
    authClient = await createAuthClient();
  }
  return authClient;
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (!sheetsClient) {
    const auth = await getAuthClient();
    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}

export async function getDriveClient(): Promise<drive_v3.Drive> {
  if (!driveClient) {
    const auth = await getAuthClient();
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}
