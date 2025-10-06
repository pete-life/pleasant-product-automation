import type { sheets_v4 } from 'googleapis';
import { config } from '../env';
import { logger } from '../logger';
import { SHEET_TABS, COLUMN_NAMES, APPROVED_VALUES, STATUS } from '../config/constants';
import {
  SheetRowSchema,
  type SheetRow,
  type HeaderMap,
  type LogEntry,
  type ErrorEntry,
  LogEntrySchema,
  ErrorEntrySchema
} from '../config/schemas';
import { getSheetsClient } from './auth';
import { withBackoff } from '../utils/backoff';
import { nowIso } from '../utils/dates';
import { isDefined } from '../utils/guard';

const PRODUCTS_RANGE = `${SHEET_TABS.PRODUCTS}!A:ZZ`;
const LOGS_RANGE = `${SHEET_TABS.LOGS}!A:D`;
const ERRORS_RANGE = `${SHEET_TABS.ERRORS}!A:F`;
const CONFIG_RANGE = `${SHEET_TABS.CONFIG}!A:B`;

function sanitizeCell(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  const stringified = String(value).trim();
  return stringified.length ? stringified : undefined;
}

function toHeaderMap(headerRow: string[]): HeaderMap {
  return headerRow.reduce<HeaderMap>((acc, header, index) => {
    if (!header) return acc;
    acc[header] = index;
    return acc;
  }, {});
}

function buildRowArray(headerRow: string[], values: Record<string, string | undefined>): string[] {
  return headerRow.map((header) => values[header] ?? '');
}

function columnIndexToLetter(index: number): string {
  const adjusted = index + 1;
  let letters = '';
  let temp = adjusted;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    temp = Math.floor((temp - 1) / 26);
  }
  return letters;
}

export interface ProductsSheetSnapshot {
  headerRow: string[];
  headerMap: HeaderMap;
  rows: SheetRow[];
}

export async function fetchProductsSheet(): Promise<ProductsSheetSnapshot> {
  const sheets = await getSheetsClient();
  const response = await withBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: PRODUCTS_RANGE,
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
  );

  const values = response.data.values ?? [];
  if (values.length === 0) {
    return { headerRow: [], headerMap: {}, rows: [] };
  }

  const headerRow = values[0] as string[];
  const dataRows = values.slice(1) as (string | null | undefined)[][];
  const headerMap = toHeaderMap(headerRow);
  const rows: SheetRow[] = [];

  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 2;
    const raw: Record<string, unknown> = {
      rowNumber,
      headerMap
    };

    headerRow.forEach((header, colIdx) => {
      if (!header) return;
      raw[header] = sanitizeCell(cells[colIdx]);
    });

    const parsed = SheetRowSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ rowNumber, issues: parsed.error.issues }, 'Skipping row due to schema mismatch');
      return;
    }

    rows.push(parsed.data);
  });

  return { headerRow, headerMap, rows };
}

function getCell(
  cells: (string | null | undefined)[],
  headerMap: HeaderMap,
  column: string
): string | undefined {
  const index = headerMap[column];
  if (index === undefined) return undefined;
  return sanitizeCell(cells[index]);
}

export async function getApprovedRowsNeedingCreate(): Promise<SheetRow[]> {
  const { rows } = await fetchProductsSheet();

  return rows.filter((row) => {
    const status = row[COLUMN_NAMES.STATUS]?.toUpperCase();
    const hasShopifyId = Boolean(row[COLUMN_NAMES.SHOPIFY_PRODUCT_ID]);
    const productKey = row[COLUMN_NAMES.PRODUCT_KEY];
    return (
      Boolean(productKey) &&
      !hasShopifyId &&
      status !== undefined &&
      APPROVED_VALUES.includes(status as (typeof APPROVED_VALUES)[number])
    );
  });
}

export async function updateRowWithProductId(
  row: SheetRow,
  productId: string,
  extraUpdates?: Record<string, string | undefined>
): Promise<void> {
  const updates: Record<string, string | undefined> = {
    [COLUMN_NAMES.SHOPIFY_PRODUCT_ID]: productId,
    [COLUMN_NAMES.STATUS]: STATUS.CREATED,
    [COLUMN_NAMES.UPDATED_AT]: nowIso()
  };

  if (extraUpdates) {
    for (const [key, value] of Object.entries(extraUpdates)) {
      updates[key] = value;
    }
  }

  await updateRowValues(row, updates);
}

export async function updateRowValues(
  row: SheetRow,
  updates: Record<string, string | undefined>
): Promise<void> {
  const data = Object.entries(updates)
    .map(([column, value]) => {
      const columnIndex = row.headerMap[column];
      if (columnIndex === undefined) {
        return null;
      }
      const columnLetter = columnIndexToLetter(columnIndex);
      return {
        range: `${SHEET_TABS.PRODUCTS}!${columnLetter}${row.rowNumber}`,
        values: [[value ?? '']]
      };
    })
    .filter(isDefined);

  if (data.length === 0) {
    logger.warn({ updates }, 'No matching columns found for update');
    return;
  }

  const sheets = await getSheetsClient();
  await withBackoff(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    })
  );
}

export async function ensureDraftRow(
  productKey: string,
  options: { rowId?: string } = {}
): Promise<SheetRow> {
  const snapshot = await fetchProductsSheet();
  const existing = snapshot.rows.find((row) =>
    (row[COLUMN_NAMES.PRODUCT_KEY] ?? '').toString().toLowerCase() === productKey.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  if (!snapshot.headerRow.length) {
    throw new Error('Products sheet is missing headers; cannot create draft row');
  }

  const rowId = options.rowId ?? productKey;
  const createdAt = nowIso();
  const baseValues: Record<string, string | undefined> = {
    [COLUMN_NAMES.PRODUCT_KEY]: productKey,
    [COLUMN_NAMES.STATUS]: STATUS.PENDING,
    [COLUMN_NAMES.ROW_ID]: rowId,
    [COLUMN_NAMES.CREATED_AT]: createdAt,
    [COLUMN_NAMES.UPDATED_AT]: createdAt
  };

  const valuesArray = buildRowArray(snapshot.headerRow, baseValues);

  const sheets = await getSheetsClient();
  await withBackoff(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: PRODUCTS_RANGE,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [valuesArray] }
    })
  );

  const refreshed = await fetchProductsSheet();
  const created = refreshed.rows.find((row) =>
    (row[COLUMN_NAMES.PRODUCT_KEY] ?? '').toString().toLowerCase() === productKey.toLowerCase()
  );
  if (!created) {
    throw new Error(`Failed to locate draft row for productKey ${productKey}`);
  }
  return created;
}

export async function writeLogs(entries: LogEntry[]): Promise<void> {
  if (!entries.length) return;

  const rows = entries.map((entry) => {
    const parsed = LogEntrySchema.parse(entry);
    return [parsed.timestamp, parsed.action, parsed.productKey ?? '', parsed.message];
  });

  const sheets = await getSheetsClient();
  await withBackoff(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: LOGS_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows }
    })
  );
}

export async function writeError(entry: ErrorEntry): Promise<void> {
  const parsed = ErrorEntrySchema.parse(entry);
  const row = [
    parsed.timestamp,
    parsed.productKey ?? '',
    parsed.step,
    parsed.message,
    parsed.hint ?? '',
    parsed.payloadSnippet ?? ''
  ];

  const sheets = await getSheetsClient();
  await withBackoff(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: ERRORS_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    })
  );
}

export async function getConfigKey(key: string): Promise<string | undefined> {
  const sheets = await getSheetsClient();
  const response = await withBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: CONFIG_RANGE,
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
  );

  const values = response.data.values ?? [];
  for (const row of values) {
    if (row[0] === key) {
      return sanitizeCell(row[1]);
    }
  }
  return undefined;
}

export async function setConfigKey(key: string, value: string): Promise<void> {
  const sheets = await getSheetsClient();
  const response = await withBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: CONFIG_RANGE,
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
  );

  const values = response.data.values ?? [];
  const existingIndex = values.findIndex((row) => row[0] === key);

  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 1;
    await withBackoff(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${SHEET_TABS.CONFIG}!B${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] }
      })
    );
  } else {
    await withBackoff(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: config.google.sheetId,
        range: CONFIG_RANGE,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[key, value]] }
      })
    );
  }
}

export async function getRowByProductKey(productKey: string): Promise<SheetRow | undefined> {
  const normalizedKey = productKey.trim().toLowerCase();
  if (!normalizedKey) return undefined;
  const { rows } = await fetchProductsSheet();
  return rows.find((row) => (row[COLUMN_NAMES.PRODUCT_KEY] ?? '').toLowerCase() === normalizedKey);
}
