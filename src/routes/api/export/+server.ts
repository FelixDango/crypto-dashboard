import {
  exportOpenLotsToCsv,
  exportPortfolioSnapshotsToCsv,
  exportRealizedPnlToCsv,
  exportTransactionsToCsv
} from '$lib/server/csv';
import { listTransactions } from '$lib/server/transactions';
import type { RequestHandler } from './$types';

const exports = {
  transactions: {
    filename: 'transactions.csv',
    create: () => exportTransactionsToCsv(listTransactions())
  },
  'open-lots': {
    filename: 'open-lots.csv',
    create: exportOpenLotsToCsv
  },
  'average-cost-positions': {
    filename: 'average-cost-positions.csv',
    create: exportOpenLotsToCsv
  },
  'realized-pnl': {
    filename: 'realized-pnl.csv',
    create: exportRealizedPnlToCsv
  },
  'portfolio-snapshots': {
    filename: 'portfolio-snapshots.csv',
    create: exportPortfolioSnapshotsToCsv
  }
} as const;

type ExportType = keyof typeof exports;

function parseExportType(value: string | null): ExportType {
  return value && value in exports ? (value as ExportType) : 'transactions';
}

export const GET: RequestHandler = ({ url }) => {
  const exportType = parseExportType(url.searchParams.get('type'));
  const selected = exports[exportType];
  const csv = selected.create();

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${selected.filename}"`
    }
  });
};
