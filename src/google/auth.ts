import { google, drive_v3, sheets_v4 } from 'googleapis';
import { GoogleAuth, JWT, OAuth2Client } from 'google-auth-library';
import { config } from '../env';
import { logger } from '../logger';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

type AuthClient = JWT | OAuth2Client;

let authClient: AuthClient | null = null;
let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

async function createAuthClient(): Promise<AuthClient> {
  if (config.google.clientEmail && config.google.privateKey) {
    const client = new google.auth.JWT({
      email: config.google.clientEmail,
      key: config.google.privateKey,
      scopes: SCOPES,
      subject: undefined
    });

    await client.authorize();
    logger.debug('Initialized Google service account client from env private key');
    return client;
  }

  const auth = new GoogleAuth({ scopes: SCOPES });
  const client = (await auth.getClient()) as OAuth2Client;
  logger.debug('Initialized Google auth client using default credentials');
  return client;
}

export async function getAuthClient(): Promise<AuthClient> {
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
